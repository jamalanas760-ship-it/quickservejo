begin;

alter table public.booking_waitlist
  add column if not exists estimated_wait_minutes integer,
  add column if not exists offer_booking_at timestamptz,
  add column if not exists offer_table_id uuid references public.restaurant_tables(id) on delete set null,
  add column if not exists offer_expires_at timestamptz,
  add column if not exists offer_sent_at timestamptz,
  add column if not exists offer_accepted_at timestamptz,
  add column if not exists offer_declined_at timestamptz,
  add column if not exists offer_count integer not null default 0,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_channel text;

create index if not exists booking_waitlist_offer_expiry_idx
  on public.booking_waitlist(status,offer_expires_at)
  where status='notified' and offer_expires_at is not null;

create table if not exists public.waitlist_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  waitlist_id uuid not null references public.booking_waitlist(id) on delete cascade,
  offer_sequence integer not null,
  channel text not null check(channel in ('sms','whatsapp','email')),
  destination text not null,
  status text not null default 'queued' check(status in ('queued','sending','sent','retry','failed','skipped')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_reference text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(waitlist_id,offer_sequence,channel)
);

create index if not exists waitlist_notification_jobs_queue_idx
  on public.waitlist_notification_jobs(status,next_attempt_at)
  where status in ('queued','retry');
create index if not exists waitlist_notification_jobs_restaurant_idx
  on public.waitlist_notification_jobs(restaurant_id,created_at desc);

alter table public.waitlist_notification_jobs enable row level security;
drop policy if exists waitlist_notification_jobs_read on public.waitlist_notification_jobs;
create policy waitlist_notification_jobs_read
on public.waitlist_notification_jobs for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_tables')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
);
revoke all on public.waitlist_notification_jobs from public,anon,authenticated;
grant select on public.waitlist_notification_jobs to authenticated;
grant all on public.waitlist_notification_jobs to service_role;

drop trigger if exists trg_waitlist_notification_jobs_updated on public.waitlist_notification_jobs;
create trigger trg_waitlist_notification_jobs_updated
before update on public.waitlist_notification_jobs
for each row execute function public.set_updated_at();

create or replace function app.estimate_waitlist_minutes(
  _restaurant_id uuid,
  _guest_count integer,
  _from timestamptz default now()
) returns integer
language plpgsql security definer set search_path=''
as $$
declare _settings public.booking_settings; _candidate timestamptz; _minutes integer:=0; _available integer;
begin
  select * into _settings from public.booking_settings where restaurant_id=_restaurant_id;
  if _settings.restaurant_id is null then return null; end if;
  while _minutes<=240 loop
    _candidate:=_from+make_interval(mins=>_minutes);
    select count(*)::int into _available
    from public.find_available_booking_tables(_restaurant_id,_candidate,_guest_count,_settings.default_duration_minutes);
    if _available>0 then return _minutes; end if;
    _minutes:=_minutes+greatest(10,least(coalesce(_settings.slot_minutes,15),30));
  end loop;
  return 240;
end;
$$;
revoke all on function app.estimate_waitlist_minutes(uuid,integer,timestamptz) from public,anon,authenticated;

create or replace function app.set_waitlist_estimate()
returns trigger language plpgsql security definer set search_path=''
as $$
declare _tz text; _local_date date;
begin
  select coalesce(nullif(timezone,''),'UTC') into _tz from public.restaurants where id=new.restaurant_id;
  _local_date:=(now() at time zone coalesce(_tz,'UTC'))::date;
  if new.desired_date=_local_date then
    new.estimated_wait_minutes:=app.estimate_waitlist_minutes(new.restaurant_id,new.guest_count,now());
  else
    new.estimated_wait_minutes:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_booking_waitlist_estimate on public.booking_waitlist;
create trigger trg_booking_waitlist_estimate before insert on public.booking_waitlist
for each row execute function app.set_waitlist_estimate();

