-- A schedule and all its assignments commit together. Retry reuses identical planned shifts.
create function public.save_restaurant_schedule(_restaurant_id uuid, _name text, _notes text, _windows jsonb, _staff_ids uuid[], _preview boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w jsonb; person record; sid uuid; starts timestamptz; ends timestamptz; day date; tz text;
  conflicts jsonb := '[]'; created integer := 0; assigned integer := 0; skipped integer := 0;
begin
  if not (app.has_capability(_restaurant_id,'manage_shifts') or app.is_super_admin()) then
    raise exception 'Shift management access required' using errcode='42501';
  end if;
  if length(btrim(_name)) not between 1 and 80 or length(coalesce(_notes,''))>2100
     or jsonb_typeof(_windows) <> 'array' or jsonb_array_length(_windows) not between 1 and 367
     or cardinality(_staff_ids)>200 or _staff_ids is null then
    raise exception 'Invalid schedule input' using errcode='22023';
  end if;
  select coalesce(timezone,'Asia/Amman') into tz from public.restaurants where id=_restaurant_id;
  -- Lock the restaurant before staff to make concurrent batch creation deterministic.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('schedule:' || _restaurant_id::text,0));
  for person in select id,name,role from public.staff where restaurant_id=_restaurant_id and id=any(_staff_ids) and is_active order by id loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_restaurant_id::text || ':' || person.id::text,0));
  end loop;
  if (select count(distinct id) from public.staff where restaurant_id=_restaurant_id and id=any(_staff_ids) and is_active) <> (select count(distinct value) from unnest(_staff_ids) value) then
    raise exception 'Choose active employees in this restaurant' using errcode='22023';
  end if;
  for w in select value from jsonb_array_elements(_windows) loop
    starts := (w->>'start')::timestamptz; ends := (w->>'end')::timestamptz; day := (w->>'day')::date;
    if starts is null or ends is null or day is null or ends<=starts or ends-starts>interval '24 hours' or (starts at time zone tz)::date<>day then
      raise exception 'Invalid shift times' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(_windows) other where other<>w and (other->>'start')::timestamptz<ends and (other->>'end')::timestamptz>starts) then
      raise exception 'Schedule windows overlap' using errcode='22023';
    end if;
    for person in select id,name,role from public.staff where restaurant_id=_restaurant_id and id=any(_staff_ids) order by id loop
      if exists(select 1 from public.shift_assignments a join public.shifts s on s.id=a.shift_id
        where a.restaurant_id=_restaurant_id and a.staff_id=person.id and a.status<>'released' and s.status not in ('closed','cancelled') and s.deleted_at is null
        and coalesce(a.starts_at,s.planned_start)<ends and coalesce(a.ends_at,s.planned_end)>starts
        and not (s.status='planned' and s.name=btrim(_name) and s.planned_start=starts and s.planned_end=ends)) then
        conflicts:=conflicts || jsonb_build_array(jsonb_build_object('staff_id',person.id,'name',person.name,'day',day,'reason','overlap'));
      end if;
      if exists(select 1 from public.staff_leave_requests l where l.restaurant_id=_restaurant_id and l.staff_id=person.id and l.status='approved'
        and (case when l.start_time is null or l.end_time is null then l.start_date::timestamp at time zone tz else (l.start_date+l.start_time) at time zone tz end)<ends
        and (case when l.start_time is null or l.end_time is null then (l.end_date+1)::timestamp at time zone tz else (l.end_date+l.end_time+case when l.end_time<=l.start_time then interval '1 day' else interval '0' end) at time zone tz end)>starts) then
        conflicts:=conflicts || jsonb_build_array(jsonb_build_object('staff_id',person.id,'name',person.name,'day',day,'reason','leave'));
      end if;
    end loop;
  end loop;
  if _preview then return jsonb_build_object('conflicts',conflicts); end if;
  if jsonb_array_length(conflicts)>0 then raise exception 'Schedule conflicts changed. Review employees and dates before saving.' using errcode='23P01'; end if;
  for w in select distinct value from jsonb_array_elements(_windows) loop
    starts := (w->>'start')::timestamptz; ends := (w->>'end')::timestamptz; day := (w->>'day')::date;
    sid:=null;
    select id into sid from public.shifts where restaurant_id=_restaurant_id and status='planned' and deleted_at is null and name=btrim(_name) and planned_start=starts and planned_end=ends order by created_at limit 1;
    if sid is null then
      insert into public.shifts(restaurant_id,name,shift_date,planned_start,planned_end,notes) values(_restaurant_id,btrim(_name),day,starts,ends,_notes) returning id into sid;
      created:=created+1;
    end if;
    for person in select id,role from public.staff where restaurant_id=_restaurant_id and id=any(_staff_ids) order by id loop
      if exists(select 1 from public.shift_assignments where shift_id=sid and staff_id=person.id) then skipped:=skipped+1;
      else
        insert into public.shift_assignments(restaurant_id,shift_id,staff_id,role_snapshot,starts_at,ends_at) values(_restaurant_id,sid,person.id,person.role,starts,ends);
        assigned:=assigned+1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('created',created,'assigned',assigned,'skipped',skipped,'conflicts',conflicts);
end $$;
revoke all on function public.save_restaurant_schedule(uuid,text,text,jsonb,uuid[],boolean) from public,anon;
grant execute on function public.save_restaurant_schedule(uuid,text,text,jsonb,uuid[],boolean) to authenticated;

create or replace function app.reject_overlapping_shift_assignment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare _start timestamptz; _end timestamptz;
begin
  if new.status='released' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.restaurant_id::text || ':' || new.staff_id::text, 0));
  select coalesce(new.starts_at,s.planned_start),coalesce(new.ends_at,s.planned_end)
    into _start,_end from public.shifts s where s.id=new.shift_id and s.restaurant_id=new.restaurant_id;
  if _start is null or _end is null then return new; end if;
  if _end <= _start then raise exception 'Shift end must follow start' using errcode='22023'; end if;
  if exists(
    select 1 from public.shift_assignments a join public.shifts s on s.id=a.shift_id
    where a.restaurant_id=new.restaurant_id and a.staff_id=new.staff_id and a.id<>new.id
      and a.status<>'released' and s.status not in ('cancelled','closed') and s.deleted_at is null
      and coalesce(a.starts_at,s.planned_start)<_end and coalesce(a.ends_at,s.planned_end)>_start
  ) then raise exception 'Employee has an overlapping shift' using errcode='23P01'; end if;
  return new;
end $$;
