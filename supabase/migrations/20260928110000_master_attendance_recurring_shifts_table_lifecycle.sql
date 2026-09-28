begin;

-- ---------------------------------------------------------------------------
-- Reliable attendance clock: explicit clock-in / clock-out with one open
-- session per staff account. This avoids toggle races and UI state bouncing.
-- ---------------------------------------------------------------------------
create unique index if not exists staff_time_entries_one_open_per_staff_idx
  on public.staff_time_entries(staff_id)
  where clock_out is null;

create or replace function public.get_my_time_clock_status(_restaurant_id uuid)
returns table(
  entry_id uuid,
  staff_id uuid,
  clock_in timestamptz,
  server_now timestamptz,
  elapsed_seconds bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _staff_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select s.id into _staff_id
  from public.staff s
  where s.restaurant_id=_restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  order by s.updated_at desc
  limit 1;

  if _staff_id is null then
    raise exception 'Active staff profile not found' using errcode='42501';
  end if;

  return query
  select e.id,e.staff_id,e.clock_in,now(),
         greatest(0,floor(extract(epoch from (now()-e.clock_in))))::bigint
  from public.staff_time_entries e
  where e.staff_id=_staff_id and e.clock_out is null
  order by e.clock_in desc
  limit 1;
end;
$$;

create or replace function public.clock_in_staff(_restaurant_id uuid)
returns table(action text, entry_id uuid, staff_id uuid, at timestamptz, clock_in timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _staff_id uuid;
  _entry public.staff_time_entries%rowtype;
  _at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select s.id into _staff_id
  from public.staff s
  where s.restaurant_id=_restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  order by s.updated_at desc
  limit 1;

  if _staff_id is null then
    raise exception 'Active staff profile not found' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_staff_id::text, 9101));

  select e.* into _entry
  from public.staff_time_entries e
  where e.staff_id=_staff_id and e.clock_out is null
  order by e.clock_in desc
  limit 1
  for update;

  if _entry.id is not null then
    return query select 'already_clocked_in'::text,_entry.id,_staff_id,_at,_entry.clock_in;
    return;
  end if;

  insert into public.staff_time_entries(restaurant_id,staff_id,clock_in)
  values(_restaurant_id,_staff_id,_at)
  returning * into _entry;

  return query select 'clocked_in'::text,_entry.id,_staff_id,_at,_entry.clock_in;
end;
$$;

create or replace function public.clock_out_staff(_restaurant_id uuid)
returns table(action text, entry_id uuid, staff_id uuid, at timestamptz, clock_in timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _staff_id uuid;
  _entry public.staff_time_entries%rowtype;
  _at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select s.id into _staff_id
  from public.staff s
  where s.restaurant_id=_restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  order by s.updated_at desc
  limit 1;

  if _staff_id is null then
    raise exception 'Active staff profile not found' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_staff_id::text, 9101));

  select e.* into _entry
  from public.staff_time_entries e
  where e.staff_id=_staff_id and e.clock_out is null
  order by e.clock_in desc
  limit 1
  for update;

  if _entry.id is null then
    return query select 'already_clocked_out'::text,null::uuid,_staff_id,_at,null::timestamptz;
    return;
  end if;

  update public.staff_time_entries
  set clock_out=_at
  where id=_entry.id;

  return query select 'clocked_out'::text,_entry.id,_staff_id,_at,_entry.clock_in;
end;
$$;

revoke all on function public.get_my_time_clock_status(uuid) from public,anon;
revoke all on function public.clock_in_staff(uuid) from public,anon;
revoke all on function public.clock_out_staff(uuid) from public,anon;
grant execute on function public.get_my_time_clock_status(uuid) to authenticated,service_role;
grant execute on function public.clock_in_staff(uuid) to authenticated,service_role;
grant execute on function public.clock_out_staff(uuid) to authenticated,service_role;

