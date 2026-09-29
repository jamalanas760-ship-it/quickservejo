begin;

create table if not exists public.recurring_staff_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  start_date date not null,
  end_date date not null,
  weekdays integer[] not null,
  planned_start time not null,
  planned_end time not null,
  is_active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_staff_schedules_date_range check (end_date >= start_date),
  constraint recurring_staff_schedules_horizon check ((end_date - start_date) <= 366),
  constraint recurring_staff_schedules_weekdays check (
    cardinality(weekdays) > 0
    and weekdays <@ array[0,1,2,3,4,5,6]::integer[]
  )
);

create unique index if not exists recurring_staff_schedules_identity_idx
  on public.recurring_staff_schedules(
    restaurant_id, staff_id, name, start_date, planned_start, planned_end
  );

alter table public.recurring_staff_schedules enable row level security;

drop policy if exists recurring_staff_schedules_select on public.recurring_staff_schedules;
create policy recurring_staff_schedules_select
on public.recurring_staff_schedules
for select
to authenticated
using (
  app.is_super_admin()
  or app.can_manage_restaurant(restaurant_id)
  or app.has_capability(restaurant_id,'manage_shifts')
  or exists (
    select 1
    from public.staff s
    where s.restaurant_id=recurring_staff_schedules.restaurant_id
      and s.auth_user_id=auth.uid()
      and s.is_active
  )
);

drop policy if exists recurring_staff_schedules_manage on public.recurring_staff_schedules;
create policy recurring_staff_schedules_manage
on public.recurring_staff_schedules
for all
to authenticated
using (
  app.is_super_admin()
  or app.can_manage_restaurant(restaurant_id)
  or app.has_capability(restaurant_id,'manage_shifts')
)
with check (
  app.is_super_admin()
  or app.can_manage_restaurant(restaurant_id)
  or app.has_capability(restaurant_id,'manage_shifts')
);

create or replace function app.materialize_recurring_staff_schedule(
  _schedule_id uuid,
  _from_date date default current_date,
  _to_date date default current_date + 83
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _schedule public.recurring_staff_schedules%rowtype;
  _timezone text;
  _role text;
  _day date;
  _start_ts timestamptz;
  _end_ts timestamptz;
  _resolved_shift uuid;
  _assigned integer := 0;
  _skipped integer := 0;
begin
  select rs.* into _schedule
  from public.recurring_staff_schedules rs
  where rs.id=_schedule_id and rs.is_active;

  if _schedule.id is null then
    return jsonb_build_object('assigned',0,'skipped',0);
  end if;

  select coalesce(nullif(r.timezone,''),'UTC') into _timezone
  from public.restaurants r
  where r.id=_schedule.restaurant_id and r.is_active and r.archived_at is null;

  select s.role::text into _role
  from public.staff s
  where s.id=_schedule.staff_id
    and s.restaurant_id=_schedule.restaurant_id
    and s.is_active;

  if _timezone is null or _role is null then
    return jsonb_build_object('assigned',0,'skipped',0);
  end if;

  for _day in
    select d::date
    from generate_series(
      greatest(_schedule.start_date,coalesce(_from_date,_schedule.start_date))::timestamp,
      least(_schedule.end_date,coalesce(_to_date,_schedule.end_date))::timestamp,
      interval '1 day'
    ) d
    where extract(dow from d)::integer = any(_schedule.weekdays)
    order by d
  loop
    _start_ts := (_day + _schedule.planned_start) at time zone _timezone;
    _end_ts := ((_day + case when _schedule.planned_end <= _schedule.planned_start then 1 else 0 end) + _schedule.planned_end) at time zone _timezone;
    _resolved_shift := null;

    select sh.id into _resolved_shift
    from public.shifts sh
    where sh.restaurant_id=_schedule.restaurant_id
      and sh.deleted_at is null
      and sh.shift_date=_day
      and sh.name=_schedule.name
      and sh.planned_start=_start_ts
      and sh.planned_end=_end_ts
    order by sh.created_at
    limit 1;

    if _resolved_shift is not null and exists (
      select 1 from public.shift_assignments a
      where a.restaurant_id=_schedule.restaurant_id
        and a.shift_id=_resolved_shift
        and a.staff_id=_schedule.staff_id
        and a.status <> 'released'
    ) then
      _skipped := _skipped + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.shift_assignments a
      join public.shifts sh on sh.id=a.shift_id
      where a.restaurant_id=_schedule.restaurant_id
        and a.staff_id=_schedule.staff_id
        and a.status <> 'released'
        and sh.deleted_at is null
        and sh.status <> 'closed'
        and coalesce(a.starts_at,sh.planned_start) is not null
        and coalesce(a.ends_at,sh.planned_end) is not null
        and _start_ts < coalesce(a.ends_at,sh.planned_end)
        and _end_ts > coalesce(a.starts_at,sh.planned_start)
    ) then
      _skipped := _skipped + 1;
      continue;
    end if;

    if _resolved_shift is null then
      insert into public.shifts(
        restaurant_id,name,shift_date,planned_start,planned_end,status
      )
      values(
        _schedule.restaurant_id,_schedule.name,_day,_start_ts,_end_ts,'planned'
      )
      returning id into _resolved_shift;
    end if;

    insert into public.shift_assignments(
      restaurant_id,shift_id,staff_id,role_snapshot,starts_at,ends_at,status
    )
    values(
      _schedule.restaurant_id,_resolved_shift,_schedule.staff_id,_role,_start_ts,_end_ts,'scheduled'
    );
    _assigned := _assigned + 1;
  end loop;

  return jsonb_build_object('assigned',_assigned,'skipped',_skipped);
