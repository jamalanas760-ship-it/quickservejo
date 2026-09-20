begin;

alter table public.orders
  add column if not exists accepted_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists served_at timestamptz,
  add column if not exists paid_at timestamptz;

create table if not exists public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  name_ar text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

alter table public.menu_items
  add column if not exists kitchen_station_id uuid references public.kitchen_stations(id) on delete set null;

create index if not exists kitchen_stations_restaurant_order_idx
  on public.kitchen_stations(restaurant_id, is_active, display_order, name);
create index if not exists menu_items_kitchen_station_idx
  on public.menu_items(kitchen_station_id) where kitchen_station_id is not null;

alter table public.kitchen_stations enable row level security;
revoke all on public.kitchen_stations from public, anon;
grant select, insert, update, delete on public.kitchen_stations to authenticated;
grant all on public.kitchen_stations to service_role;

drop policy if exists kitchen_stations_select on public.kitchen_stations;
create policy kitchen_stations_select on public.kitchen_stations
for select to authenticated
using (app.has_restaurant_access(restaurant_id) or app.is_super_admin());

drop policy if exists kitchen_stations_manage on public.kitchen_stations;
create policy kitchen_stations_manage on public.kitchen_stations
for all to authenticated
using (app.can_manage_restaurant(restaurant_id) or app.is_super_admin())
with check (app.can_manage_restaurant(restaurant_id) or app.is_super_admin());

create table if not exists public.kitchen_printer_profiles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kitchen_station_id uuid references public.kitchen_stations(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 100),
  mode text not null default 'browser' check (mode in ('browser','network','provider')),
  provider text,
  endpoint text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kitchen_printer_profiles_restaurant_idx
  on public.kitchen_printer_profiles(restaurant_id, is_active);
create index if not exists kitchen_printer_profiles_station_idx
  on public.kitchen_printer_profiles(kitchen_station_id) where kitchen_station_id is not null;

alter table public.kitchen_printer_profiles enable row level security;
revoke all on public.kitchen_printer_profiles from public, anon;
grant select, insert, update, delete on public.kitchen_printer_profiles to authenticated;
grant all on public.kitchen_printer_profiles to service_role;

drop policy if exists kitchen_printer_profiles_select on public.kitchen_printer_profiles;
create policy kitchen_printer_profiles_select on public.kitchen_printer_profiles
for select to authenticated
using (app.has_restaurant_access(restaurant_id) or app.is_super_admin());

drop policy if exists kitchen_printer_profiles_manage on public.kitchen_printer_profiles;
create policy kitchen_printer_profiles_manage on public.kitchen_printer_profiles
for all to authenticated
using (app.can_manage_restaurant(restaurant_id) or app.is_super_admin())
with check (app.can_manage_restaurant(restaurant_id) or app.is_super_admin());

create table if not exists public.kitchen_print_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  kitchen_station_id uuid references public.kitchen_stations(id) on delete set null,
  printer_profile_id uuid references public.kitchen_printer_profiles(id) on delete set null,
  printed_by uuid references auth.users(id) on delete set null,
  print_kind text not null default 'ticket' check (print_kind in ('ticket','reprint')),
  created_at timestamptz not null default now()
);

create index if not exists kitchen_print_logs_restaurant_created_idx
  on public.kitchen_print_logs(restaurant_id, created_at desc);
create index if not exists kitchen_print_logs_order_idx
  on public.kitchen_print_logs(order_id, created_at desc);

alter table public.kitchen_print_logs enable row level security;
revoke all on public.kitchen_print_logs from public, anon;
grant select on public.kitchen_print_logs to authenticated;
grant all on public.kitchen_print_logs to service_role;

drop policy if exists kitchen_print_logs_select on public.kitchen_print_logs;
create policy kitchen_print_logs_select on public.kitchen_print_logs
for select to authenticated
using (app.has_restaurant_access(restaurant_id) or app.is_super_admin());

