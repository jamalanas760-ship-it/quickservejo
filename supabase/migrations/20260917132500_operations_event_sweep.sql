-- QuickServe Phase 3B: real operational event generation for low stock and delayed orders.

-- Seed useful automation rules for existing restaurants.
insert into public.operational_rules
  (restaurant_id, name, event_type, enabled, priority, target_role, due_minutes, requires_approval, approval_role, rule_config)
select r.id, 'Low stock alert', 'low_stock', true, 'high', 'inventory', 15, false, null, '{"system_default":true}'::jsonb
from public.restaurants r
on conflict (restaurant_id, event_type, name) do nothing;

insert into public.operational_rules
  (restaurant_id, name, event_type, enabled, priority, target_role, due_minutes, requires_approval, approval_role, rule_config)
select r.id, 'Delayed order escalation', 'order_stuck', true, 'high', 'operations_manager', 5, false, null, '{"system_default":true}'::jsonb
from public.restaurants r
on conflict (restaurant_id, event_type, name) do nothing;

-- Keep new restaurants on the same operational defaults.
create or replace function app.seed_operational_rules_for_restaurant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.operational_rules
    (restaurant_id, name, event_type, enabled, priority, target_role, due_minutes, requires_approval, approval_role, rule_config)
  values
    (new.id, 'Waiter call response', 'waiter_call_created', true, 'high', 'waiter', 3, false, null, '{"system_default":true}'::jsonb),
    (new.id, 'Shift opening checklist', 'shift_opening', false, 'normal', 'manager', 10, false, null, '{"system_default":true}'::jsonb),
    (new.id, 'Shift closing checklist', 'shift_closing', false, 'normal', 'manager', 15, false, null, '{"system_default":true}'::jsonb),
    (new.id, 'Low stock alert', 'low_stock', true, 'high', 'inventory', 15, false, null, '{"system_default":true}'::jsonb),
    (new.id, 'Delayed order escalation', 'order_stuck', true, 'high', 'operations_manager', 5, false, null, '{"system_default":true}'::jsonb)
  on conflict (restaurant_id, event_type, name) do nothing;
  return new;
end;
$$;
revoke all on function app.seed_operational_rules_for_restaurant() from public, anon, authenticated;

-- Stock movements immediately evaluate the affected item's balance.
create or replace function app.on_stock_movement_low_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _item_name text;
  _reorder numeric;
  _balance numeric;
begin
  select i.name, i.reorder_level,
         coalesce((select sum(m.quantity) from public.erp_stock_movements m where m.item_id = i.id), 0)
    into _item_name, _reorder, _balance
  from public.erp_inventory i
  where i.id = new.item_id and i.restaurant_id = new.restaurant_id;

  if _item_name is not null and _balance <= coalesce(_reorder, 0) then
    perform app.create_tasks_from_event(
      new.restaurant_id,
      'low_stock',
      'inventory_item',
      new.item_id,
      'Low stock: ' || _item_name,
      'Current balance ' || _balance::text || ' is at or below reorder level ' || coalesce(_reorder, 0)::text || '.',
      jsonb_build_object('item_id', new.item_id, 'item_name', _item_name, 'quantity', _balance, 'reorder_level', _reorder)
    );
  end if;
  return new;
end;
$$;
revoke all on function app.on_stock_movement_low_stock() from public, anon, authenticated;

drop trigger if exists stock_movement_low_stock_automation on public.erp_stock_movements;
create trigger stock_movement_low_stock_automation
after insert on public.erp_stock_movements
for each row execute function app.on_stock_movement_low_stock();

-- A safe, role-gated sweep turns time-based operational exceptions into deduplicated work.
create or replace function public.run_operations_sweep(_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _order record;
  _created integer := 0;
  _n integer;
  _prep_minutes integer;
begin
  if not app.has_restaurant_access(_restaurant_id) then
    raise exception 'Forbidden';
  end if;
  if not (app.has_capability(_restaurant_id, 'manage_work') or app.has_capability(_restaurant_id, 'manage_shifts')) then
    raise exception 'Operations sweep not permitted';
  end if;

  select greatest(coalesce(rs.estimated_preparation_time, 20), 5)
    into _prep_minutes
  from public.restaurant_settings rs
  where rs.restaurant_id = _restaurant_id
  limit 1;
  _prep_minutes := coalesce(_prep_minutes, 20);

  for _order in
    select o.id, o.order_number, o.status::text as status, o.created_at, o.updated_at
    from public.orders o
    where o.restaurant_id = _restaurant_id
      and o.status::text in ('new','accepted','preparing')
      and o.created_at < now() - make_interval(mins => _prep_minutes)
  loop
    _n := app.create_tasks_from_event(
      _restaurant_id,
      'order_stuck',
      'order',
      _order.id,
      'Delayed order #' || coalesce(_order.order_number, left(_order.id::text, 8)),
      'Order has remained active beyond the restaurant preparation-time target.',
      jsonb_build_object('order_id', _order.id, 'order_number', _order.order_number, 'status', _order.status, 'threshold_minutes', _prep_minutes, 'created_at', _order.created_at)
    );
    _created := _created + coalesce(_n, 0);
  end loop;

  -- Re-evaluate all current inventory balances as part of the same sweep so alerts
  -- are repaired even if stock data was imported before the trigger existed.
  for _order in
    select b.id, b.name, b.quantity, b.reorder_level
    from public.erp_inventory_balances b
    where b.restaurant_id = _restaurant_id
      and b.quantity <= b.reorder_level
  loop
    _n := app.create_tasks_from_event(
      _restaurant_id,
      'low_stock',
      'inventory_item',
      _order.id,
      'Low stock: ' || _order.name,
      'Current balance ' || _order.quantity::text || ' is at or below reorder level ' || _order.reorder_level::text || '.',
      jsonb_build_object('item_id', _order.id, 'item_name', _order.name, 'quantity', _order.quantity, 'reorder_level', _order.reorder_level)
    );
    _created := _created + coalesce(_n, 0);
  end loop;

  return jsonb_build_object('created', _created, 'threshold_minutes', _prep_minutes, 'ran_at', now());
end;
$$;
revoke all on function public.run_operations_sweep(uuid) from public, anon;
grant execute on function public.run_operations_sweep(uuid) to authenticated;
