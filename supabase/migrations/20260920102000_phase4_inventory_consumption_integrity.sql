
-- Phase 4 inventory integrity: system-authored recipe consumption with exact cancellation reversal.

alter table public.erp_stock_movements
  alter column created_by drop not null;

alter table public.erp_order_consumptions
  add column if not exists reversed_at timestamptz;

create table if not exists public.erp_order_consumption_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  inventory_item_id uuid not null references public.erp_inventory(id) on delete restrict,
  quantity numeric not null check(quantity > 0),
  unit_cost numeric not null default 0 check(unit_cost >= 0),
  stock_movement_id uuid references public.erp_stock_movements(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(order_id,inventory_item_id)
);

create index if not exists erp_order_consumption_items_restaurant_idx
  on public.erp_order_consumption_items(restaurant_id,created_at desc);
create index if not exists erp_order_consumption_items_inventory_idx
  on public.erp_order_consumption_items(inventory_item_id);
create index if not exists erp_order_consumption_items_movement_idx
  on public.erp_order_consumption_items(stock_movement_id)
  where stock_movement_id is not null;

alter table public.erp_order_consumption_items enable row level security;
drop policy if exists erp_order_consumption_items_select on public.erp_order_consumption_items;
create policy erp_order_consumption_items_select
on public.erp_order_consumption_items
for select
to authenticated
using (
  app.has_capability(restaurant_id,'manage_inventory')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.has_capability(restaurant_id,'view_analytics')
);
grant select on public.erp_order_consumption_items to authenticated;
revoke insert,update,delete on public.erp_order_consumption_items from authenticated;

create or replace function app.consume_order_inventory(_order_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _order public.orders%rowtype;
  _line record;
  _cost numeric;
  _qty numeric;
  _movement_id uuid;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then return; end if;

  insert into public.erp_order_consumptions(order_id,restaurant_id)
  values(_order.id,_order.restaurant_id)
  on conflict(order_id) do nothing;
  if not found then return; end if;

  for _line in
    select ri.inventory_item_id,
           sum((oi.quantity::numeric * ri.quantity * (1 + ri.waste_percent/100.0))
             / greatest(r.yield_quantity,0.000001)) as qty
    from public.order_items oi
    join public.erp_menu_recipes r
      on r.menu_item_id=oi.menu_item_id
     and r.restaurant_id=oi.restaurant_id
    join public.erp_recipe_items ri
      on ri.recipe_id=r.id
     and ri.restaurant_id=r.restaurant_id
    where oi.order_id=_order_id
    group by ri.inventory_item_id
  loop
    _qty:=_line.qty;

    select coalesce((
      select m.unit_cost
      from public.erp_stock_movements m
      where m.restaurant_id=_order.restaurant_id
        and m.item_id=_line.inventory_item_id
        and m.unit_cost>0
      order by m.created_at desc
      limit 1
    ),0) into _cost;

    begin
      insert into public.erp_stock_movements(
        restaurant_id,item_id,quantity,unit_cost,movement_type,reason,created_by
      ) values(
        _order.restaurant_id,_line.inventory_item_id,-_qty,_cost,'issue',
        'Recipe consumption · '||_order.order_number,
        (select auth.uid())
      )
      returning id into _movement_id;

      insert into public.erp_order_consumption_items(
        order_id,restaurant_id,inventory_item_id,quantity,unit_cost,stock_movement_id
      ) values(
        _order.id,_order.restaurant_id,_line.inventory_item_id,_qty,_cost,_movement_id
      )
      on conflict(order_id,inventory_item_id) do nothing;
    exception when others then
      insert into public.system_events(
        restaurant_id,severity,source,event_type,message,metadata,user_id
      ) values(
        _order.restaurant_id,'warning','inventory','recipe_consumption_failed',
        sqlerrm,
        jsonb_build_object(
          'order_id',_order.id,
          'inventory_item_id',_line.inventory_item_id,
          'quantity',_qty
        ),
        (select auth.uid())
      );
    end;
  end loop;
end;
$$;

create or replace function app.reverse_order_inventory(_order_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _order public.orders%rowtype;
  _marker public.erp_order_consumptions%rowtype;
  _line record;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then return; end if;

  select * into _marker
  from public.erp_order_consumptions
  where order_id=_order_id
  for update;

  if _marker.order_id is null or _marker.reversed_at is not null then return; end if;

  for _line in
    select *
    from public.erp_order_consumption_items
    where order_id=_order_id
  loop
    insert into public.erp_stock_movements(
      restaurant_id,item_id,quantity,unit_cost,movement_type,reason,created_by
    ) values(
      _order.restaurant_id,_line.inventory_item_id,_line.quantity,_line.unit_cost,
      'adjustment','Cancelled order reversal · '||_order.order_number,
      (select auth.uid())
    );
  end loop;

  update public.erp_order_consumptions
  set reversed_at=now()
  where order_id=_order_id;
end;
$$;

create or replace function app.on_order_recipe_consumption()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status in ('accepted','preparing')
     and old.status is distinct from new.status then
    perform app.consume_order_inventory(new.id);
  elsif new.status='cancelled'
     and old.status is distinct from new.status then
    perform app.reverse_order_inventory(new.id);
  end if;
  return new;
end;
$$;