create or replace function public.record_kitchen_print(
  _order_id uuid,
  _station_id uuid default null,
  _printer_profile_id uuid default null,
  _print_kind text default 'ticket'
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _restaurant_id uuid;
  _id uuid;
begin
  select restaurant_id into _restaurant_id
  from public.orders
  where id = _order_id;

  if _restaurant_id is null then
    raise exception 'Order not found' using errcode='22023';
  end if;

  if not (app.has_restaurant_access(_restaurant_id) or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  if _station_id is not null and not exists (
    select 1 from public.kitchen_stations
    where id=_station_id and restaurant_id=_restaurant_id
  ) then
    raise exception 'Invalid kitchen station' using errcode='22023';
  end if;

  if _printer_profile_id is not null and not exists (
    select 1 from public.kitchen_printer_profiles
    where id=_printer_profile_id and restaurant_id=_restaurant_id
  ) then
    raise exception 'Invalid printer profile' using errcode='22023';
  end if;

  insert into public.kitchen_print_logs(
    restaurant_id, order_id, kitchen_station_id, printer_profile_id, printed_by, print_kind
  ) values (
    _restaurant_id, _order_id, _station_id, _printer_profile_id, auth.uid(),
    case when _print_kind='reprint' then 'reprint' else 'ticket' end
  ) returning id into _id;

  return _id;
end;
$$;

revoke all on function public.record_kitchen_print(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.record_kitchen_print(uuid,uuid,uuid,text) to authenticated;

create or replace function public.transition_order_status(
  _order_id uuid,
  _next public.order_status,
  _note text default null
) returns public.orders
language plpgsql
security definer
set search_path=''
as $$
declare
  _order public.orders;
  _allowed boolean := false;
  _staff_role public.app_role;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then
    raise exception 'Order not found' using errcode='22023';
  end if;

  if not (app.has_restaurant_access(_order.restaurant_id) or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select s.role into _staff_role
  from public.staff s
  where s.restaurant_id=_order.restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  order by s.updated_at desc
  limit 1;

  if not app.is_super_admin() and _staff_role not in ('restaurant_admin','manager','kitchen','waiter','cashier') then
    raise exception 'Role cannot update order status' using errcode='42501';
  end if;

  _allowed := case
    when _order.status='new' and _next='accepted' then true
    when _order.status='accepted' and _next='preparing' then true
    when _order.status='preparing' and _next='ready' then true
    when _order.status='ready' and _next='served' then true
    when _order.status='served' and _next='paid' then true
    when _next='cancelled' and _order.status in ('new','accepted','preparing','ready') then true
    else false
  end;

  if not _allowed then
    raise exception 'Invalid order status transition from % to %', _order.status, _next using errcode='22023';
  end if;

  update public.orders
  set status=_next,
      accepted_at=case when _next='accepted' and accepted_at is null then now() else accepted_at end,
      preparing_at=case when _next='preparing' and preparing_at is null then now() else preparing_at end,
      ready_at=case when _next='ready' and ready_at is null then now() else ready_at end,
      served_at=case when _next='served' and served_at is null then now() else served_at end,
      paid_at=case when _next='paid' and paid_at is null then now() else paid_at end,
      cancellation_note=case when _next='cancelled' then nullif(left(trim(coalesce(_note,'')),500),'') else cancellation_note end,
      cancelled_at=case when _next='cancelled' then now() else cancelled_at end,
      updated_at=now()
  where id=_order_id
  returning * into _order;

  return _order;
end;
$$;

revoke all on function public.transition_order_status(uuid,public.order_status,text) from public, anon;
grant execute on function public.transition_order_status(uuid,public.order_status,text) to authenticated;

insert into public.kitchen_stations(restaurant_id,name,name_ar,display_order)
select r.id,'General','عام',0
from public.restaurants r
where not exists (
  select 1 from public.kitchen_stations s where s.restaurant_id=r.id
);

update public.menu_items m
set kitchen_station_id = s.id
from public.kitchen_stations s
where s.restaurant_id=m.restaurant_id
  and s.name='General'
  and m.kitchen_station_id is null;

notify pgrst, 'reload schema';
commit;