end;
$$;

revoke all on function app.materialize_recurring_staff_schedule(uuid,date,date) from public,anon,authenticated;

create or replace function public.refresh_recurring_staff_schedules(
  _restaurant_id uuid,
  _horizon_days integer default 84
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _schedule record;
  _result jsonb;
  _assigned integer := 0;
  _skipped integer := 0;
  _from_date date;
  _to_date date;
  _timezone text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not (
    app.is_super_admin()
    or app.can_manage_restaurant(_restaurant_id)
    or app.has_capability(_restaurant_id,'manage_shifts')
    or exists (
      select 1
      from public.staff s
      where s.restaurant_id=_restaurant_id
        and s.auth_user_id=auth.uid()
        and s.is_active
    )
  ) then
    raise exception 'Restaurant access is required' using errcode='42501';
  end if;

  select coalesce(nullif(r.timezone,''),'UTC') into _timezone
  from public.restaurants r
  where r.id=_restaurant_id and r.is_active and r.archived_at is null;

  if _timezone is null then
    raise exception 'Restaurant not found' using errcode='22023';
  end if;

  _from_date := (now() at time zone _timezone)::date;
  _to_date := _from_date + greatest(7,least(coalesce(_horizon_days,84),366)) - 1;

  for _schedule in
    select id
    from public.recurring_staff_schedules
    where restaurant_id=_restaurant_id
      and is_active
      and end_date >= _from_date
      and start_date <= _to_date
  loop
    _result := app.materialize_recurring_staff_schedule(_schedule.id,_from_date,_to_date);
    _assigned := _assigned + coalesce((_result->>'assigned')::integer,0);
    _skipped := _skipped + coalesce((_result->>'skipped')::integer,0);
  end loop;

  return jsonb_build_object(
    'assigned',_assigned,
    'skipped',_skipped,
    'from_date',_from_date,
    'to_date',_to_date
  );
end;
$$;

revoke all on function public.refresh_recurring_staff_schedules(uuid,integer) from public,anon;
grant execute on function public.refresh_recurring_staff_schedules(uuid,integer) to authenticated,service_role;

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
  _effective_end date := _end_date;
  _schedule_id uuid;
  _result jsonb;
  _assigned integer := 0;
  _skipped integer := 0;
begin
  if not (
    app.can_manage_restaurant(_restaurant_id)
    or app.has_capability(_restaurant_id, 'manage_shifts')
    or app.is_super_admin()
  ) then
    raise exception 'Shift management access is required' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.staff s
    where s.id=_staff_id and s.restaurant_id=_restaurant_id and s.is_active
  ) then
    raise exception 'Active staff member not found' using errcode='22023';
  end if;

  if nullif(btrim(coalesce(_name,'')),'') is null then
    raise exception 'Shift name is required' using errcode='22023';
  end if;
  if _start_date is null or _end_date is null or _end_date < _start_date then
    raise exception 'Invalid schedule date range' using errcode='22023';
  end if;
  if _planned_start is null or _planned_end is null then
    raise exception 'Start and end time are required' using errcode='22023';
  end if;
  if coalesce(array_length(_weekdays,1),0)=0
     or exists(select 1 from unnest(_weekdays) d where d<0 or d>6) then
    raise exception 'Choose at least one valid weekday' using errcode='22023';
  end if;

  if _end_date=_start_date and coalesce(array_length(_weekdays,1),0)>1 then
    _effective_end := _start_date + 83;
  end if;

  if (_effective_end - _start_date) > 366 then
    raise exception 'Recurring schedule cannot exceed 366 days' using errcode='22023';
  end if;

  insert into public.recurring_staff_schedules(
    restaurant_id,staff_id,name,start_date,end_date,weekdays,planned_start,planned_end,is_active,created_by
  )
  values(
    _restaurant_id,_staff_id,left(btrim(_name),80),_start_date,_effective_end,_weekdays,_planned_start,_planned_end,true,auth.uid()
  )
  on conflict (restaurant_id,staff_id,name,start_date,planned_start,planned_end)
  do update set
    end_date=excluded.end_date,
    weekdays=excluded.weekdays,
    is_active=true,
    updated_at=now()
  returning id into _schedule_id;

  _result := app.materialize_recurring_staff_schedule(_schedule_id,_start_date,_effective_end);
  _assigned := coalesce((_result->>'assigned')::integer,0);
  _skipped := coalesce((_result->>'skipped')::integer,0);

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(
    _restaurant_id,auth.uid(),'staff_recurring_shifts_assigned','staff',_staff_id,
    jsonb_build_object(
      'name',left(btrim(_name),80),
      'start_date',_start_date,
      'requested_end_date',_end_date,
      'end_date',_effective_end,
      'weekdays',to_jsonb(_weekdays),
      'planned_start',_planned_start,
      'planned_end',_planned_end,
      'assigned',_assigned,
      'skipped',_skipped,
      'schedule_id',_schedule_id
    )
  );

  return jsonb_build_object(
    'assigned',_assigned,
    'skipped',_skipped,
    'selected_days',(
      select count(*)
      from generate_series(_start_date::timestamp,_effective_end::timestamp,interval '1 day') d
      where extract(dow from d)::integer=any(_weekdays)
    ),
    'schedule_id',_schedule_id,
    'end_date',_effective_end
  );
