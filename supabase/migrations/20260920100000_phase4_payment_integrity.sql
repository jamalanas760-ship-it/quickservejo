
-- Phase 4 payment correctness: tenant-safe cash sessions, capped settlements,
-- real gift-card redemption, payment-linked refunds and delivery accounting.

alter table public.orders
  add column if not exists delivery_amount numeric not null default 0 check (delivery_amount >= 0);

alter table public.payment_transactions
  add column if not exists parent_transaction_id uuid references public.payment_transactions(id) on delete set null;

create index if not exists payment_transactions_parent_idx
  on public.payment_transactions(parent_transaction_id)
  where parent_transaction_id is not null;

drop function if exists public.open_cash_session(numeric,uuid);

create or replace function public.open_cash_session(
  _restaurant_id uuid,
  _opening_float numeric default 0,
  _staff_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _id uuid;
  _resolved_staff uuid;
begin
  if _restaurant_id is null then raise exception 'Restaurant is required'; end if;

  select id into _resolved_staff
  from public.staff
  where restaurant_id=_restaurant_id
    and auth_user_id=(select auth.uid())
    and is_active
  order by updated_at desc
  limit 1;

  if _resolved_staff is null or not (
    app.has_capability(_restaurant_id,'manage_payments')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Cashier access is required';
  end if;

  if _staff_id is not null and _staff_id <> _resolved_staff and not app.is_super_admin() then
    raise exception 'Invalid staff profile';
  end if;

  select id into _id
  from public.cash_sessions
  where restaurant_id=_restaurant_id
    and opened_by=(select auth.uid())
    and closed_at is null
  order by opened_at desc
  limit 1;

  if _id is not null then return _id; end if;

  insert into public.cash_sessions(restaurant_id,staff_id,opening_float)
  values(_restaurant_id,coalesce(_staff_id,_resolved_staff),greatest(coalesce(_opening_float,0),0))
  returning id into _id;

  return _id;
end;
$$;

revoke all on function public.open_cash_session(uuid,numeric,uuid) from public,anon;
grant execute on function public.open_cash_session(uuid,numeric,uuid) to authenticated,service_role;

create or replace function public.record_order_payment(
  _order_id uuid,
  _method text,
  _amount numeric,
  _tip numeric default 0,
  _reference text default '',
  _cash_session_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _order public.orders%rowtype;
  _id uuid;
  _paid_before numeric;
  _paid_after numeric;
  _due numeric;
  _session public.cash_sessions%rowtype;
  _gift public.crm_gift_cards%rowtype;
  _metadata jsonb := '{}'::jsonb;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then raise exception 'Order not found'; end if;

  if not (
    app.has_capability(_order.restaurant_id,'manage_payments')
    or app.has_capability(_order.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Payment access is required';
  end if;

  if _method not in ('cash','card','wallet','gift_card','other') then
    raise exception 'Unsupported payment method';
  end if;
  if coalesce(_amount,0) <= 0 then raise exception 'Payment amount must be positive'; end if;
  if coalesce(_tip,0) < 0 then raise exception 'Tip cannot be negative'; end if;
  if _method='gift_card' and coalesce(_tip,0) > 0 then
    raise exception 'Gift cards cannot fund tips';
  end if;

  select
    coalesce(sum(case when transaction_type='payment' and status='completed' then amount else 0 end),0)
    - coalesce(sum(case when transaction_type='refund' and status='completed' then amount else 0 end),0)
  into _paid_before
  from public.payment_transactions
  where order_id=_order_id;

  _due := greatest(_order.total - _paid_before,0);
  if _due <= 0 then raise exception 'Order is already fully paid'; end if;
  if _amount > _due + 0.005 then raise exception 'Payment exceeds outstanding balance'; end if;

  if _cash_session_id is not null then
    select * into _session from public.cash_sessions where id=_cash_session_id for update;
    if _session.id is null
       or _session.restaurant_id <> _order.restaurant_id
       or _session.closed_at is not null then
      raise exception 'Invalid or closed cash session';
    end if;
  end if;

  if _method='cash' and _cash_session_id is null then
    -- Cash remains allowed for resilience, but is intentionally marked
    -- unreconciled when no open drawer session is attached.
    _metadata := jsonb_build_object('unreconciled_cash',true);
  end if;

  if _method='gift_card' then
    if nullif(btrim(coalesce(_reference,'')),'') is null then
      raise exception 'Gift card code is required';
    end if;

    select * into _gift
    from public.crm_gift_cards
    where restaurant_id=_order.restaurant_id
      and upper(code)=upper(btrim(_reference))
    for update;

    if _gift.id is null then raise exception 'Gift card not found'; end if;
    if _gift.status <> 'active' then raise exception 'Gift card is not active'; end if;
    if _gift.expires_at is not null and _gift.expires_at < now() then
      raise exception 'Gift card has expired';
    end if;
    if _gift.balance + 0.005 < _amount then raise exception 'Gift card balance is insufficient'; end if;

    update public.crm_gift_cards
    set balance=greatest(balance-_amount,0),
        status=case when balance-_amount <= 0.005 then 'used' else 'active' end
    where id=_gift.id;

    _metadata := jsonb_build_object('gift_card_id',_gift.id);
  end if;

  insert into public.payment_transactions(
    restaurant_id,order_id,cash_session_id,transaction_type,method,
    amount,tip_amount,reference,status,metadata
  ) values(
    _order.restaurant_id,_order_id,_cash_session_id,'payment',_method,
    round(_amount,3),round(greatest(coalesce(_tip,0),0),3),
    left(coalesce(_reference,''),200),'completed',_metadata
  ) returning id into _id;

  _paid_after := _paid_before + _amount;

  update public.orders
  set tip_amount=tip_amount+greatest(coalesce(_tip,0),0),
      payment_status=case when _paid_after+0.005>=total then 'paid'::public.payment_status else 'unpaid'::public.payment_status end,
      status=case when _paid_after+0.005>=total and status='served' then 'paid'::public.order_status else status end,
      updated_at=now()
  where id=_order_id;

  return _id;
end;
$$;

drop function if exists public.refund_order_payment(uuid,numeric,text,text);

create or replace function public.refund_order_payment(
  _order_id uuid,
  _amount numeric,
  _payment_id uuid,
  _reference text default '',
  _cash_session_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _order public.orders%rowtype;
  _original public.payment_transactions%rowtype;
  _id uuid;
  _already_refunded numeric;
  _net numeric;
  _gift_id uuid;
  _session public.cash_sessions%rowtype;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then raise exception 'Order not found'; end if;

  if not (
    app.has_capability(_order.restaurant_id,'manage_payments')
    or app.has_capability(_order.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Payment access is required';
  end if;

  if coalesce(_amount,0)<=0 then raise exception 'Refund amount must be positive'; end if;

  select * into _original
  from public.payment_transactions
  where id=_payment_id
    and order_id=_order_id
    and restaurant_id=_order.restaurant_id
    and transaction_type='payment'
    and status='completed'
  for update;

  if _original.id is null then raise exception 'Original payment not found'; end if;

  select coalesce(sum(amount),0)
  into _already_refunded
  from public.payment_transactions
  where parent_transaction_id=_original.id
    and transaction_type='refund'
    and status='completed';

  if _amount > (_original.amount - _already_refunded) + 0.005 then
    raise exception 'Refund exceeds remaining refundable amount';
  end if;

  if _cash_session_id is not null then
    select * into _session from public.cash_sessions where id=_cash_session_id for update;
    if _session.id is null
       or _session.restaurant_id <> _order.restaurant_id
       or _session.closed_at is not null then
      raise exception 'Invalid or closed cash session';
    end if;
  end if;

  insert into public.payment_transactions(
    restaurant_id,order_id,cash_session_id,parent_transaction_id,
    transaction_type,method,amount,tip_amount,reference,status,metadata
  ) values(
    _order.restaurant_id,_order_id,
    case when _original.method='cash' then _cash_session_id else null end,
    _original.id,'refund',_original.method,round(_amount,3),0,
    left(coalesce(_reference,''),200),'completed',
    jsonb_build_object('source_payment_id',_original.id)
  ) returning id into _id;

  if _original.method='gift_card' then
    begin
      _gift_id := nullif(_original.metadata->>'gift_card_id','')::uuid;
    exception when others then
      _gift_id := null;
    end;
    if _gift_id is not null then
      update public.crm_gift_cards
      set balance=least(initial_value,balance+_amount),
          status='active'
      where id=_gift_id and restaurant_id=_order.restaurant_id;
    end if;
  end if;

  select
    coalesce(sum(case when transaction_type='payment' and status='completed' then amount else 0 end),0)
    - coalesce(sum(case when transaction_type='refund' and status='completed' then amount else 0 end),0)
  into _net
  from public.payment_transactions
  where order_id=_order_id;

  update public.orders
  set payment_status=case
        when _net<=0.005 then 'refunded'::public.payment_status
        when _net+0.005<total then 'unpaid'::public.payment_status
        else 'paid'::public.payment_status
      end,
      status=case
        when status='paid' and _net+0.005<total then 'served'::public.order_status
        else status
      end,
      updated_at=now()
  where id=_order_id;

  return _id;
end;
$$;

revoke all on function public.refund_order_payment(uuid,numeric,uuid,text,uuid) from public,anon;
grant execute on function public.refund_order_payment(uuid,numeric,uuid,text,uuid) to authenticated,service_role;

create or replace function public.close_cash_session(
  _session_id uuid,_closing_cash numeric,_notes text default ''
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _session public.cash_sessions%rowtype;
  _expected numeric;
begin
  select * into _session from public.cash_sessions where id=_session_id for update;
  if _session.id is null or _session.closed_at is not null then
    raise exception 'Open cash session not found';
  end if;

  if not (
    app.has_capability(_session.restaurant_id,'manage_payments')
    or app.has_capability(_session.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Payment access is required';
  end if;

  select _session.opening_float
    + coalesce(sum(case
        when transaction_type='payment' and method='cash' and status='completed'
        then amount+tip_amount else 0 end),0)
    - coalesce(sum(case
        when transaction_type='refund' and method='cash' and status='completed'
        then amount+tip_amount else 0 end),0)
  into _expected
  from public.payment_transactions
  where cash_session_id=_session_id;

  update public.cash_sessions
  set closed_at=now(),
      closed_by=(select auth.uid()),
      closing_cash=_closing_cash,
      expected_cash=_expected,
      variance=coalesce(_closing_cash,0)-_expected,
      notes=left(coalesce(_notes,''),1000)
  where id=_session_id;
end;
$$;

create or replace function public.issue_gift_card(
  _restaurant_id uuid,
  _value numeric,
  _guest_id uuid default null,
  _expires_at timestamptz default null
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  _code text;
begin
  if not (
    app.has_capability(_restaurant_id,'manage_payments')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Payment access is required';
  end if;

  if coalesce(_value,0)<=0 then raise exception 'Gift card value must be positive'; end if;
  if _expires_at is not null and _expires_at<=now() then raise exception 'Expiration must be in the future'; end if;

  if _guest_id is not null and not exists(
    select 1 from public.crm_guests
    where id=_guest_id and restaurant_id=_restaurant_id
  ) then
    raise exception 'Guest does not belong to this restaurant';
  end if;

  loop
    _code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    exit when not exists(
      select 1 from public.crm_gift_cards
      where restaurant_id=_restaurant_id and code=_code
    );
  end loop;

  insert into public.crm_gift_cards(
    restaurant_id,code,initial_value,balance,guest_id,expires_at
  ) values(
    _restaurant_id,_code,round(_value,3),round(_value,3),_guest_id,_expires_at
  );

  return _code;
end;
$$;
