begin;
do $$
declare r uuid; other uuid; root_id uuid:=gen_random_uuid(); worker_uid uuid:=gen_random_uuid(); worker_id uuid;
begin
  insert into public.restaurants(name,slug,seat_limit) values('QA feature grants','qa-grants-'||gen_random_uuid(),20) returning id into r;
  insert into public.restaurants(name,slug,seat_limit) values('QA unrelated','qa-grants-other-'||gen_random_uuid(),20) returning id into other;
  insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,root_id,'QA Restaurant Manager','restaurant_admin');
  insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,worker_uid,'QA waiter','waiter') returning id into worker_id;
  insert into public.staff(restaurant_id,auth_user_id,name,role) values(other,gen_random_uuid(),'QA other worker','waiter');
  perform set_config('qa.restaurant',r::text,true);perform set_config('qa.other',other::text,true);
  perform set_config('qa.manager',root_id::text,true);perform set_config('qa.worker',worker_uid::text,true);perform set_config('qa.staff',worker_id::text,true);
  perform set_config('request.jwt.claim.sub',root_id::text,true);
end; $$;
set local role authenticated;
update public.staff set permission_overrides='{"manage_menu":true,"manage_staff":true,"manage_payments":true,"manage_inventory":true,"view_erp":true,"manage_platform":true}'::jsonb where id=current_setting('qa.staff')::uuid;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.worker'),true);
set local role authenticated;
do $$
declare r uuid:=current_setting('qa.restaurant')::uuid; other uuid:=current_setting('qa.other')::uuid; n int;
begin
  if not app.has_capability(r,'manage_menu') or not app.has_capability(r,'manage_payments') or not app.has_capability(r,'manage_inventory') then raise exception 'Extra feature grant missing'; end if;
  if not app.has_capability(r,'view_orders') then raise exception 'Role default removed'; end if;
  if app.has_capability(r,'manage_platform') or app.has_capability(r,'unknown') or app.has_capability(other,'manage_menu') or app.can_grant_restaurant_permissions(r) then raise exception 'Authority or tenant escalation'; end if;
  insert into public.menu_categories(restaurant_id,name_en,name_ar) values(r,'QA enabled menu','QA enabled menu');
  begin
    insert into public.menu_categories(restaurant_id,name_en,name_ar) values(other,'QA must fail','QA must fail');
    raise exception 'Foreign menu insert accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.staff set permission_overrides='{"manage_restaurant":true}' where id=current_setting('qa.staff')::uuid;
    raise exception 'Self grant accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.staff set role='manager' where id=current_setting('qa.staff')::uuid;
    raise exception 'Self role promotion accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,gen_random_uuid(),'QA unauthorized invite','manager');
    raise exception 'Delegated account invitation accepted';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.staff where restaurant_id=other) then raise exception 'Other team exposed'; end if;
end; $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
set local role authenticated;
update public.staff set permission_overrides='{"manage_menu":false,"view_orders":false,"manage_staff":false}'::jsonb where id=current_setting('qa.staff')::uuid;
reset role;
select set_config('request.jwt.claim.sub',current_setting('qa.worker'),true);
set local role authenticated;
do $$
declare r uuid:=current_setting('qa.restaurant')::uuid; n int;
begin
  if app.has_capability(r,'manage_menu') or app.has_capability(r,'view_orders') or app.has_capability(r,'manage_staff') then raise exception 'Revocation did not take effect'; end if;
  update public.menu_categories set name_en='QA should not update' where restaurant_id=r;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Revoked menu writer still updated rows'; end if;
end; $$;
reset role;
select 'PASS: manager grants, defaults, real menu RLS write/revoke, tenant isolation, self-grant and role/invite escalation denied' as result;
rollback;
