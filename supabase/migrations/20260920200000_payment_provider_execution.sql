begin;

alter table public.payment_transactions
  add column if not exists provider text,
  add column if not exists provider_transaction_id text,
  add column if not exists provider_event_id text;

create unique index if not exists payment_transactions_provider_tx_uidx
  on public.payment_transactions(provider,provider_transaction_id,transaction_type)
  where provider is not null and provider_transaction_id is not null and status='completed';

create table if not exists public.payment_provider_intents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null check (provider in ('stripe','mena_gateway')),
  provider_account_id text,
  provider_intent_id text,
  idempotency_key text not null,
  amount numeric(12,3) not null check (amount>0),
  tip_amount numeric(12,3) not null default 0 check (tip_amount>=0),
  currency text not null,
  method_hint text not null default 'card' check (method_hint in ('card','wallet')),
  status text not null default 'creating' check (status in ('creating','requires_payment_method','requires_action','processing','succeeded','failed','canceled','partially_refunded','refunded')),
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,idempotency_key)
);

create unique index if not exists payment_provider_intents_provider_id_uidx
  on public.payment_provider_intents(provider,provider_intent_id)
  where provider_intent_id is not null;
create index if not exists payment_provider_intents_order_idx
  on public.payment_provider_intents(order_id,created_at desc);
create index if not exists payment_provider_intents_restaurant_idx
  on public.payment_provider_intents(restaurant_id,created_at desc);

alter table public.payment_provider_intents enable row level security;
drop policy if exists payment_provider_intents_select on public.payment_provider_intents;
create policy payment_provider_intents_select on public.payment_provider_intents
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_payments')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
);
revoke all on public.payment_provider_intents from public,anon,authenticated;
grant select on public.payment_provider_intents to authenticated;
grant all on public.payment_provider_intents to service_role;

drop trigger if exists trg_payment_provider_intents_updated on public.payment_provider_intents;
create trigger trg_payment_provider_intents_updated
before update on public.payment_provider_intents
for each row execute function public.set_updated_at();

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  provider_intent_id text,
  payload_digest text,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,provider_event_id)
);
create index if not exists payment_provider_events_restaurant_idx
  on public.payment_provider_events(restaurant_id,created_at desc);

alter table public.payment_provider_events enable row level security;
revoke all on public.payment_provider_events from public,anon,authenticated;
grant all on public.payment_provider_events to service_role;

