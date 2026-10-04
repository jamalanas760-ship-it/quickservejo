begin;

-- Staff occupancy is real even before an order exists. Payment/departure still starts cleaning.
create or replace function app.reconcile_table_phase(_table_id uuid, _departed boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare _table public.restaurant_tables%rowtype; _next text; _live boolean; _reserved boolean;
begin
  select * into _table from public.restaurant_tables where id=_table_id for update;
  if not found then return null; end if;
  if not _table.is_active or _table.service_status='out_of_service' then return _table.service_status; end if;
  select exists(select 1 from public.orders o where o.table_id=_table.id
    and o.restaurant_id=_table.restaurant_id and o.status in ('new','accepted','preparing','ready','served')
    and o.payment_status <> 'paid')
    or exists(select 1 from public.table_bookings b where b.table_id=_table.id
      and b.restaurant_id=_table.restaurant_id and b.status='seated') into _live;
  select exists(select 1 from public.table_bookings b where b.table_id=_table.id
    and b.restaurant_id=_table.restaurant_id and b.status='confirmed'
    and b.booking_at<=now()+interval '2 hours'
    and coalesce(b.ends_at,b.booking_at+coalesce(b.duration_minutes,90)*interval '1 minute')>now()) into _reserved;
  _next:=case
    when _live then 'active'
    when _departed and _table.service_status='active' then 'cleaning'
    when _table.service_status='cleaning' then 'cleaning'
    when _table.service_status='active' and _table.status_updated_by is not null then 'active'
    when _reserved then 'reserved'
    when _table.service_status='reserved' and _table.status_updated_by is not null then 'reserved'
    else 'free' end;
  if _next is distinct from _table.service_status then
    update public.restaurant_tables set service_status=_next,
      activated_at=case when _next='active' then coalesce(activated_at,now()) else null end,
      status_updated_at=now(),status_updated_by=null where id=_table.id;
  end if;
  return _next;
end; $$;
revoke all on function app.reconcile_table_phase(uuid,boolean) from public,anon,authenticated;

create or replace function public.set_table_service_status(_table_id uuid,_status text)
returns text language plpgsql security definer set search_path='' as $$
declare _table public.restaurant_tables%rowtype; _next text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if _status not in ('free','reserved','active','cleaning','cleaning_auto','out_of_service','automatic') then raise exception 'Invalid table status' using errcode='22023'; end if;
  select * into _table from public.restaurant_tables where id=_table_id for update;
  if not found or not _table.is_active or not app.has_capability(_table.restaurant_id,'manage_tables') then
    raise exception 'Not allowed to update this table' using errcode='42501'; end if;
  if _status='automatic' then
    update public.restaurant_tables set
      service_status=case when service_status='out_of_service' then 'free'
        when service_status='active' then 'cleaning' else service_status end,
      status_updated_by=null,
      status_updated_at=now()
      where id=_table_id;
    return app.reconcile_table_phase(_table_id);
  end if;
  if _status in ('free','reserved','cleaning','cleaning_auto') and (
    exists(select 1 from public.orders o where o.table_id=_table_id and o.restaurant_id=_table.restaurant_id
      and o.status in ('new','accepted','preparing','ready','served') and o.payment_status<>'paid')
    or exists(select 1 from public.table_bookings b where b.table_id=_table_id and b.restaurant_id=_table.restaurant_id and b.status='seated')) then
    raise exception 'Close active orders and complete seated bookings first.' using errcode='22023'; end if;
  update public.restaurant_tables set service_status=case when _status='cleaning_auto' then 'cleaning' else _status end,
    activated_at=case when _status='active' then coalesce(activated_at,now()) else null end,
    status_updated_at=now(),status_updated_by=case when _status in ('free','cleaning_auto') then null else auth.uid() end where id=_table_id;
  -- Cleaning finished or maintenance ended: reserve immediately if a booking is due.
  if _status='free' then _next:=app.reconcile_table_phase(_table_id); else _next:=case when _status='cleaning_auto' then 'cleaning' else _status end; end if;
  return _next;
end; $$;
revoke all on function public.set_table_service_status(uuid,text) from public,anon;
grant execute on function public.set_table_service_status(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
