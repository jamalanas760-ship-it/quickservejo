-- QuickServe UX counters + safe ERP delete support.
-- Applied to production Supabase on 2026-09-20.

create table if not exists public.order_view_receipts (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (order_id, user_id)
);

create index if not exists order_view_receipts_restaurant_user_idx
  on public.order_view_receipts(restaurant_id,user_id,viewed_at desc);

alter table public.order_view_receipts enable row level security;

drop policy if exists order_view_receipts_select on public.order_view_receipts;
create policy order_view_receipts_select
on public.order_view_receipts for select to authenticated
using (
  user_id=(select auth.uid())
  and app.has_restaurant_access(restaurant_id)
);

drop policy if exists order_view_receipts_insert on public.order_view_receipts;
create policy order_view_receipts_insert
on public.order_view_receipts for insert to authenticated
with check (
  user_id=(select auth.uid())
  and app.has_capability(restaurant_id,'view_orders')
);

drop policy if exists order_view_receipts_update on public.order_view_receipts;
create policy order_view_receipts_update
on public.order_view_receipts for update to authenticated
using (
  user_id=(select auth.uid())
  and app.has_capability(restaurant_id,'view_orders')
)
with check (
  user_id=(select auth.uid())
  and app.has_capability(restaurant_id,'view_orders')
);

grant select,insert,update on public.order_view_receipts to authenticated;

create or replace function public.mark_order_viewed(_order_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _restaurant_id uuid;
begin
  select restaurant_id into _restaurant_id
  from public.orders
  where id=_order_id;

  if _restaurant_id is null then
    raise exception 'Order not found';
  end if;

  if not (
    app.has_capability(_restaurant_id,'view_orders')
    or app.has_capability(_restaurant_id,'update_order_status')
    or app.has_capability(_restaurant_id,'manage_payments')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Order access is required';
  end if;

  insert into public.order_view_receipts(restaurant_id,order_id,user_id,viewed_at)
  values(_restaurant_id,_order_id,(select auth.uid()),now())
  on conflict(order_id,user_id)
  do update set viewed_at=excluded.viewed_at,restaurant_id=excluded.restaurant_id;
end;
$$;

revoke all on function public.mark_order_viewed(uuid) from public,anon;
grant execute on function public.mark_order_viewed(uuid) to authenticated,service_role;

create or replace function public.unseen_order_count(_restaurant_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
stable
as $$
declare
  _count integer;
begin
  if not (
    app.has_capability(_restaurant_id,'view_orders')
    or app.has_capability(_restaurant_id,'update_order_status')
    or app.has_capability(_restaurant_id,'manage_payments')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    return 0;
  end if;

  select count(*)::integer into _count
  from public.orders o
  where o.restaurant_id=_restaurant_id
    and o.status in ('new','accepted')
    and not exists (
      select 1
      from public.order_view_receipts r
      where r.order_id=o.id
        and r.user_id=(select auth.uid())
    );

  return coalesce(_count,0);
end;
$$;

revoke all on function public.unseen_order_count(uuid) from public,anon;
grant execute on function public.unseen_order_count(uuid) to authenticated,service_role;

alter table public.erp_inventory
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.erp_inventory
  drop constraint if exists erp_inventory_restaurant_id_name_key;

create unique index if not exists erp_inventory_restaurant_active_name_uidx
  on public.erp_inventory(restaurant_id,name)
  where archived_at is null;

create or replace view public.erp_inventory_balances
with (security_invoker=true)
as
select
  i.id,
  i.restaurant_id,
  i.name,
  i.unit,
  i.reorder_level,
  coalesce(sum(m.quantity),0::numeric) as quantity
from public.erp_inventory i
left join public.erp_stock_movements m
  on m.item_id=i.id and m.restaurant_id=i.restaurant_id
where i.archived_at is null
group by i.id;

grant select on public.erp_inventory_balances to authenticated;

create or replace function public.erp_delete_inventory_item(_item_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _restaurant_id uuid;
begin
  select restaurant_id into _restaurant_id
  from public.erp_inventory
  where id=_item_id
    and archived_at is null
  for update;

  if _restaurant_id is null then
    raise exception 'Inventory item not found';
  end if;

  if not (
    app.has_capability(_restaurant_id,'manage_inventory')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Inventory management access is required';
  end if;

  update public.erp_inventory
  set archived_at=now(),archived_by=(select auth.uid())
  where id=_item_id;
end;
$$;

revoke all on function public.erp_delete_inventory_item(uuid) from public,anon;
grant execute on function public.erp_delete_inventory_item(uuid) to authenticated,service_role;
