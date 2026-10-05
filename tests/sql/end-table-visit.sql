-- Privileged session; fixtures and generated events are rolled back.
begin;
do $$
declare r uuid; r2 uuid; actor uuid:=gen_random_uuid(); t uuid; t2 uuid; o uuid; o2 uuid; b uuid; next_b uuid; phase text;
begin
  insert into auth.users(id,email) values(actor,'qa-release-'||actor||'@example.invalid');
  insert into public.restaurants(name,slug,seat_limit) values('QA release','qa-release-'||gen_random_uuid(),20) returning id into r;
  insert into public.restaurants(name,slug) values('QA unrelated','qa-release-other-'||gen_random_uuid()) returning id into r2;
  insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,actor,'QA manager','restaurant_admin');
  insert into public.restaurant_tables(restaurant_id,table_number) values(r,'QA-release') returning id into t;
  insert into public.restaurant_tables(restaurant_id,table_number) values(r2,'QA-other') returning id into t2;
  insert into public.orders(restaurant_id,table_id,order_number) values(r,t,'QA-'||gen_random_uuid()) returning id into o;
  insert into public.table_bookings(restaurant_id,table_id,customer_name,phone,guest_count,booking_at,status)
    values(r,t,'QA guest','+962790000000',2,now(),'seated') returning id into b;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin perform public.set_table_service_status(t,'free'); raise exception 'Bypassed active visit'; exception when sqlstate '22023' then null; end;
  phase:=public.end_table_visit(t);
  if phase<>'free' then raise exception 'Visit failed to release: %',phase; end if;
  if not exists(select 1 from public.orders where id=o and table_id=t and status='new' and payment_status<>'paid' and table_visit_closed_at is not null) then raise exception 'Order/payment/history changed'; end if;
  if (select status from public.table_bookings where id=b)<>'completed' then raise exception 'Seated booking not completed'; end if;
  perform app.reconcile_table_phase(t);
  if (select service_status from public.restaurant_tables where id=t)<>'free' then raise exception 'Old unpaid visit reoccupied table'; end if;
  perform public.set_table_service_status(t,'active');
  update public.orders set payment_status='paid' where id=o;
  if (select service_status from public.restaurant_tables where id=t)<>'active' then raise exception 'Late payment ended new manual visit'; end if;
  insert into public.orders(restaurant_id,table_id,order_number) values(r,t,'QA-'||gen_random_uuid()) returning id into o2;
  if (select service_status from public.restaurant_tables where id=t)<>'active' then raise exception 'New order did not occupy'; end if;
  insert into public.table_bookings(restaurant_id,table_id,customer_name,phone,guest_count,booking_at,status)
    values(r,t,'QA next guest','+962790000000',2,now()+interval '1 hour','confirmed') returning id into next_b;
  phase:=public.end_table_visit(t);
  if phase<>'reserved' then raise exception 'Next reservation lost: %',phase; end if;
  update public.orders set status='preparing' where id=o2;
  if (select service_status from public.restaurant_tables where id=t)<>'reserved' then raise exception 'Kitchen update of ended visit changed table'; end if;
  if (select status from public.table_bookings where id=next_b)<>'confirmed' then raise exception 'Upcoming booking completed incorrectly'; end if;
  begin perform public.end_table_visit(t2); raise exception 'Cross tenant allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.end_table_visit(t); raise exception 'Unauthenticated allowed'; exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.end_table_visit(uuid)','EXECUTE') then raise exception 'Anon grant'; end if;
  if (select count(*) from public.audit_logs where restaurant_id=r and action='table_visit_ended')<>2 then raise exception 'Audit missing'; end if;
end; $$;
select 'PASS: free/reserved release, unpaid-order history, new visits, late payment, kitchen updates, booking completion, tenant/auth guards, audit' as result;
rollback;
