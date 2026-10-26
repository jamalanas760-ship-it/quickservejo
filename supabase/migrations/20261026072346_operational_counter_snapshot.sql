begin;
-- One round trip, caller RLS, no privileged count of another restaurant's rows.
create or replace function public.get_operational_counters(_restaurant_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare unread bigint; workforce_unread bigint; tasks bigint; shifts bigint; orders bigint; day date; tz text;
begin
  if auth.uid() is null or not (public.is_platform_owner() or exists(
    select 1 from public.staff where restaurant_id=_restaurant_id and auth_user_id=auth.uid() and is_active
  )) then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(nullif(timezone,''),'UTC') into tz from public.restaurants where id=_restaurant_id;
  day := (now() at time zone coalesce(tz,'UTC'))::date;
  select count(*), count(*) filter(where kind='shift' or source_type in
    ('missing_punch_request','staff_leave_request','workforce_permission_request','workforce','workforce_alert'))
    into unread,workforce_unread from public.visible_notifications
    where restaurant_id=_restaurant_id and read_at is null;
  select count(*) into tasks from public.work_tasks where restaurant_id=_restaurant_id and deleted_at is null and status in ('open','in_progress','waiting_approval');
  select count(*) into shifts from public.shifts where restaurant_id=_restaurant_id and deleted_at is null and status in ('planned','open') and shift_date between day and day+1;
  orders := public.unseen_order_count(_restaurant_id);
  return jsonb_build_object('unread',unread,'workforceUnread',workforce_unread,'tasks',tasks,'shifts',shifts,'orders',orders,'total',unread+tasks+orders);
end $$;
revoke all on function public.get_operational_counters(uuid) from public,anon;
grant execute on function public.get_operational_counters(uuid) to authenticated;
commit;

-- Designed for unauthenticated uptime probes. No access to application records.
create or replace function public.quickserve_readiness()
returns boolean language sql volatile security invoker set search_path='' as 'select true';
revoke all on function public.quickserve_readiness() from public;
grant execute on function public.quickserve_readiness() to anon,authenticated,service_role;
