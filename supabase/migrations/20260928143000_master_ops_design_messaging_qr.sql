begin;

create or replace function public.activate_table_from_qr(_qr_token text)
returns text
language plpgsql
security definer
set search_path='public'
as $$
declare _status text;
begin
  if _qr_token is null or char_length(_qr_token)<8 or char_length(_qr_token)>256 then
    raise exception 'Invalid table token' using errcode='22023';
  end if;

  -- A QR scan proves browsing intent, not that a guest has placed an order.
  -- Preserve the visible floor status and retain only a short-lived scan marker.
  update public.restaurant_tables
     set activated_at=now(),
         status_updated_at=now(),
         status_updated_by=null
   where qr_token=_qr_token
     and is_active
     and service_status in ('free','reserved');

  select service_status into _status
  from public.restaurant_tables
  where qr_token=_qr_token and is_active
  limit 1;

  if _status is null then
    raise exception 'Table not found' using errcode='P0002';
  end if;
  if _status='out_of_service' then
    raise exception 'Table is out of service' using errcode='22023';
  end if;
  return _status;
end;
$$;

create or replace function app.release_unordered_qr_tables()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  _cleared integer:=0;
  _legacy integer:=0;
begin
  -- Scan-only sessions expire without changing Free/Reserved.
  update public.restaurant_tables t
  set activated_at=null,
      status_updated_at=now(),
      status_updated_by=null
  where t.is_active
    and t.service_status in ('free','reserved')
    and t.status_updated_by is null
    and t.activated_at is not null
    and t.activated_at<=now()-interval '20 minutes'
    and not exists(
      select 1
      from public.orders o
      where o.table_id=t.id
        and o.created_at>=t.activated_at
        and o.status in ('new','accepted','preparing','ready','served')
    );
  get diagnostics _cleared=row_count;

  -- Repair legacy scan-created Active/Occupied rows when no real order exists.
  update public.restaurant_tables t
  set service_status=case
        when exists(
          select 1
          from public.table_bookings b
          where b.table_id=t.id
            and b.restaurant_id=t.restaurant_id
            and b.status='confirmed'
            and b.booking_at between now() and now()+interval '2 hours'
        ) then 'reserved'
        else 'free'
      end,
      activated_at=null,
      status_updated_at=now(),
      status_updated_by=null
  where t.is_active
    and t.service_status='active'
    and t.status_updated_by is null
    and t.activated_at is not null
    and t.activated_at<=now()-interval '20 minutes'
    and not exists(
      select 1
      from public.orders o
      where o.table_id=t.id
        and o.created_at>=t.activated_at
        and o.status in ('new','accepted','preparing','ready','served')
    );
  get diagnostics _legacy=row_count;

  return _cleared+_legacy;
end;
$$;

select app.release_unordered_qr_tables();
notify pgrst,'reload schema';
commit;
