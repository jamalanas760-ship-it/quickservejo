begin;

create table if not exists public.manager_daily_closes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  close_date date not null,
  status text not null default 'draft' check (status in ('draft','finalized','reopened')),
  snapshot jsonb not null default '{}'::jsonb,
  notes text not null default '',
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, close_date)
);

create index if not exists manager_daily_closes_restaurant_date_idx
  on public.manager_daily_closes(restaurant_id, close_date desc);

alter table public.manager_daily_closes enable row level security;
drop policy if exists manager_daily_closes_select on public.manager_daily_closes;
create policy manager_daily_closes_select
on public.manager_daily_closes
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_restaurant')
  or app.has_capability(restaurant_id,'manage_payments')
  or app.has_capability(restaurant_id,'view_analytics')
  or app.is_super_admin()
);

revoke all on public.manager_daily_closes from public, anon, authenticated;
grant select on public.manager_daily_closes to authenticated;
grant all on public.manager_daily_closes to service_role;

drop trigger if exists trg_manager_daily_closes_updated on public.manager_daily_closes;
create trigger trg_manager_daily_closes_updated
before update on public.manager_daily_closes
for each row execute function public.set_updated_at();

create or replace function public.get_manager_daily_close_summary(
  _restaurant_id uuid,
  _close_date date default current_date
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _tz text;
  _start timestamptz;
  _finish timestamptz;
  _result jsonb;
begin
  if not (
    app.has_capability(_restaurant_id,'manage_restaurant')
    or app.has_capability(_restaurant_id,'manage_payments')
    or app.has_capability(_restaurant_id,'view_analytics')
    or app.is_super_admin()
  ) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  select coalesce(nullif(timezone,''),'UTC') into _tz
  from public.restaurants where id=_restaurant_id;
  if _tz is null then raise exception 'Restaurant not found' using errcode='22023'; end if;

  _start := (_close_date::timestamp at time zone _tz);
  _finish := ((_close_date + 1)::timestamp at time zone _tz);

  with
  order_summary as (
    select
      count(*)::int as orders_count,
      count(*) filter (where status='cancelled')::int as cancelled_orders,
      coalesce(sum(total) filter (where payment_status='paid'),0)::numeric as paid_order_total,
      coalesce(sum(tax_amount) filter (where payment_status='paid'),0)::numeric as tax_total,
      coalesce(sum(service_amount) filter (where payment_status='paid'),0)::numeric as service_total,
      coalesce(sum(discount_amount) filter (where payment_status='paid'),0)::numeric as discount_total,
      coalesce(sum(delivery_amount) filter (where payment_status='paid'),0)::numeric as delivery_total,
      coalesce(sum(tip_amount) filter (where payment_status='paid'),0)::numeric as tips_on_orders
    from public.orders
    where restaurant_id=_restaurant_id and created_at>=_start and created_at<_finish
  ),
  payment_summary as (
    select
      coalesce(sum(amount) filter (where transaction_type='payment' and status='completed'),0)::numeric as gross_payments,
      coalesce(sum(amount) filter (where transaction_type='refund' and status='completed'),0)::numeric as refunds,
      coalesce(sum(tip_amount) filter (where transaction_type='payment' and status='completed'),0)::numeric as payment_tips,
      coalesce(sum(amount) filter (where transaction_type='payment' and status='completed' and method='cash'),0)::numeric as cash,
      coalesce(sum(amount) filter (where transaction_type='payment' and status='completed' and method='card'),0)::numeric as card,
      coalesce(sum(amount) filter (where transaction_type='payment' and status='completed' and method='wallet'),0)::numeric as wallet,
      coalesce(sum(amount) filter (where transaction_type='payment' and status='completed' and method='gift_card'),0)::numeric as gift_card,
      coalesce(sum(amount) filter (where transaction_type='payment' and status='completed' and method='other'),0)::numeric as other
    from public.payment_transactions
    where restaurant_id=_restaurant_id and created_at>=_start and created_at<_finish
  ),
  cash_summary as (
    select
      count(*)::int as session_count,
      count(*) filter (where closed_at is null)::int as open_sessions,
      coalesce(sum(opening_float),0)::numeric as opening_float,
      coalesce(sum(closing_cash) filter (where closed_at is not null),0)::numeric as closing_cash,
      coalesce(sum(expected_cash) filter (where closed_at is not null),0)::numeric as expected_cash,
      coalesce(sum(variance) filter (where closed_at is not null),0)::numeric as cash_variance
    from public.cash_sessions
    where restaurant_id=_restaurant_id and opened_at>=_start and opened_at<_finish
  ),
  labor_summary as (
    select
      count(distinct staff_id)::int as staff_count,
      coalesce(sum(
        greatest(
          0,
          extract(epoch from (least(coalesce(clock_out,_finish),_finish)-greatest(clock_in,_start)))/3600
          - (break_minutes::numeric/60)
        )
      ),0)::numeric as labor_hours
    from public.staff_time_entries
    where restaurant_id=_restaurant_id
      and clock_in<_finish
      and coalesce(clock_out,_finish)>_start
  ),
  stock_summary as (
    select
      count(*)::int as movement_count,
      count(*) filter (where movement_type not in ('receipt','issue'))::int as unusual_movements,
      coalesce(sum(abs(coalesce(total_cost, quantity*unit_cost))) filter (where movement_type not in ('receipt','issue')),0)::numeric as unusual_movement_value
    from public.erp_stock_movements
    where restaurant_id=_restaurant_id and created_at>=_start and created_at<_finish
  )
  select jsonb_build_object(
    'date', _close_date,
    'timezone', _tz,
    'period_start', _start,
    'period_end', _finish,
    'orders', jsonb_build_object(
      'count', o.orders_count,
      'cancelled', o.cancelled_orders,
      'paid_total', round(o.paid_order_total,3),
      'tax', round(o.tax_total,3),
      'service', round(o.service_total,3),
      'discounts', round(o.discount_total,3),
      'delivery', round(o.delivery_total,3),
      'tips', round(o.tips_on_orders,3)
    ),
    'payments', jsonb_build_object(
      'gross', round(p.gross_payments,3),
      'refunds', round(p.refunds,3),
      'net', round(p.gross_payments-p.refunds,3),
      'tips', round(p.payment_tips,3),
      'cash', round(p.cash,3),
      'card', round(p.card,3),
      'wallet', round(p.wallet,3),
      'gift_card', round(p.gift_card,3),
      'other', round(p.other,3)
    ),
    'cash', jsonb_build_object(
      'sessions', c.session_count,
      'open_sessions', c.open_sessions,
      'opening_float', round(c.opening_float,3),
      'closing_cash', round(c.closing_cash,3),
      'expected_cash', round(c.expected_cash,3),
      'variance', round(c.cash_variance,3)
    ),
    'labor', jsonb_build_object(
      'staff_count', l.staff_count,
      'hours', round(l.labor_hours,2)
    ),
    'inventory', jsonb_build_object(
      'movement_count', s.movement_count,
      'unusual_movements', s.unusual_movements,
      'unusual_value', round(s.unusual_movement_value,3)
    )
  ) into _result
  from order_summary o, payment_summary p, cash_summary c, labor_summary l, stock_summary s;

  return _result;
end;
$$;

revoke all on function public.get_manager_daily_close_summary(uuid,date) from public, anon;
grant execute on function public.get_manager_daily_close_summary(uuid,date) to authenticated;

create or replace function public.finalize_manager_daily_close(
  _restaurant_id uuid,
  _close_date date,
  _notes text default ''
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _summary jsonb;
  _id uuid;
  _existing public.manager_daily_closes%rowtype;
begin
  if not (
    app.has_capability(_restaurant_id,'manage_restaurant')
    or app.has_capability(_restaurant_id,'manage_payments')
    or app.is_super_admin()
  ) then
    raise exception 'Manager access is required' using errcode='42501';
  end if;

  select * into _existing
  from public.manager_daily_closes
  where restaurant_id=_restaurant_id and close_date=_close_date
  for update;

  if _existing.status='finalized' then
    raise exception 'Daily close is already finalized';
  end if;

  _summary := public.get_manager_daily_close_summary(_restaurant_id,_close_date);

  if coalesce((_summary->'cash'->>'open_sessions')::int,0) > 0 then
    raise exception 'Close all cash sessions before finalizing the day';
  end if;

  insert into public.manager_daily_closes(
    restaurant_id,close_date,status,snapshot,notes,finalized_by,finalized_at,
    reopened_by,reopened_at,reopen_reason
  ) values(
    _restaurant_id,_close_date,'finalized',_summary,left(coalesce(_notes,''),2000),
    auth.uid(),now(),null,null,null
  )
  on conflict (restaurant_id,close_date) do update
  set status='finalized',
      snapshot=excluded.snapshot,
      notes=excluded.notes,
      finalized_by=auth.uid(),
      finalized_at=now(),
      reopened_by=null,
      reopened_at=null,
      reopen_reason=null,
      updated_at=now()
  returning id into _id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'daily_close_finalized','manager_daily_close',_id,jsonb_build_object('close_date',_close_date));

  return _id;
end;
$$;

revoke all on function public.finalize_manager_daily_close(uuid,date,text) from public, anon;
grant execute on function public.finalize_manager_daily_close(uuid,date,text) to authenticated;

create or replace function public.reopen_manager_daily_close(
  _close_id uuid,
  _reason text
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _row public.manager_daily_closes%rowtype;
begin
  select * into _row from public.manager_daily_closes where id=_close_id for update;
  if _row.id is null then raise exception 'Daily close not found'; end if;

  if not (
    app.has_capability(_row.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Restaurant admin access is required' using errcode='42501';
  end if;

  if _row.status<>'finalized' then raise exception 'Only finalized closes can be reopened'; end if;
  if length(trim(coalesce(_reason,'')))<5 then raise exception 'Reopen reason is required'; end if;

  update public.manager_daily_closes
  set status='reopened',
      reopened_by=auth.uid(),
      reopened_at=now(),
      reopen_reason=left(trim(_reason),1000),
      updated_at=now()
  where id=_close_id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_row.restaurant_id,auth.uid(),'daily_close_reopened','manager_daily_close',_close_id,jsonb_build_object('reason',left(trim(_reason),1000),'close_date',_row.close_date));
end;
$$;

revoke all on function public.reopen_manager_daily_close(uuid,text) from public, anon;
grant execute on function public.reopen_manager_daily_close(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
