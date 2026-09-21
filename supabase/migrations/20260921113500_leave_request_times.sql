-- Add time precision to staff leave requests while preserving the existing date-based API.
alter table public.staff_leave_requests
  add column if not exists start_time time without time zone not null default time '09:00',
  add column if not exists end_time time without time zone not null default time '17:00';

alter table public.staff_leave_requests
  drop constraint if exists staff_leave_requests_valid_window;

alter table public.staff_leave_requests
  add constraint staff_leave_requests_valid_window
  check (
    end_date > start_date
    or (end_date = start_date and end_time > start_time)
  );

create or replace function public.submit_leave_request(
  _restaurant_id uuid,
  _start date,
  _end date,
  _start_time time without time zone,
  _end_time time without time zone,
  _reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _staff_id uuid;
  _id uuid;
begin
  select id into _staff_id
  from public.staff
  where restaurant_id=_restaurant_id
    and auth_user_id=(select auth.uid())
    and is_active
  limit 1;

  if _staff_id is null then
    raise exception 'Active staff profile not found';
  end if;

  if _end < _start or (_end = _start and _end_time <= _start_time) then
    raise exception 'Invalid leave date/time range';
  end if;

  insert into public.staff_leave_requests(
    restaurant_id,
    staff_id,
    start_date,
    end_date,
    start_time,
    end_time,
    reason
  )
  values(
    _restaurant_id,
    _staff_id,
    _start,
    _end,
    _start_time,
    _end_time,
    left(coalesce(_reason,''),1000)
  )
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.submit_leave_request(uuid,date,date,time without time zone,time without time zone,text) from public,anon;
grant execute on function public.submit_leave_request(uuid,date,date,time without time zone,time without time zone,text) to authenticated,service_role;

-- Backward-compatible wrapper for older clients.
create or replace function public.submit_leave_request(
  _restaurant_id uuid,
  _start date,
  _end date,
  _reason text default ''
)
returns uuid
language sql
security definer
set search_path=''
as $$
  select public.submit_leave_request(
    _restaurant_id,
    _start,
    _end,
    time '09:00',
    time '17:00',
    _reason
  );
$$;

revoke all on function public.submit_leave_request(uuid,date,date,text) from public,anon;
grant execute on function public.submit_leave_request(uuid,date,date,text) to authenticated,service_role;