-- Keep the legacy endpoint safe for any older client still using it.
create or replace function public.toggle_time_clock(_restaurant_id uuid)
returns table(action text, entry_id uuid, at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _staff_id uuid;
  _entry public.staff_time_entries%rowtype;
  _at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select s.id into _staff_id
  from public.staff s
  where s.restaurant_id=_restaurant_id and s.auth_user_id=auth.uid() and s.is_active
  order by s.updated_at desc limit 1;

  if _staff_id is null then raise exception 'Active staff profile not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_staff_id::text, 9101));

  select e.* into _entry
  from public.staff_time_entries e
  where e.staff_id=_staff_id and e.clock_out is null
  order by e.clock_in desc limit 1 for update;

  if _entry.id is null then
    insert into public.staff_time_entries(restaurant_id,staff_id,clock_in)
    values(_restaurant_id,_staff_id,_at) returning * into _entry;
    return query select 'clocked_in'::text,_entry.id,_at;
  else
    update public.staff_time_entries set clock_out=_at where id=_entry.id;
    return query select 'clocked_out'::text,_entry.id,_at;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Professional recurring shift generation with selectable weekdays.
-- PostgreSQL DOW: Sunday=0 ... Saturday=6.
-- ---------------------------------------------------------------------------
create or replace function public.create_recurring_shifts(
  _restaurant_id uuid,
  _name text,
  _start_date date,
  _end_date date,
  _weekdays integer[],
  _planned_start time,
  _planned_end time,
  _notes text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _timezone text;
  _day date;
  _start_ts timestamptz;
  _end_ts timestamptz;
  _created integer := 0;
begin
  if not (
    app.has_capability(_restaurant_id,'manage_shifts')
    or app.can_manage_restaurant(_restaurant_id)
    or app.is_super_admin()
  ) then
    raise exception 'Shift management access is required' using errcode='42501';
  end if;

  if nullif(btrim(coalesce(_name,'')),'') is null then
    raise exception 'Shift name is required' using errcode='22023';
  end if;
  if _start_date is null or _end_date is null or _end_date < _start_date then
    raise exception 'Invalid schedule date range' using errcode='22023';
  end if;
  if (_end_date - _start_date) > 366 then
    raise exception 'Recurring schedule cannot exceed 366 days' using errcode='22023';
  end if;
  if _planned_start is null or _planned_end is null then
    raise exception 'Start and end time are required' using errcode='22023';
  end if;
  if coalesce(array_length(_weekdays,1),0)=0
     or exists(select 1 from unnest(_weekdays) d where d < 0 or d > 6) then
    raise exception 'Choose at least one valid weekday' using errcode='22023';
  end if;

  select coalesce(nullif(r.timezone,''),'UTC') into _timezone
  from public.restaurants r
  where r.id=_restaurant_id and r.is_active and r.archived_at is null;

  if _timezone is null then
    raise exception 'Restaurant not found' using errcode='22023';
  end if;

  for _day in
    select d::date
    from generate_series(_start_date::timestamp,_end_date::timestamp,interval '1 day') d
    where extract(dow from d)::integer = any(_weekdays)
    order by d
  loop
    _start_ts := (_day + _planned_start) at time zone _timezone;
    _end_ts := ((_day + case when _planned_end <= _planned_start then 1 else 0 end) + _planned_end) at time zone _timezone;

    if not exists(
      select 1
      from public.shifts sh
      where sh.restaurant_id=_restaurant_id
        and sh.deleted_at is null
        and sh.shift_date=_day
        and sh.name=left(btrim(_name),80)
        and sh.planned_start=_start_ts
        and sh.planned_end=_end_ts
    ) then
      insert into public.shifts(
        restaurant_id,name,shift_date,planned_start,planned_end,status,notes
      ) values(
        _restaurant_id,left(btrim(_name),80),_day,_start_ts,_end_ts,'planned',
        nullif(btrim(coalesce(_notes,'')),'')
      );
      _created := _created + 1;
    end if;
  end loop;

  return _created;
end;
$$;

revoke all on function public.create_recurring_shifts(uuid,text,date,date,integer[],time,time,text) from public,anon;
grant execute on function public.create_recurring_shifts(uuid,text,date,date,integer[],time,time,text) to authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Automatic table lifecycle.
-- System-owned status changes use status_updated_by = null.
-- Manual manager overrides keep their actor id and are not timed out.
-- ---------------------------------------------------------------------------
create or replace function app.release_unordered_qr_tables()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _released integer;
begin
  update public.restaurant_tables t
  set service_status = case
        when exists(
          select 1 from public.table_bookings b
          where b.table_id=t.id
            and b.restaurant_id=t.restaurant_id
            and b.status='confirmed'
            and b.booking_at between now() and now()+interval '2 hours'
        ) then 'reserved'
        else 'free'
      end,
      activated_at = null,
      status_updated_at = now(),
      status_updated_by = null
  where t.is_active
    and t.service_status='active'
    and t.status_updated_by is null
    and t.activated_at is not null
    and t.activated_at <= now()-interval '20 minutes'
    and not exists(
      select 1
      from public.orders o
      where o.table_id=t.id
        and o.created_at >= t.activated_at
        and o.status in ('new','accepted','preparing','ready','served')
    );

  get diagnostics _released = row_count;
  return _released;
end;
$$;

create or replace function app.release_cleaning_tables()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _released integer;
begin
  update public.restaurant_tables t
  set service_status = case
        when exists(
          select 1 from public.table_bookings b
          where b.table_id=t.id
            and b.restaurant_id=t.restaurant_id
            and b.status='confirmed'
            and b.booking_at between now() and now()+interval '2 hours'
        ) then 'reserved'
        else 'free'
      end,
      activated_at = null,
      status_updated_at = now(),
      status_updated_by = null
  where t.is_active
    and t.service_status='cleaning'
    and t.status_updated_by is null
    and t.status_updated_at <= now()-interval '10 minutes';

  get diagnostics _released = row_count;
  return _released;
end;
$$;

create or replace function app.sync_order_table_service_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _activated_at timestamptz;
  _has_other_live boolean;
begin
  if tg_op='UPDATE' and old.table_id is distinct from new.table_id and old.table_id is not null then
    select exists(
      select 1 from public.orders o
      where o.table_id=old.table_id
        and o.id<>new.id
        and o.status in ('new','accepted','preparing','ready','served')
    ) into _has_other_live;

    if not _has_other_live then
      update public.restaurant_tables t
      set service_status = case
            when exists(
              select 1 from public.table_bookings b
              where b.table_id=t.id and b.restaurant_id=t.restaurant_id
                and b.status='confirmed'
                and b.booking_at between now() and now()+interval '2 hours'
            ) then 'reserved'
            else 'free'
          end,
          activated_at=null,status_updated_at=now(),status_updated_by=null
      where t.id=old.table_id and t.is_active and t.service_status<>'out_of_service';
    end if;
  end if;

  if new.table_id is null then return new; end if;

  if new.status in ('new','accepted','preparing','ready','served') then
    update public.restaurant_tables
    set service_status='active',
        activated_at=coalesce(activated_at,new.created_at,now()),
        status_updated_at=now(),
        status_updated_by=null
    where id=new.table_id and restaurant_id=new.restaurant_id
      and is_active and service_status<>'out_of_service';
    return new;
  end if;

  select t.activated_at into _activated_at
  from public.restaurant_tables t
  where t.id=new.table_id and t.restaurant_id=new.restaurant_id
  for update;

  select exists(
    select 1
    from public.orders o
    where o.table_id=new.table_id
      and o.id<>new.id
      and o.status in ('new','accepted','preparing','ready','served')
      and (_activated_at is null or o.created_at>=_activated_at)
  ) into _has_other_live;

  if _has_other_live then
    update public.restaurant_tables
    set service_status='active',status_updated_at=now(),status_updated_by=null
    where id=new.table_id and is_active and service_status<>'out_of_service';
  elsif new.status='paid' then
    update public.restaurant_tables
    set service_status='cleaning',activated_at=null,status_updated_at=now(),status_updated_by=null
    where id=new.table_id and restaurant_id=new.restaurant_id
      and is_active and service_status<>'out_of_service';
  elsif new.status='cancelled' then
    update public.restaurant_tables t
    set service_status = case
          when exists(
            select 1 from public.table_bookings b
            where b.table_id=t.id and b.restaurant_id=t.restaurant_id
              and b.status='confirmed'
              and b.booking_at between now() and now()+interval '2 hours'
          ) then 'reserved'
          else 'free'
        end,
        activated_at=null,status_updated_at=now(),status_updated_by=null
    where t.id=new.table_id and t.restaurant_id=new.restaurant_id
      and t.is_active and t.service_status<>'out_of_service';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_order_table_service_status on public.orders;
create trigger trg_sync_order_table_service_status
after insert or update of status,table_id
on public.orders
for each row execute function app.sync_order_table_service_status();

create or replace function public.sync_booking_table_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op='UPDATE' and old.table_id is distinct from new.table_id and old.table_id is not null then
    update public.restaurant_tables
      set service_status='free',activated_at=null,status_updated_at=now(),status_updated_by=null
    where id=old.table_id and restaurant_id=old.restaurant_id and service_status='reserved';
  end if;

  if new.table_id is null then return new; end if;

  if new.status='confirmed' and new.booking_at <= now()+interval '2 hours' then
    update public.restaurant_tables
      set service_status='reserved',activated_at=null,status_updated_at=now(),status_updated_by=null
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='free';
  elsif new.status='seated' then
    update public.restaurant_tables
      set service_status='active',activated_at=coalesce(activated_at,now()),status_updated_at=now(),status_updated_by=null
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status in ('free','reserved');
  elsif new.status='completed' then
    update public.restaurant_tables
      set service_status='cleaning',activated_at=null,status_updated_at=now(),status_updated_by=null
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='active';
  elsif new.status in ('cancelled','no_show') then
    update public.restaurant_tables
      set service_status='free',activated_at=null,status_updated_at=now(),status_updated_by=null
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='reserved';
  end if;
  return new;
end;
$$;

create or replace function public.set_table_service_status(_table_id uuid,_status text)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare _restaurant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if _status not in ('free','reserved','active','cleaning','out_of_service') then
    raise exception 'Invalid table status' using errcode='22023';
  end if;

  select restaurant_id into _restaurant_id
  from public.restaurant_tables
  where id=_table_id and is_active;

  if _restaurant_id is null or not app.has_capability(_restaurant_id,'manage_tables') then
    raise exception 'Not allowed to update this table' using errcode='42501';
  end if;

  update public.restaurant_tables
  set service_status=_status,
      activated_at=case when _status='active' then coalesce(activated_at,now()) else null end,
      status_updated_at=now(),
      status_updated_by=auth.uid()
  where id=_table_id;

  return _status;
end;
$$;

-- Repair any scan-only tables that were stuck because the old cleanup compared
-- the order enum against a non-existent status value.
select app.release_unordered_qr_tables();
select app.release_cleaning_tables();

notify pgrst,'reload schema';
commit;
