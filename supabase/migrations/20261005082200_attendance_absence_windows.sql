begin;
create or replace function app.send_attendance_reminders(_restaurant_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare event record; _count integer:=0; _rows integer;
begin
  for event in
    with planned as (
      select a.id,a.restaurant_id,a.staff_id,s.name,coalesce(r.timezone,'Asia/Amman') as tz,
        coalesce(a.starts_at,h.planned_start) as starts_at,coalesce(a.ends_at,h.planned_end) as ends_at
      from public.shift_assignments a join public.shifts h on h.id=a.shift_id and h.restaurant_id=a.restaurant_id
      join public.staff s on s.id=a.staff_id and s.restaurant_id=a.restaurant_id and s.is_active
      join public.restaurants r on r.id=a.restaurant_id and r.is_active and r.archived_at is null
      where a.status not in ('released','absent') and h.deleted_at is null
        and (_restaurant_id is null or a.restaurant_id=_restaurant_id)
        and coalesce(a.starts_at,h.planned_start) between now()-interval '24 hours' and now()
        and coalesce(a.ends_at,h.planned_end)>coalesce(a.starts_at,h.planned_start)
    ), available as (
      select p.* from planned p where
        not exists(select 1 from public.staff_leave_requests l where l.restaurant_id=p.restaurant_id and l.staff_id=p.staff_id and l.status='approved'
          and now() between ((l.start_date+coalesce(l.start_time,'00:00'::time)) at time zone p.tz)
            and ((l.end_date+coalesce(l.end_time,'23:59:59.999999'::time)) at time zone p.tz))
        and not exists(select 1 from public.staff_permission_requests x where x.restaurant_id=p.restaurant_id and x.staff_id=p.staff_id and x.status='approved'
          and ((x.permission_type='lateness' and x.request_date=(p.starts_at at time zone p.tz)::date
              and ((x.request_date+x.expected_arrival_time) at time zone p.tz)+interval '5 minutes'>now())
            or (x.start_time is not null and x.end_time is not null
              and now() between ((x.request_date+x.start_time) at time zone p.tz) and ((x.request_date+x.end_time) at time zone p.tz)+interval '5 minutes')))
    ), events as (
      select p.id,p.restaurant_id,p.staff_id,'in' as direction,'punch:in:'||p.id||':'||md5(p.starts_at::text) as dedupe_key
        from available p where p.starts_at+interval '5 minutes'<=now() and p.ends_at>now()
          and not exists(select 1 from public.staff_time_entries e where e.restaurant_id=p.restaurant_id and e.staff_id=p.staff_id
            and (e.clock_out is null or e.clock_in between p.starts_at-interval '4 hours' and p.ends_at))
      union all
      select p.id,p.restaurant_id,p.staff_id,'out','punch:out:'||e.id
        from available p join public.staff_time_entries e on e.restaurant_id=p.restaurant_id and e.staff_id=p.staff_id
          and e.clock_out is null and e.review_status<>'rejected' and e.clock_in between p.starts_at-interval '4 hours' and p.ends_at
        where p.ends_at+interval '5 minutes'<=now() and app.attendance_work_end(p.restaurant_id,p.staff_id,p.ends_at)+interval '5 minutes'<=now()
    )
    select distinct on (e.dedupe_key) e.* from events e
      where not exists(select 1 from public.in_app_notifications n where n.restaurant_id=e.restaurant_id and n.dedupe_key=e.dedupe_key)
      order by e.dedupe_key limit 500
  loop
    insert into public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key)
      values(event.restaurant_id,event.staff_id,'shift',
        case when event.direction='in' then 'Time to clock in' else 'Remember to clock out' end,
        case when event.direction='in' then 'Your scheduled shift has started and no clock-in is recorded. If you have arrived, open Attendance to clock in.'
          else 'Your scheduled work has ended and no clock-out is recorded. If you have finished, open Attendance to clock out. If you are still working, clock out when finished.' end,
        'shift_clock_reminder',event.id,event.dedupe_key)
      on conflict(restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics _rows=row_count; _count:=_count+_rows;
  end loop;
  return _count;
end; $$;
revoke all on function app.send_attendance_reminders(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
