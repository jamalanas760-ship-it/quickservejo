begin;

create or replace function public.assign_recurring_staff_shifts(
  _restaurant_id uuid,
  _staff_id uuid,
  _name text,
  _start_date date,
  _end_date date,
  _weekdays integer[],
  _planned_start time,
  _planned_end time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _timezone text;
  _role text;
  _day date;
  _start_ts timestamptz;
  _end_ts timestamptz;
  _resolved_shift uuid;
  _assigned integer := 0;
  _skipped integer := 0;
  _selected_days integer := 0;
begin
  if not (
    app.can_manage_restaurant(_restaurant_id)
    or app.has_capability(_restaurant_id, 'manage_shifts')
    or app.is_super_admin()
  ) then
    raise exception 'Shift management access is required' using errcode='42501';
  end if;

  select s.role::text into _role
  from public.staff s
  where s.id=_staff_id and s.restaurant_id=_restaurant_id and s.is_active;

  if _role is null then raise exception 'Active staff member not found' using errcode='22023'; end if;
  if nullif(btrim(coalesce(_name,'')),'') is null then raise exception 'Shift name is required' using errcode='22023'; end if;
  if _start_date is null or _end_date is null or _end_date < _start_date then raise exception 'Invalid schedule date range' using errcode='22023'; end if;
  if (_end_date - _start_date) > 366 then raise exception 'Recurring schedule cannot exceed 366 days' using errcode='22023'; end if;
  if _planned_start is null or _planned_end is null then raise exception 'Start and end time are required' using errcode='22023'; end if;
  if coalesce(array_length(_weekdays,1),0)=0 or exists(select 1 from unnest(_weekdays) d where d<0 or d>6) then raise exception 'Choose at least one valid weekday' using errcode='22023'; end if;

  select coalesce(nullif(r.timezone,''),'UTC') into _timezone
  from public.restaurants r
  where r.id=_restaurant_id and r.is_active and r.archived_at is null;
  if _timezone is null then raise exception 'Restaurant not found' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(_restaurant_id::text || ':' || _staff_id::text,9137));

  for _day in
    select d::date
    from generate_series(_start_date::timestamp,_end_date::timestamp,interval '1 day') d
    where extract(dow from d)::integer = any(_weekdays)
    order by d
  loop
    _selected_days := _selected_days + 1;
    _start_ts := (_day + _planned_start) at time zone _timezone;
    _end_ts := ((_day + case when _planned_end <= _planned_start then 1 else 0 end) + _planned_end) at time zone _timezone;
    _resolved_shift := null;

    select sh.id into _resolved_shift
    from public.shifts sh
    where sh.restaurant_id=_restaurant_id
      and sh.deleted_at is null
      and sh.status <> 'closed'
      and sh.shift_date=_day
      and sh.name=left(btrim(_name),80)
      and sh.planned_start=_start_ts
      and sh.planned_end=_end_ts
    order by sh.created_at
    limit 1;

    if _resolved_shift is not null and exists(
      select 1 from public.shift_assignments a
      where a.restaurant_id=_restaurant_id and a.shift_id=_resolved_shift and a.staff_id=_staff_id and a.status <> 'released'
    ) then
      _skipped := _skipped + 1;
      continue;
    end if;

    if exists(
      select 1
      from public.shift_assignments a
      join public.shifts sh on sh.id=a.shift_id
      where a.restaurant_id=_restaurant_id
        and a.staff_id=_staff_id
        and a.status <> 'released'
        and sh.deleted_at is null
        and sh.status <> 'closed'
        and coalesce(a.starts_at,sh.planned_start) is not null
        and coalesce(a.ends_at,sh.planned_end) is not null
        and _start_ts < coalesce(a.ends_at,sh.planned_end)
        and _end_ts > coalesce(a.starts_at,sh.planned_start)
    ) then
      raise exception 'Recurring shift overlaps another assignment on %',_day using errcode='23P01';
    end if;

    if _resolved_shift is null then
      insert into public.shifts(restaurant_id,name,shift_date,planned_start,planned_end,status)
      values(_restaurant_id,left(btrim(_name),80),_day,_start_ts,_end_ts,'planned')
      returning id into _resolved_shift;
    end if;

    insert into public.shift_assignments(restaurant_id,shift_id,staff_id,role_snapshot,starts_at,ends_at,status)
    values(_restaurant_id,_resolved_shift,_staff_id,_role,_start_ts,_end_ts,'scheduled');
    _assigned := _assigned + 1;
  end loop;

  if _selected_days=0 then raise exception 'The selected weekdays do not occur in this date range' using errcode='22023'; end if;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'staff_recurring_shifts_assigned','staff',_staff_id,
    jsonb_build_object('name',left(btrim(_name),80),'start_date',_start_date,'end_date',_end_date,'weekdays',to_jsonb(_weekdays),'planned_start',_planned_start,'planned_end',_planned_end,'assigned',_assigned,'skipped',_skipped));

  return jsonb_build_object('assigned',_assigned,'skipped',_skipped,'selected_days',_selected_days);
end;
$$;

revoke all on function public.assign_recurring_staff_shifts(uuid,uuid,text,date,date,integer[],time,time) from public,anon;
grant execute on function public.assign_recurring_staff_shifts(uuid,uuid,text,date,date,integer[],time,time) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
