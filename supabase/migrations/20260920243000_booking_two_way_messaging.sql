begin;

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  booking_id uuid not null references public.table_bookings(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  channel text not null check (channel in ('sms','whatsapp')),
  from_address text,
  to_address text,
  body text not null check (length(body) between 1 and 2000),
  provider text not null default 'twilio' check (provider='twilio'),
  provider_message_id text,
  provider_status text not null default 'queued'
    check (provider_status in ('queued','sending','sent','delivered','received','failed','undelivered')),
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_messages_provider_message_uidx
  on public.booking_messages(provider,provider_message_id)
  where provider_message_id is not null;
create index if not exists booking_messages_thread_idx
  on public.booking_messages(booking_id,created_at);
create index if not exists booking_messages_restaurant_idx
  on public.booking_messages(restaurant_id,created_at desc);

alter table public.booking_messages enable row level security;
drop policy if exists booking_messages_read on public.booking_messages;
create policy booking_messages_read
on public.booking_messages
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_tables')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
);

revoke all on public.booking_messages from public,anon,authenticated;
grant select on public.booking_messages to authenticated;
grant all on public.booking_messages to service_role;

drop trigger if exists trg_booking_messages_updated on public.booking_messages;
create trigger trg_booking_messages_updated
before update on public.booking_messages
for each row execute function public.set_updated_at();

create table if not exists public.booking_message_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'twilio',
  provider_message_id text not null,
  from_address text,
  to_address text,
  body text not null,
  channel text not null check (channel in ('sms','whatsapp')),
  match_status text not null check (match_status in ('matched','unmatched','ambiguous')),
  matched_restaurant_id uuid references public.restaurants(id) on delete set null,
  matched_booking_id uuid references public.table_bookings(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(provider,provider_message_id)
);

alter table public.booking_message_inbox enable row level security;
revoke all on public.booking_message_inbox from public,anon,authenticated;
grant all on public.booking_message_inbox to service_role;

create or replace function public.prepare_booking_message(
  _booking_id uuid,
  _channel text,
  _body text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _b public.table_bookings;
  _id uuid;
  _body_clean text;
  _recent integer;
begin
  if _channel not in ('sms','whatsapp') then
    raise exception 'Unsupported messaging channel';
  end if;

  _body_clean:=trim(coalesce(_body,''));
  if length(_body_clean)<1 or length(_body_clean)>2000 then
    raise exception 'Message must contain 1 to 2000 characters';
  end if;

  select * into _b
  from public.table_bookings
  where id=_booking_id;

  if _b.id is null then raise exception 'Reservation not found'; end if;

  if not (
    app.has_capability(_b.restaurant_id,'manage_tables')
    or app.has_capability(_b.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then
    raise exception 'Not authorized' using errcode='42501';
  end if;

  if nullif(trim(coalesce(_b.phone,'')),'') is null then
    raise exception 'This reservation has no phone number';
  end if;

  select count(*)::int into _recent
  from public.booking_messages m
  where m.booking_id=_b.id
    and m.direction='outbound'
    and m.created_by=auth.uid()
    and m.created_at>now()-interval '5 minutes';

  if _recent>=10 then
    raise exception 'Too many messages sent recently. Please wait a few minutes.';
  end if;

  insert into public.booking_messages(
    restaurant_id,booking_id,direction,channel,to_address,body,provider_status,created_by
  ) values(
    _b.restaurant_id,_b.id,'outbound',_channel,trim(_b.phone),_body_clean,'queued',auth.uid()
  )
  returning id into _id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(
    _b.restaurant_id,auth.uid(),'booking_message_queued','table_booking',_b.id,
    jsonb_build_object('message_id',_id,'channel',_channel)
  );

  return jsonb_build_object(
    'message_id',_id,
    'restaurant_id',_b.restaurant_id,
    'booking_id',_b.id,
    'customer_name',_b.customer_name,
    'phone',trim(_b.phone),
    'confirmation_code',_b.confirmation_code,
    'booking_at',_b.booking_at
  );
end;
$$;

revoke all on function public.prepare_booking_message(uuid,text,text) from public,anon;
grant execute on function public.prepare_booking_message(uuid,text,text) to authenticated;

create or replace function public.booking_message_provider_update(
  _message_id uuid,
  _provider_message_id text,
  _provider_status text,
  _from_address text default null,
  _last_error text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if _provider_status not in ('queued','sending','sent','delivered','received','failed','undelivered') then
    raise exception 'Invalid provider status';
  end if;

  update public.booking_messages
  set
    provider_message_id=coalesce(nullif(_provider_message_id,''),provider_message_id),
    provider_status=_provider_status,
    from_address=coalesce(nullif(_from_address,''),from_address),
    last_error=nullif(left(coalesce(_last_error,''),1000),''),
    sent_at=case when _provider_status in ('sent','delivered') and sent_at is null then now() else sent_at end,
    updated_at=now()
  where id=_message_id;
end;
$$;

revoke all on function public.booking_message_provider_update(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.booking_message_provider_update(uuid,text,text,text,text) to service_role;

create or replace function public.match_booking_for_inbound_phone(_phone text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _digits text;
  _matches jsonb;
  _count integer;
begin
  _digits:=regexp_replace(coalesce(_phone,''),'\D','','g');
  if length(_digits)<8 then return jsonb_build_object('match_count',0); end if;

  with candidates as (
    select b.id,b.restaurant_id,b.customer_name,b.phone,b.booking_at
    from public.table_bookings b
    where b.status in ('pending','confirmed','seated')
      and b.booking_at>=now()-interval '12 hours'
      and b.booking_at<=now()+interval '14 days'
      and right(regexp_replace(coalesce(b.phone,''),'\D','','g'),8)=right(_digits,8)
    order by abs(extract(epoch from (b.booking_at-now())))
    limit 3
  )
  select count(*)::int,
         coalesce(jsonb_agg(jsonb_build_object(
           'booking_id',id,'restaurant_id',restaurant_id,'customer_name',customer_name,'phone',phone,'booking_at',booking_at
         )),'[]'::jsonb)
  into _count,_matches
  from candidates;

  if _count=1 then
    return jsonb_build_object(
      'match_count',1,
      'booking_id',_matches->0->>'booking_id',
      'restaurant_id',_matches->0->>'restaurant_id'
    );
  end if;

  return jsonb_build_object('match_count',_count);
end;
$$;

revoke all on function public.match_booking_for_inbound_phone(text) from public,anon,authenticated;
grant execute on function public.match_booking_for_inbound_phone(text) to service_role;

notify pgrst,'reload schema';
commit;