create or replace function public.refresh_waitlist_estimate(_waitlist_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare _w public.booking_waitlist; _estimate integer;
begin
  select * into _w from public.booking_waitlist where id=_waitlist_id for update;
  if _w.id is null then raise exception 'Waitlist entry not found'; end if;
  if not (app.has_capability(_w.restaurant_id,'manage_tables') or app.has_capability(_w.restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Not authorized' using errcode='42501'; end if;
  _estimate:=app.estimate_waitlist_minutes(_w.restaurant_id,_w.guest_count,now());
  update public.booking_waitlist set estimated_wait_minutes=_estimate,updated_at=now() where id=_w.id;
  return _estimate;
end;
$$;
revoke all on function public.refresh_waitlist_estimate(uuid) from public,anon;
grant execute on function public.refresh_waitlist_estimate(uuid) to authenticated;

create or replace function public.offer_waitlist_entry(
  _waitlist_id uuid,_booking_at timestamptz,_table_id uuid default null,_hold_minutes integer default 10
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  _w public.booking_waitlist; _s public.booking_settings; _candidate record; _chosen uuid;
  _channel text; _destination text; _sequence integer; _expires timestamptz;
begin
  select * into _w from public.booking_waitlist where id=_waitlist_id for update;
  if _w.id is null then raise exception 'Waitlist entry not found'; end if;
  if not (app.has_capability(_w.restaurant_id,'manage_tables') or app.has_capability(_w.restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Not authorized' using errcode='42501'; end if;
  if _w.status not in ('waiting','notified') then raise exception 'Waitlist entry is not active'; end if;
  if _booking_at<now()-interval '2 minutes' then raise exception 'Offer time cannot be in the past'; end if;

  select * into _s from public.booking_settings where restaurant_id=_w.restaurant_id;
  if _s.restaurant_id is null then raise exception 'Booking settings not found'; end if;

  if _table_id is not null then
    select a.* into _candidate from public.find_available_booking_tables(_w.restaurant_id,_booking_at,_w.guest_count,_s.default_duration_minutes) a
    where a.id=_table_id limit 1;
    if _candidate.id is null then raise exception 'Selected table is no longer available'; end if;
    _chosen:=_candidate.id;
  else
    select a.* into _candidate from public.find_available_booking_tables(_w.restaurant_id,_booking_at,_w.guest_count,_s.default_duration_minutes) a limit 1;
    if _candidate.id is null then raise exception 'No suitable table is available for this offer time'; end if;
    _chosen:=_candidate.id;
  end if;

  _channel:=coalesce(nullif(_s.confirmation_channel,''),'sms');
  if _channel='email' and nullif(trim(coalesce(_w.email,'')),'') is not null then
    _destination:=trim(_w.email);
  elsif _channel in ('sms','whatsapp') and nullif(trim(coalesce(_w.phone,'')),'') is not null then
    _destination:=trim(_w.phone);
  elsif nullif(trim(coalesce(_w.email,'')),'') is not null then
    _channel:='email'; _destination:=trim(_w.email);
  elsif nullif(trim(coalesce(_w.phone,'')),'') is not null then
    _channel:='sms'; _destination:=trim(_w.phone);
  else
    raise exception 'Guest has no contact destination';
  end if;

  _sequence:=coalesce(_w.offer_count,0)+1;
  _expires:=now()+make_interval(mins=>greatest(3,least(coalesce(_hold_minutes,10),30)));

  update public.booking_waitlist set
    status='notified',offer_booking_at=_booking_at,offer_table_id=_chosen,offer_expires_at=_expires,
    offer_sent_at=null,offer_accepted_at=null,offer_declined_at=null,offer_count=_sequence,
    notified_at=now(),estimated_wait_minutes=0,cancellation_reason=null,updated_at=now()
  where id=_w.id;

  insert into public.waitlist_notification_jobs(restaurant_id,waitlist_id,offer_sequence,channel,destination,status)
  values(_w.restaurant_id,_w.id,_sequence,_channel,_destination,'queued')
  on conflict(waitlist_id,offer_sequence,channel) do nothing;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_w.restaurant_id,auth.uid(),'waitlist_offer_created','booking_waitlist',_w.id,
    jsonb_build_object('booking_at',_booking_at,'table_id',_chosen,'expires_at',_expires,'channel',_channel,'offer_sequence',_sequence));

  return jsonb_build_object('waitlist_id',_w.id,'booking_at',_booking_at,'table_id',_chosen,'expires_at',_expires,'channel',_channel,'offer_sequence',_sequence);
end;
$$;
revoke all on function public.offer_waitlist_entry(uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.offer_waitlist_entry(uuid,timestamptz,uuid,integer) to authenticated;

create or replace function public.get_public_waitlist_status(_token text)
returns jsonb language sql security definer set search_path=''
as $$
  select jsonb_build_object(
    'restaurant',jsonb_build_object('name',r.name,'slug',r.slug,'logo_url',r.logo_url,'timezone',r.timezone,'currency',r.currency),
    'waitlist',jsonb_build_object(
      'customer_name',w.customer_name,'guest_count',w.guest_count,'desired_date',w.desired_date,'preferred_time',w.preferred_time,
      'status',w.status,'estimated_wait_minutes',w.estimated_wait_minutes,'offer_booking_at',w.offer_booking_at,
      'offer_expires_at',w.offer_expires_at,'offer_active',w.status='notified' and w.offer_expires_at>now() and w.offer_booking_at is not null,
      'converted_booking_id',w.converted_booking_id,'offer_accepted_at',w.offer_accepted_at,'offer_declined_at',w.offer_declined_at
    ),
    'booking',case when b.id is null then null else jsonb_build_object(
      'public_token',b.public_token,'confirmation_code',b.confirmation_code,'booking_at',b.booking_at,'status',b.status
    ) end
  )
  from public.booking_waitlist w
  join public.restaurants r on r.id=w.restaurant_id
  left join public.table_bookings b on b.id=w.converted_booking_id
  where w.public_token=_token limit 1;
$$;
revoke all on function public.get_public_waitlist_status(text) from public;
grant execute on function public.get_public_waitlist_status(text) to anon,authenticated;

create or replace function public.respond_public_waitlist_offer(_token text,_response text)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  _w public.booking_waitlist; _s public.booking_settings; _candidate record; _booking_id uuid;
  _booking public.table_bookings; _guest_id uuid; _deposit numeric;
begin
  if _response not in ('accept','decline') then raise exception 'Invalid response'; end if;
  select * into _w from public.booking_waitlist where public_token=_token for update;
  if _w.id is null then raise exception 'Waitlist request not found'; end if;
  if _w.status<>'notified' or _w.offer_booking_at is null or _w.offer_expires_at is null then raise exception 'There is no active table offer'; end if;

  if _w.offer_expires_at<=now() then
    update public.booking_waitlist set status='waiting',offer_booking_at=null,offer_table_id=null,offer_expires_at=null,
      estimated_wait_minutes=app.estimate_waitlist_minutes(_w.restaurant_id,_w.guest_count,now()),updated_at=now()
    where id=_w.id;
    return jsonb_build_object('result','expired');
  end if;

  if _response='decline' then
    update public.booking_waitlist set status='waiting',offer_declined_at=now(),offer_booking_at=null,offer_table_id=null,offer_expires_at=null,
      estimated_wait_minutes=app.estimate_waitlist_minutes(_w.restaurant_id,_w.guest_count,now()),updated_at=now()
    where id=_w.id;
    insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
    values(_w.restaurant_id,null,'waitlist_offer_declined','booking_waitlist',_w.id,jsonb_build_object('offer_count',_w.offer_count));
    return jsonb_build_object('result','declined');
  end if;

  select * into _s from public.booking_settings where restaurant_id=_w.restaurant_id;
  if _s.restaurant_id is null then raise exception 'Booking settings not found'; end if;

  if _w.offer_table_id is not null then
    select a.* into _candidate from public.find_available_booking_tables(_w.restaurant_id,_w.offer_booking_at,_w.guest_count,_s.default_duration_minutes) a
    where a.id=_w.offer_table_id limit 1;
  end if;
  if _candidate.id is null then
    select a.* into _candidate from public.find_available_booking_tables(_w.restaurant_id,_w.offer_booking_at,_w.guest_count,_s.default_duration_minutes) a limit 1;
  end if;

  if _candidate.id is null then
    update public.booking_waitlist set status='waiting',offer_booking_at=null,offer_table_id=null,offer_expires_at=null,
      estimated_wait_minutes=app.estimate_waitlist_minutes(_w.restaurant_id,_w.guest_count,now()),updated_at=now()
    where id=_w.id;
    return jsonb_build_object('result','unavailable');
  end if;

  if nullif(trim(coalesce(_w.phone,'')),'') is not null or nullif(trim(coalesce(_w.email,'')),'') is not null then
    select id into _guest_id from public.crm_guests
    where restaurant_id=_w.restaurant_id
      and ((nullif(trim(coalesce(_w.phone,'')),'') is not null and phone=trim(_w.phone))
        or (nullif(trim(coalesce(_w.email,'')),'') is not null and lower(email)=lower(trim(_w.email))))
    order by updated_at desc limit 1;
    if _guest_id is null then
      insert into public.crm_guests(restaurant_id,name,phone,email,marketing_opt_in,visits,lifetime_spend,last_visit_at)
      values(_w.restaurant_id,_w.customer_name,nullif(trim(_w.phone),''),nullif(lower(trim(_w.email)),''),false,0,0,null)
      returning id into _guest_id;
    end if;
  end if;

  _deposit:=case _s.deposit_mode when 'fixed' then _s.deposit_amount when 'per_guest' then _s.deposit_amount*_w.guest_count else 0 end;

  insert into public.table_bookings(
    restaurant_id,table_id,customer_name,phone,email,guest_id,guest_count,booking_at,duration_minutes,
    zone,status,notes,occasion,source,created_by,deposit_amount,deposit_status
  ) values(
    _w.restaurant_id,_candidate.id,_w.customer_name,nullif(trim(_w.phone),''),nullif(lower(trim(_w.email)),''),
    _guest_id,_w.guest_count,_w.offer_booking_at,_s.default_duration_minutes,_candidate.zone,'confirmed',
    _w.notes,_w.occasion,'public',null,_deposit,case when _deposit>0 then 'pending' else 'not_required' end
  ) returning id into _booking_id;

  update public.booking_waitlist set status='converted',converted_booking_id=_booking_id,offer_accepted_at=now(),offer_expires_at=null,updated_at=now()
  where id=_w.id;

  select * into _booking from public.table_bookings where id=_booking_id;
  perform public.queue_webhook_event(_w.restaurant_id,'booking.created',
    jsonb_build_object('booking_id',_booking.id,'booking_at',_booking.booking_at,'guest_count',_booking.guest_count,'status',_booking.status,'source','waitlist'));

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_w.restaurant_id,null,'waitlist_offer_accepted','booking_waitlist',_w.id,jsonb_build_object('booking_id',_booking_id,'offer_count',_w.offer_count));

  return jsonb_build_object('result','accepted','booking_id',_booking.id,'booking_public_token',_booking.public_token,
    'confirmation_code',_booking.confirmation_code,'booking_at',_booking.booking_at,'deposit_amount',_booking.deposit_amount,'deposit_status',_booking.deposit_status);
end;
$$;
revoke all on function public.respond_public_waitlist_offer(text,text) from public;
grant execute on function public.respond_public_waitlist_offer(text,text) to anon,authenticated;

create or replace function app.expire_waitlist_offers()
returns integer language plpgsql security definer set search_path=''
as $$
declare _count integer;
begin
  with expired as (
    update public.booking_waitlist w set status='waiting',offer_booking_at=null,offer_table_id=null,offer_expires_at=null,
      estimated_wait_minutes=app.estimate_waitlist_minutes(w.restaurant_id,w.guest_count,now()),updated_at=now()
    where w.status='notified' and w.offer_expires_at is not null and w.offer_expires_at<=now()
    returning w.id
  )
  select count(*)::int into _count from expired;
  return coalesce(_count,0);
end;
$$;
revoke all on function app.expire_waitlist_offers() from public,anon,authenticated;

do $$ begin
  perform cron.unschedule('quickserve-waitlist-offer-expiry') where exists(select 1 from cron.job where jobname='quickserve-waitlist-offer-expiry');
exception when others then null; end $$;
select cron.schedule('quickserve-waitlist-offer-expiry','* * * * *','select app.expire_waitlist_offers();');

do $$
declare _secret text; _id uuid;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='quickserve_waitlist_worker_secret') then
    _secret:=encode(extensions.gen_random_bytes(32),'hex');
    select vault.create_secret(_secret,'quickserve_waitlist_worker_secret','QuickServe waitlist notification worker authentication') into _id;
  end if;
end $$;

create or replace function public.verify_waitlist_worker_secret(_secret text)
returns boolean language sql security definer set search_path=''
as $$ select exists(select 1 from vault.decrypted_secrets where name='quickserve_waitlist_worker_secret' and decrypted_secret=coalesce(_secret,'')); $$;
revoke all on function public.verify_waitlist_worker_secret(text) from public,anon,authenticated;
grant execute on function public.verify_waitlist_worker_secret(text) to service_role;

notify pgrst,'reload schema';
commit;
