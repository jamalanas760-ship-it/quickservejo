-- Privileged test session; every fixture and change rolls back.
begin;
do $$
declare r uuid; r2 uuid; member uuid; item uuid; admin_uid uuid; platform_staff uuid; old_restaurant_count bigint; n text := 'QA lifecycle '||gen_random_uuid();
begin
  select auth_user_id,id into admin_uid,platform_staff from public.staff where role='super_admin' and is_active limit 1;
  if admin_uid is null then raise exception 'Test requires a platform admin'; end if;
  select count(*) into old_restaurant_count from public.restaurants;
  insert into public.restaurants(name,slug) values(n,'qa-lifecycle-'||gen_random_uuid()) returning id into r;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.admin_restaurant_lifecycle(r,'delete',n);
    raise exception 'Unauthenticated delete succeeded';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.admin_restaurant_lifecycle(r,'archive','');
    raise exception 'Non-admin archive succeeded';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  insert into public.erp_inventory(restaurant_id,name,unit) values(r,'QA inventory','kg') returning id into item;
  insert into public.erp_suppliers(restaurant_id,name) values(r,'QA supplier');
  insert into public.erp_stock_movements(restaurant_id,item_id,quantity,reason) values(r,item,1,'QA');
  insert into public.erp_expenses(restaurant_id,description,category,amount,created_by) values(r,'QA expense','other',1,admin_uid);
  insert into public.restaurant_tables(restaurant_id,table_number) values(r,'QA');
  insert into public.orders(restaurant_id,order_number) values(r,'QA-'||gen_random_uuid());
  insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,admin_uid,'QA tenant member','manager') returning id into member;
  perform public.admin_restaurant_lifecycle(r,'archive','');
  if not exists(select 1 from public.restaurants where id=r and archived_at is not null and not is_active) then raise exception 'Archive failed'; end if;
  if not exists(select 1 from public.erp_inventory where restaurant_id=r) then raise exception 'Archive removed data'; end if;
  perform public.admin_restaurant_lifecycle(r,'restore','');
  if not exists(select 1 from public.restaurants where id=r and archived_at is null and is_active) then raise exception 'Restore failed'; end if;
  begin
    perform public.admin_restaurant_lifecycle(r,'delete','wrong name');
    raise exception 'Wrong confirmation accepted';
  exception when raise_exception then
    if sqlerrm='Wrong confirmation accepted' then raise; end if;
  end;
  perform public.admin_restaurant_lifecycle(r,'delete',n);
  if exists(select 1 from public.restaurants where id=r) then raise exception 'Restaurant still exists'; end if;
  if exists(select 1 from public.erp_inventory where restaurant_id=r) or exists(select 1 from public.erp_stock_movements where restaurant_id=r) or exists(select 1 from public.erp_expenses where restaurant_id=r) or exists(select 1 from public.erp_suppliers where restaurant_id=r) or exists(select 1 from public.orders where restaurant_id=r) or exists(select 1 from public.restaurant_tables where restaurant_id=r) then raise exception 'Dependent rows survived'; end if;
  if not exists(select 1 from public.audit_logs where entity_id=r and action='restaurant.deleted' and restaurant_id is null and metadata->>'name'=n) then raise exception 'Audit history missing'; end if;
  if not exists(select 1 from public.restaurant_media_cleanup where restaurant_id=r) then raise exception 'Cleanup not queued'; end if;
  if exists(select 1 from public.staff where id=member) then raise exception 'Tenant access survived deletion'; end if;
  if not exists(select 1 from public.staff where id=platform_staff and restaurant_id is null and is_active) or not app.is_super_admin() then raise exception 'Platform owner lost access'; end if;
  if not exists(select 1 from auth.users where id=admin_uid) then raise exception 'Shared user account removed'; end if;
  if (select count(*) from public.restaurants)<>old_restaurant_count then raise exception 'Existing restaurants changed'; end if;
  if has_function_privilege('anon','public.admin_restaurant_lifecycle(uuid,text,text)','EXECUTE') or has_function_privilege('authenticated','public.claim_restaurant_cleanup()','EXECUTE') or has_table_privilege('authenticated','public.restaurant_media_cleanup','SELECT') then raise exception 'Cleanup privilege exposure'; end if;
end $$;
select 'PASS: authorization, archive/restore, exact confirmation, ERP/order/table cascades, audit retention, media queue, shared users, platform owner access' as result;
rollback;
