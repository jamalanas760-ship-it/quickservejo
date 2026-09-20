begin;

create or replace function public.delete_booking_reservation(
  _booking_id uuid,
  _reason text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  _b public.table_bookings;
begin
  select * into _b
  from public.table_bookings
  where id=_booking_id
  for update;

  if _b.id is null then return false; end if;

  if not (
    app.has_capability(_b.restaurant_id,'manage_tables')
    or app.has_capability(_b.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  if _b.status='seated' then
    raise exception 'An actively seated reservation cannot be deleted. Complete or cancel the table workflow first.';
  end if;

  if _b.deposit_status='paid' then
    raise exception 'A reservation with a paid deposit cannot be deleted until the deposit is refunded or waived.';
  end if;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(
    _b.restaurant_id,
    auth.uid(),
    'booking_deleted',
    'table_booking',
    _b.id,
    jsonb_build_object(
      'customer_name',_b.customer_name,
      'phone',_b.phone,
      'email',_b.email,
      'guest_count',_b.guest_count,
      'booking_at',_b.booking_at,
      'status',_b.status,
      'table_id',_b.table_id,
      'confirmation_code',_b.confirmation_code,
      'deposit_status',_b.deposit_status,
      'reason',nullif(left(trim(coalesce(_reason,'')),500),'')
    )
  );

  if _b.table_id is not null and _b.status in ('pending','confirmed','cancelled','no_show') then
    update public.restaurant_tables
    set service_status='free',
        activated_at=null,
        status_updated_at=now(),
        status_updated_by=auth.uid()
    where id=_b.table_id
      and restaurant_id=_b.restaurant_id
      and service_status='reserved';
  end if;

  delete from public.table_bookings where id=_b.id;
  return true;
end;
$$;

revoke all on function public.delete_booking_reservation(uuid,text) from public,anon;
grant execute on function public.delete_booking_reservation(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
