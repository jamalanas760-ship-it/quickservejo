-- Privileged QA session. All synthetic staff, orders and events roll back.
begin;
do $$
declare r uuid; other uuid; uid uuid:=gen_random_uuid(); sid uuid; oid uuid; foreign_order uuid; paid_order uuid;
begin
  insert into auth.users(id,email) values(uid,'qa-order-grants-'||uid||'@example.invalid');
  insert into public.restaurants(name,slug,seat_limit) values('QA order permissions','qa-order-perms-'||gen_random_uuid(),20) returning id into r;
  insert into public.restaurants(name,slug) values('QA other orders','qa-other-orders-'||gen_random_uuid()) returning id into other;
  insert into public.staff(restaurant_id,auth_user_id,name,role,permission_overrides) values(r,uid,'QA HR order grant','hr','{"view_orders":true,"update_order_status":true}') returning id into sid;
  insert into public.orders(restaurant_id,order_number) values(r,'QA-'||gen_random_uuid()) returning id into oid;
  insert into public.orders(restaurant_id,order_number,status) values(r,'QA-paid-'||gen_random_uuid(),'served') returning id into paid_order;
  insert into public.orders(restaurant_id,order_number) values(other,'QA-foreign-'||gen_random_uuid()) returning id into foreign_order;
  perform set_config('qa.order_fixture',json_build_object('r',r,'uid',uid,'sid',sid,'oid',oid,'paid_order',paid_order,'foreign_order',foreign_order)::text,true);
end $$;
set local role authenticated;
do $$
declare f jsonb:=current_setting('qa.order_fixture')::jsonb; result public.orders;
begin
  perform set_config('request.jwt.claim.sub',f->>'uid',true);
  result:=public.transition_order_status((f->>'oid')::uuid,'accepted',null);
  if result.status<>'accepted' then raise exception 'HR grant did not work'; end if;
  begin perform public.transition_order_status((f->>'oid')::uuid,'served',null);raise exception 'Invalid jump allowed';exception when sqlstate '22023' then null;end;
  begin perform public.transition_order_status((f->>'paid_order')::uuid,'paid',null);raise exception 'Status grant bypassed payment permission';exception when insufficient_privilege then null;end;
  begin perform public.transition_order_status((f->>'foreign_order')::uuid,'accepted',null);raise exception 'Foreign order updated';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.staff set role='waiter',permission_overrides='{"update_order_status":false}' where id=(current_setting('qa.order_fixture')::jsonb->>'sid')::uuid;
set local role authenticated;
do $$
declare f jsonb:=current_setting('qa.order_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',f->>'uid',true);
  begin perform public.transition_order_status((f->>'oid')::uuid,'preparing',null);raise exception 'Revoked waiter still updated';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.staff set role='operations_manager',permission_overrides='{}' where id=(current_setting('qa.order_fixture')::jsonb->>'sid')::uuid;
set local role authenticated;
do $$
declare f jsonb:=current_setting('qa.order_fixture')::jsonb; result public.orders;
begin
  perform set_config('request.jwt.claim.sub',f->>'uid',true);
  result:=public.transition_order_status((f->>'oid')::uuid,'preparing',null);
  if result.status<>'preparing' then raise exception 'Operations Manager default blocked'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.staff set role='hr',permission_overrides='{"view_orders":true,"manage_payments":true,"update_order_status":false}' where id=(current_setting('qa.order_fixture')::jsonb->>'sid')::uuid;
set local role authenticated;
do $$
declare f jsonb:=current_setting('qa.order_fixture')::jsonb; result public.orders;
begin
  perform set_config('request.jwt.claim.sub',f->>'uid',true);
  result:=public.transition_order_status((f->>'paid_order')::uuid,'paid',null);
  if result.status<>'paid' then raise exception 'Payment grant outside role blocked'; end if;
  begin perform public.transition_order_status((f->>'oid')::uuid,'ready',null);raise exception 'Payment grant allowed operational status update';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.staff set is_active=false,permission_overrides='{"update_order_status":true}' where id=(current_setting('qa.order_fixture')::jsonb->>'sid')::uuid;
set local role authenticated;
do $$
declare f jsonb:=current_setting('qa.order_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',f->>'uid',true);
  begin perform public.transition_order_status((f->>'oid')::uuid,'ready',null);raise exception 'Inactive account updated order';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.transition_order_status((f->>'oid')::uuid,'ready',null);raise exception 'Unauthenticated order update';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: granted HR update, revoked waiter denial, Operations Manager default, valid transition enforcement, payment isolation, inactive/unauthenticated/foreign restaurant denial' as result;
rollback;
