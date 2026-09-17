alter table public.restaurant_tables
  add column if not exists service_status text not null default 'free',
  add column if not exists activated_at timestamptz,
  add column if not exists status_updated_at timestamptz not null default now(),
  add column if not exists status_updated_by uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_tables_service_status_check') then
    alter table public.restaurant_tables add constraint restaurant_tables_service_status_check
      check (service_status in ('free','reserved','active','cleaning','out_of_service'));
  end if;
end $$;

create index if not exists restaurant_tables_status_idx
  on public.restaurant_tables (restaurant_id, service_status)
  where is_active;

create table if not exists public.table_bookings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.restaurant_tables(id) on delete set null,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 120),
  phone text,
  guest_count integer not null default 2 check (guest_count between 1 and 100),
  booking_at timestamptz not null,
  zone text,
  status text not null default 'pending' check (status in ('pending','confirmed','seated','completed','cancelled','no_show')),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists table_bookings_restaurant_time_idx on public.table_bookings (restaurant_id, booking_at);
create index if not exists table_bookings_table_time_idx on public.table_bookings (table_id, booking_at) where table_id is not null;
create index if not exists table_bookings_status_idx on public.table_bookings (restaurant_id, status, booking_at);

alter table public.table_bookings enable row level security;
drop policy if exists table_bookings_read on public.table_bookings;
create policy table_bookings_read on public.table_bookings for select to authenticated using (app.has_capability(restaurant_id, 'manage_tables'));
drop policy if exists table_bookings_insert on public.table_bookings;
create policy table_bookings_insert on public.table_bookings for insert to authenticated with check (app.has_capability(restaurant_id, 'manage_tables'));
drop policy if exists table_bookings_update on public.table_bookings;
create policy table_bookings_update on public.table_bookings for update to authenticated using (app.has_capability(restaurant_id, 'manage_tables')) with check (app.has_capability(restaurant_id, 'manage_tables'));
drop policy if exists table_bookings_delete on public.table_bookings;
create policy table_bookings_delete on public.table_bookings for delete to authenticated using (app.has_capability(restaurant_id, 'manage_tables'));

create or replace function public.touch_table_booking_updated_at()
returns trigger language plpgsql set search_path='public' as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists table_bookings_updated_at on public.table_bookings;
create trigger table_bookings_updated_at before update on public.table_bookings for each row execute function public.touch_table_booking_updated_at();

create or replace function public.sync_booking_table_status()
returns trigger language plpgsql security definer set search_path='public' as $$
begin
  if new.table_id is null then return new; end if;
  if new.status = 'confirmed' then
    update public.restaurant_tables set service_status='reserved', status_updated_at=now(), status_updated_by=auth.uid()
      where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='free';
  elsif new.status = 'seated' then
    update public.restaurant_tables set service_status='active', activated_at=coalesce(activated_at,now()), status_updated_at=now(), status_updated_by=auth.uid()
      where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status in ('free','reserved');
  elsif new.status in ('cancelled','no_show') then
    update public.restaurant_tables set service_status='free', activated_at=null, status_updated_at=now(), status_updated_by=auth.uid()
      where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='reserved';
  end if;
  return new;
end;
$$;
drop trigger if exists table_bookings_sync_table on public.table_bookings;
create trigger table_bookings_sync_table after insert or update of status,table_id on public.table_bookings for each row execute function public.sync_booking_table_status();

create or replace function public.activate_table_from_qr(_qr_token text)
returns text language plpgsql security definer set search_path='public' as $$
declare _status text;
begin
  if _qr_token is null or char_length(_qr_token) < 8 or char_length(_qr_token) > 256 then raise exception 'Invalid table token' using errcode='22023'; end if;
  update public.restaurant_tables set service_status='active', activated_at=coalesce(activated_at,now()), status_updated_at=now(), status_updated_by=null
   where qr_token=_qr_token and is_active and service_status='free';
  select service_status into _status from public.restaurant_tables where qr_token=_qr_token and is_active limit 1;
  if _status is null then raise exception 'Table not found' using errcode='P0002'; end if;
  return _status;
