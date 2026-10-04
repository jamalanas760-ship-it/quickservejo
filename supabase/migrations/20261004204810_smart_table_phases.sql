begin;

-- Internal reconciliation serializes changes per table and evaluates all live sources.
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

create or replace function app.sync_order_table_service_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare _id uuid; _old_id uuid; _new_id uuid; _departed boolean;
begin
  if tg_op<>'INSERT' then _old_id:=old.table_id; end if;
  if tg_op<>'DELETE' then _new_id:=new.table_id; end if;
  _departed:=tg_op='DELETE';
  if tg_op='UPDATE' then
    _departed:=old.table_id is distinct from new.table_id
      or (old.status is distinct from new.status and new.status in ('paid','cancelled'))
      or (old.payment_status is distinct from new.payment_status and new.payment_status='paid');
  end if;
  for _id in select distinct id from unnest(array[_old_id,_new_id]) id where id is not null order by id loop
    perform app.reconcile_table_phase(_id,_departed);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function app.sync_order_table_service_status() from public,anon,authenticated;
drop trigger if exists trg_sync_order_table_service_status on public.orders;
create trigger trg_sync_order_table_service_status after insert or delete or update of status,payment_status,table_id on public.orders
for each row execute function app.sync_order_table_service_status();

create or replace function public.sync_booking_table_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare _id uuid; _old_id uuid; _new_id uuid; _departed boolean:=false;
begin
  if tg_op<>'INSERT' then _old_id:=old.table_id; end if;
  if tg_op<>'DELETE' then _new_id:=new.table_id; end if;
  if tg_op='DELETE' then _departed:=old.status='seated';
  elsif tg_op='UPDATE' then
    _departed:=old.status='seated' and (new.status<>'seated' or old.table_id is distinct from new.table_id);
  end if;
  for _id in select distinct id from unnest(array[_old_id,_new_id]) id where id is not null order by id loop
    perform app.reconcile_table_phase(_id,_departed);
  end loop;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function public.sync_booking_table_status() from public,anon,authenticated;
drop trigger if exists table_bookings_sync_table on public.table_bookings;
create trigger table_bookings_sync_table after insert or delete or update of status,table_id,booking_at,ends_at on public.table_bookings
for each row execute function public.sync_booking_table_status();

create or replace function public.refresh_upcoming_booking_table_statuses()
returns integer language plpgsql security definer set search_path='' as $$
declare _id uuid; _count integer:=0;
begin
  for _id in select t.id from public.restaurant_tables t where t.is_active
    and t.service_status in ('free','reserved') and (t.status_updated_by is null or t.service_status='free')
    and (t.service_status='reserved' or exists(select 1 from public.table_bookings b
      where b.table_id=t.id and b.restaurant_id=t.restaurant_id and b.status='confirmed'
      and b.booking_at<=now()+interval '2 hours'
      and coalesce(b.ends_at,b.booking_at+coalesce(b.duration_minutes,90)*interval '1 minute')>now())) order by t.id loop
    perform app.reconcile_table_phase(_id); _count:=_count+1;
  end loop;
  return _count;
end; $$;
revoke all on function public.refresh_upcoming_booking_table_statuses() from public,anon,authenticated;

-- A scan never proves occupancy. Only expire scan markers; never evict seated guests.
create or replace function app.release_unordered_qr_tables()
returns integer language plpgsql security definer set search_path='' as $$
declare _count integer;
begin
  update public.restaurant_tables set activated_at=null
  where is_active and service_status in ('free','reserved') and activated_at<now()-interval '20 minutes';
  get diagnostics _count=row_count; return _count;
end; $$;
revoke all on function app.release_unordered_qr_tables() from public,anon,authenticated;

-- Automatic cleaning keeps the existing ten-minute turnaround; staff can finish sooner.
create or replace function app.release_cleaning_tables()
returns integer language plpgsql security definer set search_path='' as $$
declare _table public.restaurant_tables%rowtype; _count integer:=0; _next text;
begin
  for _table in select * from public.restaurant_tables where is_active and service_status='cleaning'
    and status_updated_by is null and status_updated_at<=now()-interval '10 minutes' order by id for update skip locked loop
    _next:=app.reconcile_table_phase(_table.id);
    if _next='cleaning' then
      update public.restaurant_tables set service_status='free',activated_at=null,status_updated_at=now(),status_updated_by=null where id=_table.id;
      perform app.reconcile_table_phase(_table.id); _count:=_count+1;
    end if;
  end loop;
  return _count;
end; $$;
revoke all on function app.release_cleaning_tables() from public,anon,authenticated;

create or replace function public.set_table_service_status(_table_id uuid,_status text)
returns text language plpgsql security definer set search_path='' as $$
declare _table public.restaurant_tables%rowtype; _next text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if _status not in ('free','reserved','active','cleaning','out_of_service') then raise exception 'Invalid table status' using errcode='22023'; end if;
  select * into _table from public.restaurant_tables where id=_table_id for update;
  if not found or not _table.is_active or not app.has_capability(_table.restaurant_id,'manage_tables') then
    raise exception 'Not allowed to update this table' using errcode='42501'; end if;
  if _status in ('free','reserved','cleaning') and (
    exists(select 1 from public.orders o where o.table_id=_table_id and o.restaurant_id=_table.restaurant_id
      and o.status in ('new','accepted','preparing','ready','served') and o.payment_status<>'paid')
    or exists(select 1 from public.table_bookings b where b.table_id=_table_id and b.restaurant_id=_table.restaurant_id and b.status='seated')) then
    raise exception 'Close active orders and complete seated bookings first.' using errcode='22023'; end if;
  update public.restaurant_tables set service_status=_status,
    activated_at=case when _status='active' then coalesce(activated_at,now()) else null end,
    status_updated_at=now(),status_updated_by=auth.uid() where id=_table_id;
  -- Cleaning finished or maintenance ended: reserve immediately if a booking is due.
  if _status='free' then _next:=app.reconcile_table_phase(_table_id); else _next:=_status; end if;
  return _next;
end; $$;
revoke all on function public.set_table_service_status(uuid,text) from public,anon;
grant execute on function public.set_table_service_status(uuid,text) to authenticated;

create index if not exists orders_live_table_phase_idx on public.orders(table_id,restaurant_id)
where status in ('new','accepted','preparing','ready','served') and payment_status<>'paid';
create index if not exists bookings_live_table_phase_idx on public.table_bookings(table_id,restaurant_id,booking_at)
where status in ('confirmed','seated');
select cron.schedule('quickserve-booking-table-status','* * * * *','select public.refresh_upcoming_booking_table_statuses();');
notify pgrst,'reload schema';
commit;
