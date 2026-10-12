-- Review and apply through the existing deployment workflow. No historical numbers change.
-- Abort safely if legacy non-empty references conflict; never renumber financial records.
do $$ begin
  if exists (select 1 from public.erp_procurement_requests where po_reference <> '' group by restaurant_id,po_reference having count(*)>1) then
    raise exception 'Duplicate legacy PO references require review before this migration';
  end if;
end $$;
create unique index erp_procurement_reference_unique on public.erp_procurement_requests(restaurant_id,po_reference) where po_reference <> '';
create sequence app.quickserve_po_number;
grant usage on sequence app.quickserve_po_number to authenticated,service_role;
create function app.assign_quickserve_po_number() returns trigger
language plpgsql security invoker set search_path='' as $$
declare number_text text;
begin
  if new.po_reference is null or btrim(new.po_reference)='' then
    loop
      number_text := nextval('app.quickserve_po_number')::text;
      new.po_reference := 'QS-PO-' || lpad(number_text,greatest(10,length(number_text)),'0');
      exit when not exists(select 1 from public.erp_procurement_requests where restaurant_id=new.restaurant_id and po_reference=new.po_reference);
    end loop;
  end if;
  return new;
end $$;
revoke all on function app.assign_quickserve_po_number() from public, anon;
grant execute on function app.assign_quickserve_po_number() to authenticated;
create trigger quickserve_po_number before insert on public.erp_procurement_requests for each row execute function app.assign_quickserve_po_number();

-- Templates are reusable configuration; assigned shifts retain copied historical values.
create table public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  start_time time not null,
  end_time time not null,
  notes text not null default '',
  weekdays integer[] not null default '{0,1,2,3,4}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (start_time <> end_time),
  check (weekdays <@ array[0,1,2,3,4,5,6])
);
create unique index shift_templates_name_unique on public.shift_templates(restaurant_id,lower(btrim(name)));
alter table public.shift_templates enable row level security;
create policy shift_templates_access on public.shift_templates for all to authenticated
  using (app.has_capability(restaurant_id,'manage_shifts') or app.is_super_admin())
  with check (app.has_capability(restaurant_id,'manage_shifts') or app.is_super_admin());
grant select,insert,update,delete on public.shift_templates to authenticated;

-- Batch alignment is atomic and uses each row's version to reject stale writes.
create function public.save_floor_table_batch(_restaurant_id uuid, _changes jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare change jsonb; affected integer;
begin
  if not app.has_capability(_restaurant_id,'manage_tables') then
    raise exception 'Table management access required' using errcode='42501';
  end if;
  if jsonb_typeof(_changes) <> 'array' or jsonb_array_length(_changes)>500 then
    raise exception 'Invalid layout batch' using errcode='22023';
  end if;
  for change in select value from jsonb_array_elements(_changes) order by value->>'id' loop
    if jsonb_typeof(change->'layout') <> 'object' then raise exception 'Invalid table layout'; end if;
    update public.restaurant_tables set layout=change->'layout',zone=change->>'zone'
      where id=(change->>'id')::uuid and restaurant_id=_restaurant_id and updated_at=(change->>'updated_at')::timestamptz;
    get diagnostics affected = row_count;
    if affected <> 1 then raise exception 'Table layout changed in another session; reload before saving' using errcode='40001'; end if;
  end loop;
end $$;
revoke all on function public.save_floor_table_batch(uuid,jsonb) from public,anon;
grant execute on function public.save_floor_table_batch(uuid,jsonb) to authenticated;

-- Lock per employee so concurrent assignments cannot both pass the overlap check.
-- Existing historical schedules remain unchanged.
create function app.reject_overlapping_shift_assignment() returns trigger
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
      and a.status<>'released' and s.status<>'cancelled' and s.deleted_at is null
      and coalesce(a.starts_at,s.planned_start)<_end and coalesce(a.ends_at,s.planned_end)>_start
  ) then raise exception 'Employee has an overlapping shift' using errcode='23P01'; end if;
  return new;
end $$;
revoke all on function app.reject_overlapping_shift_assignment() from public,anon;
grant execute on function app.reject_overlapping_shift_assignment() to authenticated;
create trigger quickserve_shift_overlap before insert or update of starts_at,ends_at,staff_id,shift_id,status on public.shift_assignments for each row execute function app.reject_overlapping_shift_assignment();