end;
$$;
revoke all on function public.activate_table_from_qr(text) from public;
grant execute on function public.activate_table_from_qr(text) to anon, authenticated;

create or replace function public.set_table_service_status(_table_id uuid, _status text)
returns text language plpgsql security definer set search_path='public' as $$
declare _restaurant_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if _status not in ('free','reserved','active','cleaning','out_of_service') then raise exception 'Invalid table status' using errcode='22023'; end if;
  select restaurant_id into _restaurant_id from public.restaurant_tables where id=_table_id and is_active;
  if _restaurant_id is null or not app.has_capability(_restaurant_id,'manage_tables') then raise exception 'Not allowed to update this table' using errcode='42501'; end if;
  update public.restaurant_tables set service_status=_status,
    activated_at=case when _status='active' then coalesce(activated_at,now()) when _status='free' then null else activated_at end,
    status_updated_at=now(), status_updated_by=auth.uid() where id=_table_id;
  return _status;
end;
$$;
revoke all on function public.set_table_service_status(uuid,text) from public;
grant execute on function public.set_table_service_status(uuid,text) to authenticated;

alter table public.erp_stock_movements
  add column if not exists movement_type text not null default 'adjustment',
  add column if not exists total_cost numeric generated always as (abs(quantity) * unit_cost) stored,
  add column if not exists finance_expense_id uuid references public.erp_expenses(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='erp_stock_movements_movement_type_check') then
    alter table public.erp_stock_movements add constraint erp_stock_movements_movement_type_check check (movement_type in ('receipt','issue','adjustment','transfer','waste'));
  end if;
end $$;

alter table public.erp_expenses
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists supplier_id uuid references public.erp_suppliers(id) on delete set null;
create unique index if not exists erp_expenses_source_unique_idx on public.erp_expenses (restaurant_id, source_type, source_id) where source_id is not null;
create index if not exists erp_expenses_supplier_idx on public.erp_expenses (supplier_id) where supplier_id is not null;
create index if not exists erp_stock_movements_finance_expense_idx on public.erp_stock_movements (finance_expense_id) where finance_expense_id is not null;

create or replace function public.erp_post_receipt_expense()
returns trigger language plpgsql security definer set search_path='public' as $$
declare _item_name text; _supplier_name text; _expense_id uuid;
begin
  if new.movement_type <> 'receipt' or new.quantity <= 0 or new.total_cost <= 0 then return new; end if;
  select name into _item_name from public.erp_inventory where id=new.item_id and restaurant_id=new.restaurant_id;
  if new.supplier_id is not null then select name into _supplier_name from public.erp_suppliers where id=new.supplier_id and restaurant_id=new.restaurant_id; end if;
  insert into public.erp_expenses (restaurant_id,description,category,amount,expense_date,reference,created_by,source_type,source_id,supplier_id)
  values (new.restaurant_id,concat('Inventory receipt · ',coalesce(_item_name,'Item'),case when _supplier_name is not null then concat(' · ',_supplier_name) else '' end),'supplies',new.total_cost,current_date,concat('AUTO-REC-',upper(left(new.id::text,8))),new.created_by,'inventory_receiving',new.id,new.supplier_id)
  on conflict (restaurant_id,source_type,source_id) where source_id is not null do update set amount=excluded.amount, description=excluded.description, supplier_id=excluded.supplier_id
  returning id into _expense_id;
  update public.erp_stock_movements set finance_expense_id=_expense_id where id=new.id;
  return new;
end;
$$;
drop trigger if exists erp_stock_receipt_expense on public.erp_stock_movements;
create trigger erp_stock_receipt_expense after insert on public.erp_stock_movements for each row execute function public.erp_post_receipt_expense();