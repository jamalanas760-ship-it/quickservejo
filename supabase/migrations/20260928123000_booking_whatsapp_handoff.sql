begin;

create or replace function public.record_booking_whatsapp_handoff(
  _booking_id uuid,
  _body_length integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _restaurant_id uuid;
begin
  select b.restaurant_id into _restaurant_id
  from public.table_bookings b
  where b.id=_booking_id;

  if _restaurant_id is null then
    raise exception 'Reservation not found';
  end if;

  if not (
    app.has_capability(_restaurant_id,'manage_tables')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  insert into public.audit_logs(
    restaurant_id,actor_user_id,action,entity,entity_id,metadata
  ) values(
    _restaurant_id,auth.uid(),'booking_whatsapp_handoff_opened','table_booking',_booking_id,
    jsonb_build_object('body_length',greatest(0,least(coalesce(_body_length,0),2000)))
  );
end;
$$;

revoke all on function public.record_booking_whatsapp_handoff(uuid,integer) from public,anon;
grant execute on function public.record_booking_whatsapp_handoff(uuid,integer) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
