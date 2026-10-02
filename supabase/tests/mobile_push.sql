-- Run as postgres against a database with an active, orderable menu.
-- All orders, guest records, table changes and queued events are rolled back.
begin;

create temporary table qr_fixture as
select t.qr_token, m.id as item_id, m.price, r.id as restaurant_id
from public.restaurants r
join public.restaurant_tables t on t.restaurant_id=r.id and t.is_active
join public.menu_items m on m.restaurant_id=r.id and m.is_available
join public.restaurant_settings s on s.restaurant_id=r.id and s.enable_orders
where r.is_active and r.archived_at is null
  and m.price>=coalesce(s.minimum_order,0)
  and not exists (
    select 1 from public.modifier_groups g
    where g.menu_item_id=m.id and g.is_active
      and (g.is_required or g.min_selection>0)
  )
limit 1;

do $$ begin
  if not exists(select 1 from qr_fixture) then
    raise exception 'Test requires an active table and an available item without required modifiers';
  end if;
end $$;

create temporary table qr_result (
  order_id uuid, order_number text, public_token text, total numeric, currency text
);
grant select on qr_fixture to anon, authenticated;
grant insert, select on qr_result to anon, authenticated;

-- Exercise the exact guest RPC as an anonymous diner, with optional details.
set local role anon;
insert into qr_result
select result.* from qr_fixture f
cross join lateral public.place_public_order_v2(
  f.qr_token,
  jsonb_build_array(jsonb_build_object(
    'menu_item_id',f.item_id,'quantity',1,'modifier_ids','[]'::jsonb
  )),
  'Rollback-only checkout regression',
  'Checkout Test', null, 'checkout-regression@example.test'
) result;
reset role;
do $$
declare expected integer; actual integer;
begin
 select count(*) into expected from public.staff s, qr_fixture f
 where s.restaurant_id=f.restaurant_id and s.is_active
 and s.role::text in ('restaurant_admin','operations_manager','manager','kitchen','waiter','cashier','host')
 and coalesce(s.permission_overrides->'view_orders','true'::jsonb)<>'false'::jsonb;
 select count(*) into actual from public.in_app_notifications n join qr_result r on n.source_id=r.order_id
 join public.push_delivery_jobs j on j.notification_id=n.id where n.source_type='order';
 if expected=0 or actual<>expected then raise exception 'Order notification recipient/job mismatch: %/%',actual,expected; end if;
 if has_function_privilege('authenticated','public.push_worker_config()','execute')
 or has_function_privilege('anon','public.push_worker_config()','execute') then raise exception 'Private push configuration exposed'; end if;
 if not exists(select 1 from pg_class where oid='public.push_subscriptions'::regclass and relrowsecurity) then raise exception 'Device subscriptions require RLS'; end if;
end $$;
rollback;
select 'PASS: checkout creates alerts and retry jobs for eligible staff; private configuration protected; no test data retained' as result;
