begin;
CREATE OR REPLACE FUNCTION app.has_capability(_restaurant_id uuid, _capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select app.is_super_admin() or exists (
    select 1
      from public.staff s
     where s.auth_user_id = (select auth.uid())
       and s.is_active
       and s.restaurant_id = _restaurant_id
       and (
         case s.role::text
           when 'restaurant_admin' then _capability = any(array['manage_restaurant','manage_menu','manage_tables','manage_staff','manage_appearance','view_analytics','view_orders','view_order_prices','update_order_status','manage_payments','handle_waiter_calls','view_work','create_work','manage_work','approve_work','view_erp','manage_inventory','manage_procurement','manage_finance','manage_shifts'])
           when 'operations_manager' then _capability = any(array['manage_menu','manage_tables','view_analytics','view_orders','view_order_prices','update_order_status','handle_waiter_calls','view_work','create_work','manage_work','approve_work','view_erp','manage_inventory','manage_procurement','manage_shifts'])
           when 'manager' then _capability = any(array['manage_menu','manage_tables','view_analytics','view_orders','view_order_prices','update_order_status','handle_waiter_calls','view_work','create_work','manage_work','approve_work','manage_shifts'])
           when 'kitchen' then _capability = any(array['view_orders','update_order_status','view_work','create_work'])
           when 'waiter' then _capability = any(array['view_orders','view_order_prices','update_order_status','manage_tables','handle_waiter_calls','view_work','create_work'])
           when 'cashier' then _capability = any(array['view_orders','view_order_prices','manage_payments','view_work','create_work'])
           when 'host' then _capability = any(array['view_orders','manage_tables','handle_waiter_calls','view_work','create_work'])
           when 'inventory' then _capability = any(array['view_work','create_work','view_erp','manage_inventory'])
           when 'procurement' then _capability = any(array['view_work','create_work','view_erp','manage_procurement'])
           when 'hr' then _capability = any(array['view_work','create_work','manage_shifts'])
           when 'accountant' then _capability = any(array['view_work','create_work','view_erp','manage_finance','view_analytics','view_order_prices'])
           else false
         end
       )
       and case when jsonb_typeof(s.permission_overrides -> _capability) = 'boolean' then (s.permission_overrides ->> _capability)::boolean else true end
  );
$function$;

create or replace function app.detect_missing_clock_outs(_restaurant_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare e public.staff_time_entries%rowtype; a record; _end timestamptz; _extended timestamptz;
  _id uuid; _staff_name text; _recipient record; _count integer:=0;
begin
  for e in select t.* from public.staff_time_entries t
    join public.staff s on s.id=t.staff_id and s.restaurant_id=t.restaurant_id and s.is_active
    where t.clock_out is null and t.review_status<>'rejected'
      and (_restaurant_id is null or t.restaurant_id=_restaurant_id)
      and exists(select 1 from public.shift_assignments x join public.shifts h on h.id=x.shift_id and h.restaurant_id=x.restaurant_id where x.restaurant_id=t.restaurant_id and x.staff_id=t.staff_id and x.status<>'released' and h.deleted_at is null and coalesce(x.starts_at,h.planned_start)<=t.clock_in+interval '4 hours' and coalesce(x.ends_at,h.planned_end)>t.clock_in and coalesce(x.ends_at,h.planned_end)+interval '15 minutes'<=now())
      and not exists(select 1 from public.staff_missing_punch_requests r where r.time_entry_id=t.id and r.origin='automatic')
    order by t.clock_in limit 500 for update of t skip locked loop
    select x.id,coalesce(x.ends_at,h.planned_end) as ends_at into a
      from public.shift_assignments x join public.shifts h on h.id=x.shift_id and h.restaurant_id=x.restaurant_id
      where x.restaurant_id=e.restaurant_id and x.staff_id=e.staff_id and x.status<>'released' and h.deleted_at is null
        and coalesce(x.starts_at,h.planned_start)<=e.clock_in+interval '4 hours'
        and coalesce(x.ends_at,h.planned_end)>e.clock_in
        and coalesce(x.starts_at,h.planned_start)<coalesce(x.ends_at,h.planned_end)
      order by abs(extract(epoch from (coalesce(x.starts_at,h.planned_start)-e.clock_in))) limit 1;
    if not found then continue; end if;
    _end:=a.ends_at;
    -- A continuous second assignment extends the workday rather than raising a false missing punch.
    loop
      select max(coalesce(x.ends_at,h.planned_end)) into _extended
      from public.shift_assignments x join public.shifts h on h.id=x.shift_id and h.restaurant_id=x.restaurant_id
      where x.restaurant_id=e.restaurant_id and x.staff_id=e.staff_id and x.status<>'released' and h.deleted_at is null
        and coalesce(x.starts_at,h.planned_start)<=_end+interval '15 minutes'
        and coalesce(x.ends_at,h.planned_end)>_end;
      exit when _extended is null; _end:=_extended;
    end loop;
    if _end+interval '15 minutes'>now() then continue; end if;
    insert into public.staff_missing_punch_requests(restaurant_id,staff_id,clock_in,clock_out,break_minutes,reason,origin,time_entry_id,assignment_id,scheduled_end)
      values(e.restaurant_id,e.staff_id,e.clock_in,_end,e.break_minutes,
        'No clock-out recorded after the scheduled shift and 15-minute grace period. HR must confirm missing punch or overtime.',
        'automatic',e.id,a.id,_end)
      on conflict(time_entry_id) where origin='automatic' do nothing returning id into _id;
    if _id is null then continue; end if;
    select name into _staff_name from public.staff where id=e.staff_id;
    for _recipient in select s.id from public.staff s where s.restaurant_id=e.restaurant_id and s.is_active and s.id<>e.staff_id
      and s.role::text in ('restaurant_admin','operations_manager','manager','hr')
      and coalesce(s.permission_overrides->>'manage_shifts','true')<>'false' loop
      insert into public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key)
      values(e.restaurant_id,_recipient.id,'approval','Missing clock-out · HR review',
        coalesce(_staff_name,'Team member')||' has not clocked out. Confirm the actual end time or approve overtime.',
        'missing_punch_request',_id,'auto-clock-out:'||_id||':'||_recipient.id)
      on conflict(restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
    end loop;
    insert into public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key)
      values(e.restaurant_id,e.staff_id,'shift','Clock-out needs review',
        'Your shift has ended and no clock-out is recorded. If you are still working, clock out when finished; HR will review any overtime.',
        'missing_punch_request',_id,'auto-clock-out-staff:'||_id)
      on conflict(restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
    insert into public.audit_logs(restaurant_id,action,entity,entity_id,metadata)
      values(e.restaurant_id,'missing_clock_out_detected','staff_missing_punch_request',_id,jsonb_build_object('time_entry_id',e.id,'scheduled_end',_end,'grace_minutes',15));
    _count:=_count+1;
  end loop;
  return _count;
end; $$;
revoke all on function app.detect_missing_clock_outs(uuid) from public,anon,authenticated;


create policy hr_workforce_read on public.staff for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_workforce_read on public.staff_time_entries for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_workforce_read on public.staff_leave_requests for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_workforce_read on public.staff_permission_requests for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_workforce_read on public.staff_missing_punch_requests for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_workforce_read on public.shift_assignments for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_workforce_read on public.shifts for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_workforce_read on public.recurring_staff_schedules for select to authenticated using (app.has_capability(restaurant_id,'manage_shifts'));
notify pgrst,'reload schema';
commit;

