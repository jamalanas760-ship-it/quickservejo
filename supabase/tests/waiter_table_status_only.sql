begin;
do $$
declare _owner uuid; _waiter uuid:=gen_random_uuid(); _rid uuid:=gen_random_uuid(); _table uuid:=gen_random_uuid();
begin
  select auth_user_id into _owner from public.staff where role='super_admin' and is_active limit 1;
  if _owner is null then raise exception 'Existing owner required'; end if;
  perform set_config('request.jwt.claim.sub',_owner::text,true);
  insert into public.restaurants(id,name,slug,seat_limit) values(_rid,'Waiter structure QA','waiter-qa-'||_rid::text,10);
  insert into public.staff(restaurant_id,auth_user_id,name,role,is_active) values(_rid,_waiter,'Waiter QA','waiter',true);
  insert into public.restaurant_tables(id,restaurant_id,table_number,capacity) values(_table,_rid,'1',4);
  perform set_config('request.jwt.claim.sub',_waiter::text,true);
  perform public.set_table_service_status(_table,'active');
  begin
    update public.restaurant_tables set capacity=99 where id=_table;
    raise exception 'Waiter changed capacity';
  exception when insufficient_privilege then null; end;
  begin
    update public.restaurant_tables set layout='{"rotation":90}' where id=_table;
    raise exception 'Waiter changed layout';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.restaurant_tables where id=_table;
    raise exception 'Waiter deleted a table';
  exception when insufficient_privilege then null; end;
  if (select capacity from public.restaurant_tables where id=_table)<>4 then raise exception 'Rejected edit persisted'; end if;
end;
$$;
rollback;