create or replace function public.prepare_provider_payment_intent(
  _order_id uuid,
  _provider text,
  _amount numeric,
  _tip numeric default 0,
  _method_hint text default 'card',
  _idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _order public.orders%rowtype;
  _paid numeric;
  _due numeric;
  _id uuid;
  _key text;
  _connection public.integration_connections%rowtype;
begin
  select * into _order from public.orders where id=_order_id for update;
  if _order.id is null then raise exception 'Order not found'; end if;

  if not (
    app.has_capability(_order.restaurant_id,'manage_payments')
    or app.has_capability(_order.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then raise exception 'Payment access is required' using errcode='42501'; end if;

  if _provider not in ('stripe','mena_gateway') then raise exception 'Unsupported payment provider'; end if;
  if _method_hint not in ('card','wallet') then raise exception 'Unsupported payment method hint'; end if;
  if coalesce(_amount,0)<=0 or coalesce(_tip,0)<0 then raise exception 'Invalid payment amount'; end if;

  select * into _connection
  from public.integration_connections
  where restaurant_id=_order.restaurant_id and category='payments' and provider=_provider and status<>'disabled'
  limit 1;
  if _connection.id is null then raise exception 'Payment provider is not configured for this restaurant'; end if;

  select
    coalesce(sum(case when transaction_type='payment' and status='completed' then amount else 0 end),0)
    - coalesce(sum(case when transaction_type='refund' and status='completed' then amount else 0 end),0)
  into _paid
  from public.payment_transactions
  where order_id=_order_id;
  _due:=greatest(_order.total-_paid,0);
  if _due<=0 then raise exception 'Order is already fully paid'; end if;
  if _amount>_due+0.005 then raise exception 'Payment exceeds outstanding balance'; end if;

  _key:=coalesce(nullif(trim(_idempotency_key),''),'qs_'||gen_random_uuid()::text);
  insert into public.payment_provider_intents(
    restaurant_id,order_id,provider,provider_account_id,idempotency_key,amount,tip_amount,currency,method_hint,status,metadata,created_by
  ) values(
    _order.restaurant_id,_order.id,_provider,nullif(_connection.config->>'stripe_account_id',''),_key,
    round(_amount,3),round(_tip,3),upper(_order.currency),_method_hint,'creating',
    jsonb_build_object('connection_id',_connection.id),auth.uid()
  )
  on conflict(provider,idempotency_key) do update set updated_at=now()
  returning id into _id;

  return jsonb_build_object(
    'intent_id',_id,
    'restaurant_id',_order.restaurant_id,
    'order_id',_order.id,
    'order_number',_order.order_number,
    'amount',round(_amount,3),
    'tip_amount',round(_tip,3),
    'currency',upper(_order.currency),
    'provider_account_id',nullif(_connection.config->>'stripe_account_id',''),
    'idempotency_key',_key
  );
end;
$$;
revoke all on function public.prepare_provider_payment_intent(uuid,text,numeric,numeric,text,text) from public,anon;
grant execute on function public.prepare_provider_payment_intent(uuid,text,numeric,numeric,text,text) to authenticated;

create or replace function public.record_provider_payment(
  _intent_id uuid,
  _provider_intent_id text,
  _provider_transaction_id text,
  _provider_event_id text,
  _method text default 'card',
  _metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _intent public.payment_provider_intents%rowtype;
  _order public.orders%rowtype;
  _existing uuid;
  _id uuid;
  _paid numeric;
begin
  select * into _intent from public.payment_provider_intents where id=_intent_id for update;
  if _intent.id is null then raise exception 'Provider intent not found'; end if;
  select * into _order from public.orders where id=_intent.order_id for update;
  if _order.id is null or _order.restaurant_id<>_intent.restaurant_id then raise exception 'Order mismatch'; end if;
  if _method not in ('card','wallet') then _method:='card'; end if;

  select id into _existing
  from public.payment_transactions
  where provider=_intent.provider and provider_transaction_id=_provider_transaction_id
    and transaction_type='payment' and status='completed'
  limit 1;
  if _existing is not null then
    update public.payment_provider_intents
    set status='succeeded',provider_intent_id=_provider_intent_id,payment_transaction_id=_existing,last_error=null
    where id=_intent.id;
    return _existing;
  end if;

  insert into public.payment_transactions(
    restaurant_id,order_id,transaction_type,method,amount,tip_amount,reference,status,metadata,
    provider,provider_transaction_id,provider_event_id
  ) values(
    _intent.restaurant_id,_intent.order_id,'payment',_method,_intent.amount,_intent.tip_amount,
    left(_provider_intent_id,200),'completed',
    coalesce(_metadata,'{}'::jsonb)||jsonb_build_object('provider_intent_id',_provider_intent_id,'provider_intent_record_id',_intent.id),
    _intent.provider,left(_provider_transaction_id,255),left(coalesce(_provider_event_id,''),255)
  ) returning id into _id;

  select
    coalesce(sum(case when transaction_type='payment' and status='completed' then amount else 0 end),0)
    - coalesce(sum(case when transaction_type='refund' and status='completed' then amount else 0 end),0)
  into _paid from public.payment_transactions where order_id=_intent.order_id;

  update public.orders
  set tip_amount=tip_amount+_intent.tip_amount,
      payment_status=case when _paid+0.005>=total then 'paid'::public.payment_status else 'unpaid'::public.payment_status end,
      status=case when _paid+0.005>=total and status='served' then 'paid'::public.order_status else status end,
      updated_at=now()
  where id=_intent.order_id;

  update public.payment_provider_intents
  set status='succeeded',provider_intent_id=_provider_intent_id,payment_transaction_id=_id,last_error=null
  where id=_intent.id;

  return _id;
end;
$$;
revoke all on function public.record_provider_payment(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_provider_payment(uuid,text,text,text,text,jsonb) to service_role;

create or replace function public.update_provider_intent_status(
  _intent_id uuid,
  _provider_intent_id text,
  _status text,
  _last_error text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if _status not in ('creating','requires_payment_method','requires_action','processing','succeeded','failed','canceled','partially_refunded','refunded') then
    raise exception 'Invalid provider intent status';
  end if;
  update public.payment_provider_intents
  set provider_intent_id=coalesce(nullif(_provider_intent_id,''),provider_intent_id),
      status=_status,last_error=nullif(left(coalesce(_last_error,''),1000),'')
  where id=_intent_id;
end;
$$;
revoke all on function public.update_provider_intent_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.update_provider_intent_status(uuid,text,text,text) to service_role;

create or replace function public.prepare_provider_refund(
  _payment_id uuid,
  _amount numeric
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _p public.payment_transactions%rowtype;
  _refunded numeric;
begin
  select * into _p from public.payment_transactions where id=_payment_id for update;
  if _p.id is null or _p.transaction_type<>'payment' or _p.status<>'completed' or _p.provider is null then
    raise exception 'Provider payment not found';
  end if;
  if not (
    app.has_capability(_p.restaurant_id,'manage_payments')
    or app.has_capability(_p.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then raise exception 'Payment access is required' using errcode='42501'; end if;

  select coalesce(sum(amount),0) into _refunded
  from public.payment_transactions
  where parent_transaction_id=_p.id and transaction_type='refund' and status='completed';
  if coalesce(_amount,0)<=0 or _amount>_p.amount-_refunded+0.005 then raise exception 'Invalid refund amount'; end if;

  return jsonb_build_object(
    'payment_id',_p.id,'restaurant_id',_p.restaurant_id,'order_id',_p.order_id,
    'provider',_p.provider,'provider_transaction_id',_p.provider_transaction_id,
    'amount',round(_amount,3),'currency',(select currency from public.orders where id=_p.order_id)
  );
end;
$$;
revoke all on function public.prepare_provider_refund(uuid,numeric) from public,anon;
grant execute on function public.prepare_provider_refund(uuid,numeric) to authenticated;

create or replace function public.record_provider_refund(
  _payment_id uuid,
  _provider_refund_id text,
  _amount numeric,
  _provider_event_id text default null,
  _metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _p public.payment_transactions%rowtype;
  _order public.orders%rowtype;
  _existing uuid;
  _refunded numeric;
  _id uuid;
  _net numeric;
begin
  select * into _p from public.payment_transactions where id=_payment_id for update;
  if _p.id is null or _p.provider is null or _p.transaction_type<>'payment' or _p.status<>'completed' then raise exception 'Provider payment not found'; end if;
  select * into _order from public.orders where id=_p.order_id for update;

  select id into _existing from public.payment_transactions
  where provider=_p.provider and provider_transaction_id=_provider_refund_id
    and transaction_type='refund' and status='completed' limit 1;
  if _existing is not null then return _existing; end if;

  select coalesce(sum(amount),0) into _refunded
  from public.payment_transactions
  where parent_transaction_id=_p.id and transaction_type='refund' and status='completed';
  if coalesce(_amount,0)<=0 or _amount>_p.amount-_refunded+0.005 then raise exception 'Refund exceeds refundable amount'; end if;

  insert into public.payment_transactions(
    restaurant_id,order_id,parent_transaction_id,transaction_type,method,amount,tip_amount,reference,status,metadata,
    provider,provider_transaction_id,provider_event_id
  ) values(
    _p.restaurant_id,_p.order_id,_p.id,'refund',_p.method,round(_amount,3),0,left(_provider_refund_id,200),'completed',
    coalesce(_metadata,'{}'::jsonb)||jsonb_build_object('source_payment_id',_p.id),
    _p.provider,left(_provider_refund_id,255),left(coalesce(_provider_event_id,''),255)
  ) returning id into _id;

  select
    coalesce(sum(case when transaction_type='payment' and status='completed' then amount else 0 end),0)
    - coalesce(sum(case when transaction_type='refund' and status='completed' then amount else 0 end),0)
  into _net from public.payment_transactions where order_id=_p.order_id;

  update public.orders
  set payment_status=case when _net<=0.005 then 'refunded'::public.payment_status when _net+0.005<total then 'unpaid'::public.payment_status else 'paid'::public.payment_status end,
      status=case when status='paid' and _net+0.005<total then 'served'::public.order_status else status end,
      updated_at=now()
  where id=_p.order_id;

  update public.payment_provider_intents
  set status=case when _refunded+_amount+0.005>=amount then 'refunded' else 'partially_refunded' end
  where payment_transaction_id=_p.id;

  return _id;
end;
$$;
revoke all on function public.record_provider_refund(uuid,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_provider_refund(uuid,text,numeric,text,jsonb) to service_role;

create or replace function public.register_payment_provider_event(
  _provider text,
  _event_id text,
  _event_type text,
  _restaurant_id uuid default null,
  _provider_intent_id text default null,
  _payload_digest text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.payment_provider_events(provider,provider_event_id,event_type,restaurant_id,provider_intent_id,payload_digest)
  values(_provider,_event_id,_event_type,_restaurant_id,_provider_intent_id,_payload_digest)
  on conflict(provider,provider_event_id) do nothing;
  return found;
end;
$$;
revoke all on function public.register_payment_provider_event(text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_payment_provider_event(text,text,text,uuid,text,text) to service_role;

create or replace function public.complete_payment_provider_event(
  _provider text,_event_id text,_status text,_error text default null
) returns void
language sql
security definer
set search_path=''
as $$
  update public.payment_provider_events
  set status=_status,last_error=nullif(left(coalesce(_error,''),1000),''),processed_at=now()
  where provider=_provider and provider_event_id=_event_id;
$$;
revoke all on function public.complete_payment_provider_event(text,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_payment_provider_event(text,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;
