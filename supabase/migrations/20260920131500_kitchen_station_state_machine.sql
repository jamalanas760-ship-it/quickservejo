-- Production kitchen routing + guarded order workflow.
begin;

create table if not exists public.kitchen_stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  display_order integer not null default 0,
  is_active boolean not null default true,
  print_width_mm integer not null default 80 check (print_width_mm in (58,80)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name),
  unique (restaurant_id, id)
);

create index if not exists kitchen_stations_restaurant_active_idx
  on public.kitchen_stations(restaurant_id,is_active,display_order);

alter table public.kitchen_stations enable row level security;
revoke all on public.kitchen_stations from public, anon;
grant select,insert,update,delete on public.kitchen_stations to authenticated;
grant all on public.kitchen_stations to service_role;

drop policy if exists kitchen_stations_select on public.kitchen_stations;
create policy kitchen_stations_select on public.kitchen_stations for select to authenticated
using (app.has_restaurant_access(restaurant_id) or app.is_super_admin());

drop policy if exists kitchen_stations_write on public.kitchen_stations;
create policy kitchen_stations_write on public.kitchen_stations for all to authenticated
using (
  app.has_capability(restaurant_id,'manage_menu')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
)
with check (
  app.has_capability(restaurant_id,'manage_menu')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
);

alter table public.menu_categories
  add column if not exists kitchen_station_id uuid references public.kitchen_stations(id) on delete set null;
alter table public.menu_items
  add column if not exists kitchen_station_id uuid references public.kitchen_stations(id) on delete set null;
alter table public.order_items
  add column if not exists kitchen_station_id uuid references public.kitchen_stations(id) on delete set null,
  add column if not exists kitchen_station_name_snapshot text;

create index if not exists menu_categories_kitchen_station_idx
  on public.menu_categories(restaurant_id,kitchen_station_id) where kitchen_station_id is not null;
create index if not exists menu_items_kitchen_station_idx
  on public.menu_items(restaurant_id,kitchen_station_id) where kitchen_station_id is not null;
create index if not exists order_items_kitchen_station_idx
  on public.order_items(restaurant_id,kitchen_station_id,order_id) where kitchen_station_id is not null;

create or replace function app.validate_menu_station_tenant()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare _station_restaurant uuid;
begin
  if new.kitchen_station_id is null then return new; end if;
  select restaurant_id into _station_restaurant
  from public.kitchen_stations
  where id=new.kitchen_station_id;
  if _station_restaurant is null or _station_restaurant <> new.restaurant_id then
    raise exception 'Kitchen station belongs to another restaurant' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_menu_categories_station_tenant on public.menu_categories;
create trigger trg_menu_categories_station_tenant
before insert or update of kitchen_station_id,restaurant_id on public.menu_categories
for each row execute function app.validate_menu_station_tenant();

drop trigger if exists trg_menu_items_station_tenant on public.menu_items;
create trigger trg_menu_items_station_tenant
before insert or update of kitchen_station_id,restaurant_id on public.menu_items
for each row execute function app.validate_menu_station_tenant();

create or replace function app.snapshot_order_item_station()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _station_id uuid;
  _station_name text;
  _station_restaurant uuid;
begin
  if new.kitchen_station_id is not null then
    select restaurant_id,name into _station_restaurant,_station_name
    from public.kitchen_stations
    where id=new.kitchen_station_id;
    if _station_restaurant is null or _station_restaurant <> new.restaurant_id then
      raise exception 'Kitchen station belongs to another restaurant' using errcode='42501';
    end if;
    new.kitchen_station_name_snapshot := coalesce(new.kitchen_station_name_snapshot,_station_name);
    return new;
  end if;

  if new.menu_item_id is not null then
    select
      coalesce(mi.kitchen_station_id,mc.kitchen_station_id),
      ks.name
    into _station_id,_station_name
    from public.menu_items mi
    left join public.menu_categories mc
      on mc.id=mi.category_id and mc.restaurant_id=mi.restaurant_id
    left join public.kitchen_stations ks
      on ks.id=coalesce(mi.kitchen_station_id,mc.kitchen_station_id)
     and ks.restaurant_id=mi.restaurant_id
    where mi.id=new.menu_item_id
      and mi.restaurant_id=new.restaurant_id;

    new.kitchen_station_id := _station_id;
    new.kitchen_station_name_snapshot := _station_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_item_station_snapshot on public.order_items;
create trigger trg_order_item_station_snapshot
before insert on public.order_items
for each row execute function app.snapshot_order_item_station();

update public.order_items oi
set kitchen_station_id=resolved.station_id,
    kitchen_station_name_snapshot=resolved.station_name
from (
  select
    oi2.id,
    coalesce(mi.kitchen_station_id,mc.kitchen_station_id) as station_id,
    ks.name as station_name
  from public.order_items oi2
  join public.menu_items mi
    on mi.id=oi2.menu_item_id and mi.restaurant_id=oi2.restaurant_id
  left join public.menu_categories mc
    on mc.id=mi.category_id and mc.restaurant_id=mi.restaurant_id
  left join public.kitchen_stations ks
    on ks.id=coalesce(mi.kitchen_station_id,mc.kitchen_station_id)
   and ks.restaurant_id=mi.restaurant_id
  where oi2.kitchen_station_id is null
) resolved
where oi.id=resolved.id
  and resolved.station_id is not null;

create or replace function app.valid_order_transition(_from public.order_status,_to public.order_status)
returns boolean
language sql
immutable
set search_path=''
as $$
  select
    _from = _to
    or (_from='new' and _to in ('accepted','cancelled'))
    or (_from='accepted' and _to in ('preparing','cancelled'))
    or (_from='preparing' and _to in ('ready','cancelled'))
    or (_from='ready' and _to in ('served','cancelled'))
    or (_from='served' and _to in ('paid','cancelled'))
    or (_from='paid' and _to='served');
$$;

create or replace function app.enforce_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status is not distinct from new.status then return new; end if;

  if not app.valid_order_transition(old.status,new.status) then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status
      using errcode='22023';
  end if;

  if new.status='cancelled'
     and old.status in ('preparing','ready','served')
     and (select auth.uid()) is not null
     and not app.is_super_admin()
     and not app.has_restaurant_role(
       old.restaurant_id,
       array['restaurant_admin','manager','operations_manager']::public.app_role[]
     ) then
    raise exception 'Manager approval is required for late-stage cancellation'
      using errcode='42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_order_status_transition on public.orders;
create trigger trg_enforce_order_status_transition
before update of status on public.orders
for each row execute function app.enforce_order_status_transition();

create or replace function public.transition_order_status(
  _order_id uuid,
  _next public.order_status
) returns public.order_status
language plpgsql
security definer
set search_path=''
as $$
declare _order public.orders%rowtype;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then raise exception 'Order not found'; end if;

  if not (
    app.has_capability(_order.restaurant_id,'update_order_status')
    or app.has_capability(_order.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Order status access is required' using errcode='42501';
  end if;

  if _next='cancelled' then
    raise exception 'Use the cancellation workflow with a reason code' using errcode='22023';
  end if;

  if not app.valid_order_transition(_order.status,_next) then
    raise exception 'Invalid order status transition: % -> %', _order.status, _next
      using errcode='22023';
  end if;

  update public.orders
  set status=_next,updated_at=now()
  where id=_order.id;

  return _next;
end;
$$;

revoke all on function public.transition_order_status(uuid,public.order_status) from public,anon;
grant execute on function public.transition_order_status(uuid,public.order_status) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