end;
$$;

revoke all on function public.assign_recurring_staff_shifts(uuid,uuid,text,date,date,integer[],time,time) from public,anon;
grant execute on function public.assign_recurring_staff_shifts(uuid,uuid,text,date,date,integer[],time,time) to authenticated,service_role;

insert into public.recurring_staff_schedules(
  restaurant_id,staff_id,name,start_date,end_date,weekdays,planned_start,planned_end,is_active,created_by,created_at,updated_at
)
select
  a.restaurant_id,
  a.entity_id,
  left(btrim(a.metadata->>'name'),80),
  (a.metadata->>'start_date')::date,
  case
    when (a.metadata->>'end_date')::date=(a.metadata->>'start_date')::date
         and jsonb_array_length(a.metadata->'weekdays')>1
      then (a.metadata->>'start_date')::date + 83
    else (a.metadata->>'end_date')::date
  end,
  array(select jsonb_array_elements_text(a.metadata->'weekdays')::integer),
  (a.metadata->>'planned_start')::time,
  (a.metadata->>'planned_end')::time,
  true,
  a.actor_user_id,
  a.created_at,
  now()
from public.audit_logs a
where a.action='staff_recurring_shifts_assigned'
  and a.entity='staff'
  and a.entity_id is not null
  and jsonb_typeof(a.metadata->'weekdays')='array'
  and a.metadata ? 'start_date'
  and a.metadata ? 'end_date'
  and a.metadata ? 'planned_start'
  and a.metadata ? 'planned_end'
  and a.metadata ? 'name'
on conflict (restaurant_id,staff_id,name,start_date,planned_start,planned_end)
do update set
  end_date=greatest(public.recurring_staff_schedules.end_date,excluded.end_date),
  weekdays=excluded.weekdays,
  is_active=true,
  updated_at=now();

do $$
declare _row record;
begin
  for _row in select id,start_date,end_date from public.recurring_staff_schedules where is_active loop
    perform app.materialize_recurring_staff_schedule(
      _row.id,
      greatest(_row.start_date,current_date - 1),
      least(_row.end_date,current_date + 83)
    );
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
