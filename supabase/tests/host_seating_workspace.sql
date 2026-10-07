-- Synthetic fixtures are isolated in a transaction and always rolled back.
begin;
do $$
declare
  _owner uuid; _host uuid:=gen_random_uuid(); _rid uuid:=gen_random_uuid(); _other uuid:=gen_random_uuid();
  _table uuid:=gen_random_uuid(); _small uuid:=gen_random_uuid(); _dirty uuid:=gen_random_uuid();
  _booking uuid:=gen_random_uuid(); _foreign uuid:=gen_random_uuid(); _row public.table_bookings;
begin
  select auth_user_id into _owner from public.staff where role='super_admin' and is_active limit 1;
  if _owner is null then raise exception 'Existing platform owner required'; end if;
  perform set_config('request.jwt.claim.sub',_owner::text,true);
  insert into public.restaurants(id,name,slug,seat_limit) values
    (_rid,'Seating QA','seating-qa-'||_rid::text,10),(_other,'Other seating QA','seating-qa-'||_other::text,10);
  insert into public.staff(restaurant_id,auth_user_id,name,role,is_active) values(_rid,_host,'Host QA','host',true);
  insert into public.restaurant_tables(id,restaurant_id,table_number,capacity,service_status) values
    (_table,_rid,'1',4,'free'),(_small,_rid,'2',2,'free'),(_dirty,_rid,'3',4,'cleaning');
  insert into public.table_bookings(id,restaurant_id,customer_name,guest_count,booking_at,duration_minutes,status) values
    (_booking,_rid,'Synthetic party',4,now(),90,'confirmed'),(_foreign,_other,'Other synthetic party',2,now(),90,'confirmed');
  perform set_config('request.jwt.claim.sub',_host::text,true);
  begin
    perform public.seat_host_party(_foreign,_table);
    raise exception 'Cross-tenant seating was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.seat_host_party(_booking,_small);
    raise exception 'Insufficient capacity was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Table is too small for this party' then raise; end if;
  end;
  begin
    perform public.seat_host_party(_booking,_dirty);
    raise exception 'Cleaning table was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Table is not ready for seating' then raise; end if;
  end;
  _row:=public.seat_host_party(_booking,_table);
  if _row.status<>'seated' or _row.table_id<>_table then raise exception 'Seating did not persist'; end if;
  if (select service_status from public.restaurant_tables where id=_table)<>'active' then raise exception 'Table occupancy did not synchronize'; end if;
  begin
    perform public.seat_host_party(_booking,_table);
    raise exception 'Duplicate seating was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Only confirmed reservations can be seated' then raise; end if;
  end;
end;
$$;
rollback;
