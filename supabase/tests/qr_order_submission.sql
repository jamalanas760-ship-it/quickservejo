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

do $$ declare _id uuid; begin
  select order_id into strict _id from qr_result;
  if not exists(select 1 from public.orders o join qr_fixture f on f.restaurant_id=o.restaurant_id
    where o.id=_id and o.status='new' and o.payment_status='unpaid'
      and o.subtotal=f.price and o.total=o.subtotal+o.tax_amount+o.service_amount
      and o.guest_id is not null) then
    raise exception 'Checkout did not save the correct tenant, totals, status and guest';
  end if;
  if (select count(*) from public.order_items where order_id=_id)<>1 then
    raise exception 'Checkout did not save its order item';
  end if;
  if (select count(*) from public.order_status_events
    where order_id=_id and to_status='new' and actor_role is null)<>1 then
    raise exception 'Anonymous checkout must record one initial status event';
  end if;
end $$;

-- A bad QR must still be rejected through the public API.
set local role anon;
do $$ declare _changed integer; begin
  begin
    perform * from public.place_public_order_v2('invalid-checkout-regression-token','[]'::jsonb);
    raise exception 'Invalid QR was accepted';
  exception when raise_exception then
    if sqlerrm<>'table not found' then raise; end if;
  end;
  begin
    update public.orders set total=0 where id in (select order_id from qr_result);
    get diagnostics _changed = row_count;
    if _changed<>0 then raise exception 'Anonymous direct order updates were allowed'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Isolate the capability trigger from RLS, so RLS cannot hide a broken guard.
create temporary table qr_guard_probe (like public.orders including defaults);
insert into qr_guard_probe select o.* from public.orders o join qr_result q on q.order_id=o.id;
create trigger qr_guard_probe before update on qr_guard_probe
for each row execute function app.guard_order_capability_updates();
grant select,update on qr_guard_probe to authenticated;
create temporary table qr_guest as select gen_random_uuid() as id;
insert into auth.users(id,aud,role,email)
select id,'authenticated','authenticated',id::text||'@checkout-regression.example.test' from qr_guest;
select set_config('request.jwt.claim.sub',(select id::text from qr_guest),true);
set local role authenticated;
do $$ begin
  begin
    update qr_guard_probe set total=0;
    raise exception 'Unrelated authenticated caller bypassed the order guard';
  exception when insufficient_privilege then
    if sqlerrm<>'You do not have permission to update this order' then raise; end if;
  end;
end $$;
reset role;

-- Signed-in guests also use the public checkout without needing staff powers.
set local role authenticated;
insert into qr_result
select result.* from qr_fixture f
cross join lateral public.place_public_order_v2(
  f.qr_token,
  jsonb_build_array(jsonb_build_object(
    'menu_item_id',f.item_id,'quantity',1,'modifier_ids','[]'::jsonb
  )), 'Rollback-only signed-in guest regression'
) result;
reset role;

do $$ begin
  if (select count(*) from qr_result)<>2 then
    raise exception 'Signed-in guest checkout failed';
  end if;
end $$;
-- Staff can still change status, but cannot rewrite prices or payment state.
do $$ declare _waiter uuid; begin
  select s.auth_user_id into _waiter from public.staff s join qr_fixture f on f.restaurant_id=s.restaurant_id
  where s.role='waiter' and s.is_active limit 1;
  if _waiter is null then raise exception 'Staff guard test requires an active waiter'; end if;
  perform set_config('request.jwt.claim.sub',_waiter::text,true);
end $$;
set local role authenticated;
update qr_guard_probe set status='preparing';
do $$ begin
  if not exists(select 1 from qr_guard_probe where status='preparing') then
    raise exception 'Waiter could not update order status';
  end if;
  begin
    update qr_guard_probe set total=total+10;
    raise exception 'Waiter could rewrite order prices';
  exception when insufficient_privilege then
    if sqlerrm<>'This role may only update permitted order fields' then raise; end if;
  end;
  begin
    update qr_guard_probe set payment_status='paid';
    raise exception 'Waiter could change payment state';
  exception when insufficient_privilege then
    if sqlerrm<>'This role may only update permitted order fields' then raise; end if;
  end;
end $$;
reset role;
select 'PASS: anonymous and signed-in checkout, totals, items, guest capture, status event, invalid QR rejection, direct update denial, waiter status permission and price/payment restrictions' as result;
rollback;
