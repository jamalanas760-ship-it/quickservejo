begin;

create table if not exists public.booking_deposit_intents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.table_bookings(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  provider text not null default 'stripe' check (provider='stripe'),
  provider_account_id text,
  provider_intent_id text unique,
  idempotency_key text not null unique,
  amount numeric(12,3) not null check (amount>0),
  currency text not null,
  status text not null default 'creating'
    check (status in ('creating','requires_payment_method','requires_action','processing','succeeded','failed','canceled')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_deposit_intents_restaurant_idx
  on public.booking_deposit_intents(restaurant_id,created_at desc);
create index if not exists booking_deposit_intents_provider_idx
  on public.booking_deposit_intents(provider,provider_intent_id)
  where provider_intent_id is not null;

alter table public.booking_deposit_intents enable row level security;
drop policy if exists booking_deposit_intents_no_direct_access on public.booking_deposit_intents;
create policy booking_deposit_intents_no_direct_access
on public.booking_deposit_intents for all to authenticated
using(false) with check(false);

revoke all on public.booking_deposit_intents from public,anon,authenticated;
grant all on public.booking_deposit_intents to service_role;

drop trigger if exists trg_booking_deposit_intents_updated on public.booking_deposit_intents;
create trigger trg_booking_deposit_intents_updated
before update on public.booking_deposit_intents
for each row execute function public.set_updated_at();

create or replace function public.record_booking_deposit_payment(
  _intent_id uuid,_provider_intent_id text,_provider_transaction_id text,_provider_event_id text default null
) returns void
language plpgsql security definer set search_path=''
as $$
declare _intent public.booking_deposit_intents; _booking public.table_bookings;
begin
  select * into _intent from public.booking_deposit_intents where id=_intent_id for update;
  if _intent.id is null then raise exception 'Booking deposit intent not found'; end if;
  select * into _booking from public.table_bookings where id=_intent.booking_id for update;
  if _booking.id is null then raise exception 'Booking not found'; end if;

  if _booking.deposit_status='paid' then
    update public.booking_deposit_intents
    set status='succeeded',provider_intent_id=coalesce(nullif(_provider_intent_id,''),provider_intent_id),last_error=null,updated_at=now()
    where id=_intent.id;
    return;
  end if;

  update public.booking_deposit_intents
  set status='succeeded',provider_intent_id=coalesce(nullif(_provider_intent_id,''),provider_intent_id),last_error=null,updated_at=now()
  where id=_intent.id;

  update public.table_bookings
  set deposit_status='paid',deposit_reference=coalesce(nullif(_provider_transaction_id,''),nullif(_provider_intent_id,''),deposit_reference),updated_at=now()
  where id=_booking.id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_booking.restaurant_id,null,'booking_deposit_paid','table_booking',_booking.id,
    jsonb_build_object('deposit_intent_id',_intent.id,'provider','stripe','provider_intent_id',_provider_intent_id,
      'provider_transaction_id',_provider_transaction_id,'provider_event_id',_provider_event_id,'amount',_intent.amount,'currency',_intent.currency));
end;
$$;
revoke all on function public.record_booking_deposit_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_booking_deposit_payment(uuid,text,text,text) to service_role;

create or replace function public.update_booking_deposit_intent_status(
  _intent_id uuid,_provider_intent_id text,_status text,_last_error text default null
) returns void
language plpgsql security definer set search_path=''
as $$
declare _intent public.booking_deposit_intents;
begin
  select * into _intent from public.booking_deposit_intents where id=_intent_id for update;
  if _intent.id is null then raise exception 'Booking deposit intent not found'; end if;
  if _status not in ('creating','requires_payment_method','requires_action','processing','succeeded','failed','canceled') then raise exception 'Invalid booking deposit intent status'; end if;

  update public.booking_deposit_intents
  set provider_intent_id=coalesce(nullif(_provider_intent_id,''),provider_intent_id),status=_status,
      last_error=nullif(left(coalesce(_last_error,''),1000),''),updated_at=now()
  where id=_intent_id;

  if _status='failed' then
    update public.table_bookings set deposit_status='failed',updated_at=now()
    where id=_intent.booking_id and deposit_status<>'paid';
  elsif _status in ('creating','requires_payment_method','requires_action','processing') then
    update public.table_bookings set deposit_status='pending',updated_at=now()
    where id=_intent.booking_id and deposit_status<>'paid';
  end if;
end;
$$;
revoke all on function public.update_booking_deposit_intent_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.update_booking_deposit_intent_status(uuid,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;
