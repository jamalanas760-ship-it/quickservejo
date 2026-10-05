begin;
alter table public.orders add column if not exists table_visit_closed_at timestamptz;
create index if not exists orders_open_table_visit_idx on public.orders(table_id,restaurant_id) where table_visit_closed_at is null and status in ('new','accepted','preparing','ready','served') and payment_status <> 'paid';

-- Staff occupancy is real even before an order exists. Payment/departure still starts cleaning.
create or replace function app.reconcile_table_phase(_table_id uuid, _departed boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare _table public.restaurant_tables%rowtype; _next text; _live boolean; _reserved boolean;
begin
  select * into _table from public.restaurant_tables where id=_table_id for update;
  if not found then return null; end if;
  if not _table.is_active or _table.service_status='out_of_service' then return _table.service_status; end if;
  select exists(select 1 from public.orders o where o.table_id=_table.id
    and o.restaurant_id=_table.restaurant_id and o.table_visit_closed_at is null and o.status in ('new','accepted','preparing','ready','served')
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
      and o.table_visit_closed_at is null and o.status in ('new','accepted','preparing','ready','served') and o.payment_status<>'paid')
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

create or replace function app.sync_order_table_service_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare _id uuid; _old_id uuid; _new_id uuid; _departed boolean;
begin
  if tg_op<>'INSERT' then _old_id:=old.table_id; end if;
  if tg_op<>'DELETE' then _new_id:=new.table_id; end if;
  _departed:=false;
  if tg_op='DELETE' then _departed:=old.table_visit_closed_at is null; end if;
  if tg_op='UPDATE' then
    _departed:=old.table_visit_closed_at is null and (old.table_id is distinct from new.table_id
      or (old.status is distinct from new.status and new.status in ('paid','cancelled'))
      or (old.payment_status is distinct from new.payment_status and new.payment_status='paid')
      or new.table_visit_closed_at is not null);
  end if;
  for _id in select distinct id from unnest(array[_old_id,_new_id]) id where id is not null order by id loop
    perform app.reconcile_table_phase(_id,_departed);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function app.sync_order_table_service_status() from public,anon,authenticated;
drop trigger if exists trg_sync_order_table_service_status on public.orders;
create trigger trg_sync_order_table_service_status after insert or delete or update of status,payment_status,table_id,table_visit_closed_at on public.orders
for each row execute function app.sync_order_table_service_status();


-- End the seating visit without cancelling, paying, or detaching its orders.
create or replace function public.end_table_visit(_table_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare _table public.restaurant_tables%rowtype; _orders uuid[]; _bookings uuid[]; _next text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into _table from public.restaurant_tables where id=_table_id;
  if not found or not _table.is_active or not app.has_capability(_table.restaurant_id,'manage_tables') then
    raise exception 'Not allowed to release this table' using errcode='42501'; end if;
  -- Match the order/booking trigger lock order; never wait on those rows while holding the table.
  select coalesce(array_agg(id),'{}'::uuid[]) into _orders from (
    select id from public.orders where table_id=_table_id and restaurant_id=_table.restaurant_id
      and table_visit_closed_at is null and status in ('new','accepted','preparing','ready','served') and payment_status<>'paid'
      order by id for update) q;
  select coalesce(array_agg(id),'{}'::uuid[]) into _bookings from (
    select id from public.table_bookings where table_id=_table_id and restaurant_id=_table.restaurant_id and status='seated'
      order by id for update) q;
  select * into _table from public.restaurant_tables where id=_table_id for update;
  if not found or not _table.is_active then raise exception 'Table no longer available' using errcode='40001'; end if;
  if exists(select 1 from public.orders where table_id=_table_id and restaurant_id=_table.restaurant_id and table_visit_closed_at is null
      and status in ('new','accepted','preparing','ready','served') and payment_status<>'paid' and not(id=any(_orders)))
    or exists(select 1 from public.table_bookings where table_id=_table_id and restaurant_id=_table.restaurant_id and status='seated' and not(id=any(_bookings))) then
    raise exception 'The visit changed. Refresh the table and try again.' using errcode='40001'; end if;
  update public.orders set table_visit_closed_at=now() where id=any(_orders);
  update public.table_bookings set status='completed' where id=any(_bookings);
  update public.restaurant_tables set service_status='free',activated_at=null,status_updated_at=now(),status_updated_by=null where id=_table_id;
  _next:=app.reconcile_table_phase(_table_id);
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
    values(_table.restaurant_id,auth.uid(),'table_visit_ended','restaurant_table',_table_id,
      jsonb_build_object('previous_status',_table.service_status,'status',_next,'order_ids',_orders,'booking_ids',_bookings));
  return _next;
end; $$;
revoke all on function public.end_table_visit(uuid) from public,anon;
grant execute on function public.end_table_visit(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
