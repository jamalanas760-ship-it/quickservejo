-- Run in a privileged SQL test session. All fixtures and generated events roll back.
begin;
do $$
declare
  r uuid := '6322e1bd-ddac-41f1-9017-703185462ace';
  t uuid; o1 uuid; o2 uuid; b1 uuid; b2 uuid; phase text; actor uuid;
begin
  insert into public.restaurant_tables(restaurant_id,table_number) values(r,'QA-phase-'||gen_random_uuid()) returning id into t;
  perform public.activate_table_from_qr((select qr_token from public.restaurant_tables where id=t));
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'free' then raise exception 'QR browsing occupied a table'; end if;
  insert into public.orders(restaurant_id,table_id,order_number) values(r,t,'QA-'||gen_random_uuid()) returning id into o1;
  insert into public.orders(restaurant_id,table_id,order_number) values(r,t,'QA-'||gen_random_uuid()) returning id into o2;
  update public.orders set payment_status='paid' where id=o1;
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'active' then raise exception 'First payment released another live order'; end if;
  update public.orders set payment_status='paid' where id=o2;
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'cleaning' then raise exception 'Final payment did not start cleaning'; end if;
  update public.restaurant_tables set status_updated_at=now()-interval '11 minutes' where id=t;
  perform app.release_cleaning_tables();
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'free' then raise exception 'Timed cleaning did not release table'; end if;
  insert into public.table_bookings(restaurant_id,table_id,customer_name,phone,guest_count,booking_at,duration_minutes,status)
    values(r,t,'QA phase','+962790000000',2,now()+interval '30 minutes',30,'confirmed') returning id into b1;
  insert into public.table_bookings(restaurant_id,table_id,customer_name,phone,guest_count,booking_at,duration_minutes,status)
    values(r,t,'QA phase','+962790000000',2,now()+interval '65 minutes',30,'confirmed') returning id into b2;
  update public.table_bookings set status='cancelled' where id=b1;
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'reserved' then raise exception 'Cancelling one booking lost another booking'; end if;
  update public.table_bookings set booking_at=now()+interval '3 hours' where id=b2;
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'free' then raise exception 'Rescheduling left a stale reserved table'; end if;
  update public.table_bookings set booking_at=now()+interval '65 minutes',status='seated' where id=b2;
  update public.restaurant_tables set activated_at=now()-interval '30 minutes' where id=t;
  perform app.release_unordered_qr_tables();
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'active' then raise exception 'QR expiry evicted a seated booking'; end if;
  update public.table_bookings set status='completed' where id=b2;
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'cleaning' then raise exception 'Departure did not start cleaning'; end if;
  select auth_user_id into actor from public.staff where restaurant_id=r and is_active
    and role::text='restaurant_admin' limit 1;
  if actor is null then raise exception 'QA requires an existing restaurant admin'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform public.set_table_service_status(t,'free');
  perform public.set_table_service_status(t,'active');
  perform app.reconcile_table_phase(t);
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'active' then raise exception 'Manual guest occupancy was erased without departure'; end if;
  perform public.set_table_service_status(t,'automatic');
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'cleaning' then raise exception 'Releasing manual occupancy skipped cleaning'; end if;
  perform public.set_table_service_status(t,'cleaning');
  update public.restaurant_tables set status_updated_at=now()-interval '11 minutes' where id=t;
  perform app.release_cleaning_tables();
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'cleaning' then raise exception 'Paused cleaning was released'; end if;
  perform public.set_table_service_status(t,'automatic');
  perform app.release_cleaning_tables();
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'cleaning' then raise exception 'Resumed cleaning timer did not restart'; end if;
  update public.restaurant_tables set status_updated_at=now()-interval '11 minutes' where id=t;
  perform app.release_cleaning_tables();
  perform public.set_table_service_status(t,'reserved');
  perform app.reconcile_table_phase(t);
  if (select service_status from public.restaurant_tables where id=t)<>'reserved' then raise exception 'Manual reservation not held'; end if;
  perform public.set_table_service_status(t,'automatic');
  if (select service_status from public.restaurant_tables where id=t)<>'free' then raise exception 'Automatic mode did not release manual reservation'; end if;
  perform public.set_table_service_status(t,'cleaning_auto');
  update public.restaurant_tables set status_updated_at=now()-interval '11 minutes' where id=t;
  perform app.release_cleaning_tables();
  if (select service_status from public.restaurant_tables where id=t)<>'free' then raise exception 'Timed manual cleaning did not finish'; end if;
  update public.restaurant_tables set service_status='out_of_service' where id=t;
  insert into public.orders(restaurant_id,table_id,order_number) values(r,t,'QA-'||gen_random_uuid());
  perform public.refresh_upcoming_booking_table_statuses();
  select service_status into phase from public.restaurant_tables where id=t;
  if phase<>'out_of_service' then raise exception 'Automation cleared out of service'; end if;
  perform public.set_table_service_status(t,'automatic');
  if (select service_status from public.restaurant_tables where id=t)<>'active' then raise exception 'Restoring maintenance did not detect a live order'; end if;
  begin
    perform public.set_table_service_status(t,'cleaning_auto');
    raise exception 'Live guests were released';
  exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.set_table_service_status(t,'automatic');
    raise exception 'Unauthenticated caller changed automation';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','app.reconcile_table_phase(uuid,boolean)','EXECUTE')
    or has_function_privilege('authenticated','app.reconcile_table_phase(uuid,boolean)','EXECUTE')
    or has_function_privilege('anon','public.set_table_service_status(uuid,text)','EXECUTE') then
    raise exception 'Privileged phase functions are publicly callable';
  end if;
end $$;
select 'PASS: QR, concurrent live orders, payment-only closing, cleaning timer, overlapping future bookings, rescheduling, seated protection, maintenance, manual occupancy, manual reservation release, timed cleaning, pause/resume, live guest protection, authentication, function grants' as result;
rollback;
