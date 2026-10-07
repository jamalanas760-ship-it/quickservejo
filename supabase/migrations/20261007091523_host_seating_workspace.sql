-- Seat a confirmed reservation at one eligible table, under a single lock.
create or replace function public.seat_host_party(_booking_id uuid, _table_id uuid)
returns public.table_bookings
language plpgsql security definer set search_path = ''
as $$
declare
  _booking public.table_bookings;
  _table public.restaurant_tables;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  select * into _booking from public.table_bookings where id=_booking_id for update;
  if _booking.id is null then raise exception 'Reservation not found'; end if;
  if not (app.has_capability(_booking.restaurant_id,'manage_tables') or app.has_capability(_booking.restaurant_id,'manage_restaurant') or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if _booking.status <> 'confirmed' then raise exception 'Only confirmed reservations can be seated'; end if;
  select * into _table from public.restaurant_tables where id=_table_id and restaurant_id=_booking.restaurant_id for update;
  if _table.id is null or not _table.is_active then raise exception 'Table is unavailable'; end if;
  if _table.capacity < _booking.guest_count then raise exception 'Table is too small for this party'; end if;
  if not (_table.service_status='free' or (_table.service_status='reserved' and _booking.table_id=_table.id)) then
    raise exception 'Table is not ready for seating';
  end if;
  if exists(select 1 from public.orders where table_id=_table.id and restaurant_id=_booking.restaurant_id and status in ('new','accepted','preparing','ready','served')) then
    raise exception 'Table has an open order';
  end if;
  if exists(select 1 from public.table_bookings b where b.id<>_booking.id and b.table_id=_table.id and b.restaurant_id=_booking.restaurant_id and b.status in ('pending','confirmed','seated')
    and (b.status='seated' or tstzrange(b.booking_at,b.ends_at,'[)') && tstzrange(least(now(),_booking.booking_at),greatest(now()+interval '30 minutes',_booking.ends_at),'[)'))) then
    raise exception 'Table is allocated to another party';
  end if;
  update public.table_bookings set table_id=_table.id,status='seated' where id=_booking.id returning * into _booking;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
    values(_booking.restaurant_id,auth.uid(),'host_party_seated','table_booking',_booking.id,jsonb_build_object('table_id',_table.id));
  return _booking;
end;
$$;
revoke all on function public.seat_host_party(uuid,uuid) from public,anon;
grant execute on function public.seat_host_party(uuid,uuid) to authenticated;
