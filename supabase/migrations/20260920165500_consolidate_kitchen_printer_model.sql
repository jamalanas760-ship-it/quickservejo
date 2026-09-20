begin;

create table if not exists public.kitchen_printers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kitchen_station_id uuid references public.kitchen_stations(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 100),
  purpose text not null default 'kitchen' check (purpose in ('kitchen','cashier','receipt')),
  provider text not null default 'browser' check (provider in ('browser','network_adapter','cloud_adapter')),
  endpoint text,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kitchen_printers_restaurant_idx
  on public.kitchen_printers(restaurant_id, purpose);
create index if not exists kitchen_printers_station_idx
  on public.kitchen_printers(kitchen_station_id) where kitchen_station_id is not null;

alter table public.kitchen_printers enable row level security;
drop policy if exists kitchen_printers_read on public.kitchen_printers;
create policy kitchen_printers_read on public.kitchen_printers
for select to authenticated
using (
  app.has_capability(restaurant_id,'view_orders')
  or app.has_capability(restaurant_id,'update_order_status')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
);
drop policy if exists kitchen_printers_manage on public.kitchen_printers;
create policy kitchen_printers_manage on public.kitchen_printers
for all to authenticated
using (app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin())
with check (app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin());

revoke all on public.kitchen_printers from public, anon;
grant select,insert,update,delete on public.kitchen_printers to authenticated;
grant all on public.kitchen_printers to service_role;

do $$
begin
  if to_regclass('public.kitchen_printer_profiles') is not null then
    insert into public.kitchen_printers(
      id, restaurant_id, kitchen_station_id, name, purpose, provider, endpoint, is_active, config, created_at, updated_at
    )
    select
      p.id, p.restaurant_id, p.kitchen_station_id, p.name, 'kitchen',
      case p.mode when 'network' then 'network_adapter' when 'provider' then 'cloud_adapter' else 'browser' end,
      p.endpoint, p.is_active,
      jsonb_build_object('legacy_is_default', p.is_default),
      p.created_at, p.updated_at
    from public.kitchen_printer_profiles p
    on conflict (id) do nothing;
  end if;
end $$;

do $$
begin
  if exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='kitchen_print_logs' and column_name='printer_profile_id'
  ) then
    alter table public.kitchen_print_logs drop constraint if exists kitchen_print_logs_printer_profile_id_fkey;
    alter table public.kitchen_print_logs rename column printer_profile_id to printer_id;
  end if;
end $$;

alter table public.kitchen_print_logs
  drop constraint if exists kitchen_print_logs_printer_id_fkey;
alter table public.kitchen_print_logs
  add constraint kitchen_print_logs_printer_id_fkey
  foreign key (printer_id) references public.kitchen_printers(id) on delete set null;

drop function if exists public.record_kitchen_print(uuid,uuid,uuid,text);

create function public.record_kitchen_print(
  _order_id uuid,
  _station_id uuid default null,
  _printer_id uuid default null,
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
  where id=_order_id;

  if _restaurant_id is null then
    raise exception 'Order not found' using errcode='22023';
  end if;

  if not (app.has_restaurant_access(_restaurant_id) or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  if _station_id is not null and not exists (
    select 1 from public.kitchen_stations where id=_station_id and restaurant_id=_restaurant_id
  ) then
    raise exception 'Invalid kitchen station' using errcode='22023';
  end if;

  if _printer_id is not null and not exists (
    select 1 from public.kitchen_printers where id=_printer_id and restaurant_id=_restaurant_id and is_active
  ) then
    raise exception 'Invalid printer' using errcode='22023';
  end if;

  insert into public.kitchen_print_logs(
    restaurant_id, order_id, kitchen_station_id, printer_id, printed_by, print_kind
  ) values (
    _restaurant_id, _order_id, _station_id, _printer_id, auth.uid(),
    case when _print_kind='reprint' then 'reprint' else 'ticket' end
  ) returning id into _id;

  return _id;
end;
$$;

revoke all on function public.record_kitchen_print(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.record_kitchen_print(uuid,uuid,uuid,text) to authenticated;

drop table if exists public.kitchen_printer_profiles;

notify pgrst, 'reload schema';
commit;
