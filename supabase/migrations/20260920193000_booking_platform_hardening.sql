begin;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.booking_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  online_enabled boolean not null default true,
  auto_confirm boolean not null default false,
  slot_minutes integer not null default 30 check (slot_minutes in (15,30,45,60)),
  default_duration_minutes integer not null default 90 check (default_duration_minutes between 30 and 360),
  min_party_size integer not null default 1 check (min_party_size between 1 and 100),
  max_party_size integer not null default 12 check (max_party_size between 1 and 100),
  min_lead_minutes integer not null default 60 check (min_lead_minutes between 0 and 10080),
  max_advance_days integer not null default 90 check (max_advance_days between 1 and 365),
  reservation_hold_minutes integer not null default 15 check (reservation_hold_minutes between 5 and 120),
  reminder_hours integer not null default 24 check (reminder_hours between 1 and 168),
  cancellation_cutoff_hours integer not null default 2 check (cancellation_cutoff_hours between 0 and 168),
  require_phone boolean not null default true,
  require_email boolean not null default false,
  deposit_mode text not null default 'none' check (deposit_mode in ('none','fixed','per_guest')),
  deposit_amount numeric(12,3) not null default 0 check (deposit_amount >= 0),
  confirmation_channel text not null default 'none' check (confirmation_channel in ('none','sms','whatsapp','email')),
  reminder_channel text not null default 'none' check (reminder_channel in ('none','sms','whatsapp','email')),
  weekly_hours jsonb not null default '{
    "0":{"open":"12:00","close":"23:00"},
    "1":{"open":"12:00","close":"23:00"},
    "2":{"open":"12:00","close":"23:00"},
    "3":{"open":"12:00","close":"23:00"},
    "4":{"open":"12:00","close":"23:00"},
    "5":{"open":"12:00","close":"23:00"},
    "6":{"open":"12:00","close":"23:00"}
  }'::jsonb,
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_settings enable row level security;
drop policy if exists booking_settings_read on public.booking_settings;
create policy booking_settings_read on public.booking_settings
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_tables')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
);
drop policy if exists booking_settings_manage on public.booking_settings;
create policy booking_settings_manage on public.booking_settings
for all to authenticated
using (app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin())
with check (app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin());

revoke all on public.booking_settings from public,anon,authenticated;
grant select,insert,update,delete on public.booking_settings to authenticated;
grant all on public.booking_settings to service_role;

drop trigger if exists trg_booking_settings_updated on public.booking_settings;
create trigger trg_booking_settings_updated
before update on public.booking_settings
for each row execute function public.set_updated_at();

insert into public.booking_settings(restaurant_id)
select r.id from public.restaurants r
where not exists(select 1 from public.booking_settings s where s.restaurant_id=r.id);

alter table public.table_bookings
  add column if not exists email text,
  add column if not exists guest_id uuid references public.crm_guests(id) on delete set null,
  add column if not exists source text not null default 'staff',
  add column if not exists duration_minutes integer not null default 90,
  add column if not exists ends_at timestamptz,
  add column if not exists occasion text,
  add column if not exists special_requests text,
  add column if not exists public_token text,
  add column if not exists confirmation_code text,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists seated_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists no_show_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists deposit_amount numeric(12,3) not null default 0,
  add column if not exists deposit_status text not null default 'not_required',
  add column if not exists deposit_reference text,
  add column if not exists assigned_staff_id uuid references public.staff(id) on delete set null;

update public.table_bookings
set
  duration_minutes = greatest(30,least(coalesce(duration_minutes,90),360)),
  ends_at = coalesce(ends_at, booking_at + make_interval(mins=>greatest(30,least(coalesce(duration_minutes,90),360)))),
  source = coalesce(nullif(source,''),'staff'),
  public_token = coalesce(public_token, encode(extensions.gen_random_bytes(24),'hex')),
  confirmation_code = coalesce(confirmation_code, upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,8))),
  deposit_status = coalesce(nullif(deposit_status,''),'not_required');

alter table public.table_bookings
  alter column ends_at set not null,
  alter column public_token set not null,
  alter column confirmation_code set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='table_bookings_source_check') then
    alter table public.table_bookings add constraint table_bookings_source_check
      check (source in ('staff','public','phone','walk_in','api'));
  end if;
  if not exists (select 1 from pg_constraint where conname='table_bookings_duration_check') then
    alter table public.table_bookings add constraint table_bookings_duration_check
      check (duration_minutes between 30 and 360 and ends_at > booking_at);
  end if;
  if not exists (select 1 from pg_constraint where conname='table_bookings_deposit_status_check') then
    alter table public.table_bookings add constraint table_bookings_deposit_status_check
      check (deposit_status in ('not_required','pending','paid','waived','refunded','failed'));
  end if;
end $$;

create unique index if not exists table_bookings_public_token_uidx on public.table_bookings(public_token);
create index if not exists table_bookings_guest_idx on public.table_bookings(guest_id,booking_at desc) where guest_id is not null;
create index if not exists table_bookings_upcoming_idx on public.table_bookings(restaurant_id,booking_at,status);
create index if not exists table_bookings_reminder_idx on public.table_bookings(restaurant_id,booking_at,reminder_sent_at)
  where status='confirmed' and reminder_sent_at is null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='table_bookings_no_overlap') then
    alter table public.table_bookings
      add constraint table_bookings_no_overlap
      exclude using gist (
        restaurant_id with =,
        table_id with =,
        tstzrange(booking_at,ends_at,'[)') with &&
      )
      where (table_id is not null and status in ('pending','confirmed','seated'));
  end if;
end $$;

create or replace function public.prepare_table_booking()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.duration_minutes := greatest(30,least(coalesce(new.duration_minutes,90),360));
  new.ends_at := new.booking_at + make_interval(mins=>new.duration_minutes);
  new.public_token := coalesce(nullif(new.public_token,''),encode(extensions.gen_random_bytes(24),'hex'));
  new.confirmation_code := coalesce(nullif(new.confirmation_code,''),upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,8)));
  if new.status='seated' and new.seated_at is null then new.seated_at:=now(); end if;
  if new.status='completed' and new.completed_at is null then new.completed_at:=now(); end if;
  if new.status='cancelled' and new.cancelled_at is null then new.cancelled_at:=now(); end if;
  if new.status='no_show' and new.no_show_at is null then new.no_show_at:=now(); end if;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists table_bookings_prepare on public.table_bookings;
create trigger table_bookings_prepare
before insert or update on public.table_bookings
for each row execute function public.prepare_table_booking();

drop trigger if exists table_bookings_updated_at on public.table_bookings;

create or replace function public.sync_booking_table_status()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.table_id is distinct from new.table_id and old.table_id is not null then
    update public.restaurant_tables
      set service_status='free',activated_at=null,status_updated_at=now(),status_updated_by=auth.uid()
    where id=old.table_id and restaurant_id=old.restaurant_id and service_status='reserved';
  end if;

  if new.table_id is null then return new; end if;

  if new.status='confirmed' and new.booking_at <= now()+interval '2 hours' then
    update public.restaurant_tables
      set service_status='reserved',status_updated_at=now(),status_updated_by=auth.uid()
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='free';
  elsif new.status='seated' then
    update public.restaurant_tables
      set service_status='active',activated_at=coalesce(activated_at,now()),status_updated_at=now(),status_updated_by=auth.uid()
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status in ('free','reserved');
  elsif new.status='completed' then
    update public.restaurant_tables
      set service_status='cleaning',status_updated_at=now(),status_updated_by=auth.uid()
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='active';
  elsif new.status in ('cancelled','no_show') then
    update public.restaurant_tables
      set service_status='free',activated_at=null,status_updated_at=now(),status_updated_by=auth.uid()
    where id=new.table_id and restaurant_id=new.restaurant_id and is_active and service_status='reserved';
  end if;
  return new;
end;
$$;

create or replace function public.refresh_upcoming_booking_table_statuses()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare _count integer;
begin
  with due as (
    select distinct on (b.table_id) b.table_id,b.restaurant_id
    from public.table_bookings b
    where b.status='confirmed'
      and b.table_id is not null
      and b.booking_at between now() and now()+interval '2 hours'
    order by b.table_id,b.booking_at
  ),
  updated as (
    update public.restaurant_tables t
    set service_status='reserved',status_updated_at=now(),status_updated_by=null
    from due
    where t.id=due.table_id and t.restaurant_id=due.restaurant_id
      and t.is_active and t.service_status='free'
    returning t.id
  )
  select count(*)::int into _count from updated;
  return coalesce(_count,0);
end;
$$;
revoke all on function public.refresh_upcoming_booking_table_statuses() from public,anon,authenticated;
grant execute on function public.refresh_upcoming_booking_table_statuses() to service_role;

create or replace function public.find_available_booking_tables(
  _restaurant_id uuid,
  _booking_at timestamptz,
  _guest_count integer,
  _duration_minutes integer default null
) returns table(id uuid,table_number text,table_name text,zone text,capacity integer)
language sql
security definer
set search_path=''
as $$
  with cfg as (
    select coalesce(_duration_minutes,s.default_duration_minutes,90) duration_minutes
    from public.booking_settings s where s.restaurant_id=_restaurant_id
  )
  select t.id,t.table_number,t.table_name,t.zone,t.capacity
  from public.restaurant_tables t,cfg
  where t.restaurant_id=_restaurant_id
    and t.is_active
    and t.service_status <> 'out_of_service'
    and t.capacity >= _guest_count
    and not exists(
      select 1 from public.table_bookings b
      where b.restaurant_id=_restaurant_id
        and b.table_id=t.id
        and b.status in ('pending','confirmed','seated')
        and tstzrange(b.booking_at,b.ends_at,'[)') &&
            tstzrange(_booking_at,_booking_at+make_interval(mins=>cfg.duration_minutes),'[)')
    )
  order by t.capacity asc,t.table_number asc;
$$;

revoke all on function public.find_available_booking_tables(uuid,timestamptz,integer,integer) from public,anon;
grant execute on function public.find_available_booking_tables(uuid,timestamptz,integer,integer) to authenticated;

create or replace function public.create_staff_booking(
  _restaurant_id uuid,
  _customer_name text,
  _phone text,
  _email text,
  _guest_count integer,
  _booking_at timestamptz,
  _table_id uuid default null,
  _duration_minutes integer default null,
  _status text default 'pending',
  _notes text default null,
  _occasion text default null,
  _source text default 'staff'
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _settings public.booking_settings;
  _duration integer;
  _guest_id uuid;
  _id uuid;
  _candidate uuid;
begin
  if not (
    app.has_capability(_restaurant_id,'manage_tables')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then raise exception 'Not authorized' using errcode='42501'; end if;

  select * into _settings from public.booking_settings where restaurant_id=_restaurant_id;
  if _settings.restaurant_id is null then
    insert into public.booking_settings(restaurant_id) values(_restaurant_id) returning * into _settings;
  end if;
  _duration:=coalesce(_duration_minutes,_settings.default_duration_minutes,90);
  if _guest_count<1 or _guest_count>100 then raise exception 'Invalid guest count'; end if;
  if _status not in ('pending','confirmed') then raise exception 'Invalid initial booking status'; end if;

  if nullif(trim(coalesce(_phone,'')),'') is not null or nullif(trim(coalesce(_email,'')),'') is not null then
    select id into _guest_id
    from public.crm_guests
    where restaurant_id=_restaurant_id
      and ((nullif(trim(coalesce(_phone,'')),'') is not null and phone=trim(_phone))
        or (nullif(trim(coalesce(_email,'')),'') is not null and lower(email)=lower(trim(_email))))
    order by updated_at desc limit 1;

    if _guest_id is null then
      insert into public.crm_guests(restaurant_id,name,phone,email,marketing_opt_in,visits,lifetime_spend,last_visit_at)
      values(_restaurant_id,left(trim(_customer_name),120),nullif(trim(_phone),''),nullif(lower(trim(_email)),''),false,0,0,null)
      returning id into _guest_id;
    else
      update public.crm_guests
      set name=coalesce(nullif(trim(_customer_name),''),name),
          phone=coalesce(nullif(trim(_phone),''),phone),
          email=coalesce(nullif(lower(trim(_email)),''),email),
          updated_at=now()
      where id=_guest_id;
    end if;
  end if;

  if _table_id is not null then
    if not exists(
      select 1 from public.find_available_booking_tables(_restaurant_id,_booking_at,_guest_count,_duration) a where a.id=_table_id
    ) then raise exception 'Selected table is not available for this time'; end if;
    _candidate:=_table_id;
  else
    select a.id into _candidate
    from public.find_available_booking_tables(_restaurant_id,_booking_at,_guest_count,_duration) a
    limit 1;
  end if;

  if _candidate is null then raise exception 'No table is available for this time and party size'; end if;

  insert into public.table_bookings(
    restaurant_id,table_id,customer_name,phone,email,guest_id,guest_count,booking_at,duration_minutes,
    zone,status,notes,occasion,source,created_by,deposit_amount,deposit_status
  )
  select _restaurant_id,_candidate,left(trim(_customer_name),120),nullif(trim(_phone),''),nullif(lower(trim(_email)),''),
         _guest_id,_guest_count,_booking_at,_duration,t.zone,_status,nullif(left(trim(coalesce(_notes,'')),1000),''),
         nullif(left(trim(coalesce(_occasion,'')),120),''),_source,auth.uid(),
         case _settings.deposit_mode when 'fixed' then _settings.deposit_amount when 'per_guest' then _settings.deposit_amount*_guest_count else 0 end,
         case when _settings.deposit_mode='none' or _settings.deposit_amount<=0 then 'not_required' else 'pending' end
  from public.restaurant_tables t where t.id=_candidate
  returning id into _id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'booking_created','table_booking',_id,jsonb_build_object('source',_source,'guests',_guest_count,'booking_at',_booking_at));

  return _id;
end;
$$;

revoke all on function public.create_staff_booking(uuid,text,text,text,integer,timestamptz,uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.create_staff_booking(uuid,text,text,text,integer,timestamptz,uuid,integer,text,text,text,text) to authenticated;

create or replace function public.transition_booking_status(
  _booking_id uuid,
  _next text,
  _reason text default null
) returns public.table_bookings
language plpgsql
security definer
set search_path=''
as $$
declare _b public.table_bookings; _allowed boolean:=false;
begin
  select * into _b from public.table_bookings where id=_booking_id for update;
  if _b.id is null then raise exception 'Booking not found'; end if;
  if not (
    app.has_capability(_b.restaurant_id,'manage_tables')
    or app.has_capability(_b.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then raise exception 'Not authorized' using errcode='42501'; end if;

  _allowed:=case
    when _b.status='pending' and _next in ('confirmed','cancelled') then true
    when _b.status='confirmed' and _next in ('seated','cancelled','no_show') then true
    when _b.status='seated' and _next='completed' then true
    else false end;
  if not _allowed then raise exception 'Invalid booking status transition from % to %',_b.status,_next; end if;

  update public.table_bookings
  set status=_next,
      cancel_reason=case when _next='cancelled' then nullif(left(trim(coalesce(_reason,'')),500),'') else cancel_reason end
  where id=_booking_id
  returning * into _b;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_b.restaurant_id,auth.uid(),'booking_status_changed','table_booking',_b.id,jsonb_build_object('status',_next,'reason',_reason));
  return _b;
end;
$$;
revoke all on function public.transition_booking_status(uuid,text,text) from public,anon;
grant execute on function public.transition_booking_status(uuid,text,text) to authenticated;

create or replace function public.get_public_booking_page(_slug text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare _r public.restaurants; _s public.booking_settings; _max_capacity integer;
begin
  select * into _r from public.restaurants where slug=_slug and is_active limit 1;
  if _r.id is null then return null; end if;
  select * into _s from public.booking_settings where restaurant_id=_r.id;
  if _s.restaurant_id is null then
    insert into public.booking_settings(restaurant_id) values(_r.id) returning * into _s;
  end if;
  select coalesce(max(capacity),0) into _max_capacity from public.restaurant_tables where restaurant_id=_r.id and is_active and service_status<>'out_of_service';
  return jsonb_build_object(
    'restaurant',jsonb_build_object('id',_r.id,'name',_r.name,'slug',_r.slug,'logo_url',_r.logo_url,'cover_image_url',_r.cover_image_url,'timezone',_r.timezone,'currency',_r.currency),
    'settings',jsonb_build_object(
      'online_enabled',_s.online_enabled,'slot_minutes',_s.slot_minutes,'default_duration_minutes',_s.default_duration_minutes,
      'min_party_size',_s.min_party_size,'max_party_size',least(_s.max_party_size,greatest(_max_capacity,_s.min_party_size)),
      'min_lead_minutes',_s.min_lead_minutes,'max_advance_days',_s.max_advance_days,'require_phone',_s.require_phone,'require_email',_s.require_email,
      'deposit_mode',_s.deposit_mode,'deposit_amount',_s.deposit_amount,'weekly_hours',_s.weekly_hours,'terms',_s.terms,
      'cancellation_cutoff_hours',_s.cancellation_cutoff_hours
    )
  );
end;
$$;

revoke all on function public.get_public_booking_page(text) from public;
grant execute on function public.get_public_booking_page(text) to anon,authenticated;

create or replace function public.get_public_booking_slots(
  _slug text,
  _booking_date date,
  _guest_count integer
) returns table(slot_at timestamptz,available_tables integer)
language plpgsql
security definer
set search_path=''
as $$
declare
  _r public.restaurants;
  _s public.booking_settings;
  _dow text;
  _hours jsonb;
  _open time;
  _close time;
  _cursor timestamp;
  _finish timestamp;
  _candidate timestamptz;
begin
  select * into _r from public.restaurants where slug=_slug and is_active limit 1;
  if _r.id is null then return; end if;
  select * into _s from public.booking_settings where restaurant_id=_r.id;
  if not coalesce(_s.online_enabled,false) then return; end if;
  if _guest_count<_s.min_party_size or _guest_count>_s.max_party_size then return; end if;
  if _booking_date<((now() at time zone _r.timezone)::date)
     or _booking_date>((now() at time zone _r.timezone)::date+_s.max_advance_days) then return; end if;

  _dow:=extract(dow from _booking_date)::int::text;
  _hours:=_s.weekly_hours->_dow;
  if _hours is null or coalesce(_hours->>'closed','false')='true' then return; end if;
  _open:=coalesce((_hours->>'open')::time,'12:00'::time);
  _close:=coalesce((_hours->>'close')::time,'23:00'::time);
  _cursor:=_booking_date+_open;
  _finish:=_booking_date+_close;

  while _cursor+make_interval(mins=>_s.default_duration_minutes)<=_finish loop
    _candidate:=_cursor at time zone _r.timezone;
    if _candidate>=now()+make_interval(mins=>_s.min_lead_minutes) then
      slot_at:=_candidate;
      select count(*)::int into available_tables
      from public.find_available_booking_tables(_r.id,_candidate,_guest_count,_s.default_duration_minutes);
      if available_tables>0 then return next; end if;
    end if;
    _cursor:=_cursor+make_interval(mins=>_s.slot_minutes);
  end loop;
end;
$$;

revoke all on function public.get_public_booking_slots(text,date,integer) from public;
grant execute on function public.get_public_booking_slots(text,date,integer) to anon,authenticated;

create or replace function public.create_public_booking(
  _slug text,
  _customer_name text,
  _phone text,
  _email text,
  _guest_count integer,
  _booking_at timestamptz,
  _notes text default null,
  _occasion text default null,
  _marketing_opt_in boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _r public.restaurants;
  _s public.booking_settings;
  _guest_id uuid;
  _candidate record;
  _id uuid;
  _booking public.table_bookings;
  _deposit numeric;
begin
  select * into _r from public.restaurants where slug=_slug and is_active limit 1;
  if _r.id is null then raise exception 'Restaurant not found'; end if;
  select * into _s from public.booking_settings where restaurant_id=_r.id;
  if not coalesce(_s.online_enabled,false) then raise exception 'Online bookings are disabled'; end if;
  if _guest_count<_s.min_party_size or _guest_count>_s.max_party_size then raise exception 'Party size is outside booking limits'; end if;
  if _booking_at<now()+make_interval(mins=>_s.min_lead_minutes) then raise exception 'Booking time is too soon'; end if;
  if (_booking_at at time zone _r.timezone)::date>((now() at time zone _r.timezone)::date+_s.max_advance_days) then raise exception 'Booking date is too far in advance'; end if;
  if length(trim(coalesce(_customer_name,'')))<1 then raise exception 'Guest name is required'; end if;
  if _s.require_phone and length(trim(coalesce(_phone,'')))<5 then raise exception 'Phone number is required'; end if;
  if _s.require_email and position('@' in coalesce(_email,''))<2 then raise exception 'Email is required'; end if;

  if nullif(trim(coalesce(_phone,'')),'') is not null or nullif(trim(coalesce(_email,'')),'') is not null then
    select id into _guest_id from public.crm_guests
    where restaurant_id=_r.id
      and ((nullif(trim(coalesce(_phone,'')),'') is not null and phone=trim(_phone))
       or (nullif(trim(coalesce(_email,'')),'') is not null and lower(email)=lower(trim(_email))))
    order by updated_at desc limit 1;

    if _guest_id is null then
      insert into public.crm_guests(restaurant_id,name,phone,email,marketing_opt_in,marketing_consent_source,visits,lifetime_spend,last_visit_at)
      values(_r.id,left(trim(_customer_name),120),nullif(trim(_phone),''),nullif(lower(trim(_email)),''),coalesce(_marketing_opt_in,false),
             case when _marketing_opt_in then 'public_booking' else null end,0,0,null)
      returning id into _guest_id;
    else
      update public.crm_guests
      set name=coalesce(nullif(trim(_customer_name),''),name),
          phone=coalesce(nullif(trim(_phone),''),phone),
          email=coalesce(nullif(lower(trim(_email)),''),email),
          marketing_opt_in=case when _marketing_opt_in then true else marketing_opt_in end,
          marketing_consent_source=case when _marketing_opt_in then 'public_booking' else marketing_consent_source end,
          updated_at=now()
      where id=_guest_id;
    end if;
  end if;

  _deposit:=case _s.deposit_mode when 'fixed' then _s.deposit_amount when 'per_guest' then _s.deposit_amount*_guest_count else 0 end;

  for _candidate in
    select * from public.find_available_booking_tables(_r.id,_booking_at,_guest_count,_s.default_duration_minutes)
  loop
    begin
      insert into public.table_bookings(
        restaurant_id,table_id,customer_name,phone,email,guest_id,guest_count,booking_at,duration_minutes,
        zone,status,notes,occasion,source,created_by,deposit_amount,deposit_status
      ) values(
        _r.id,_candidate.id,left(trim(_customer_name),120),nullif(trim(_phone),''),nullif(lower(trim(_email)),''),
        _guest_id,_guest_count,_booking_at,_s.default_duration_minutes,_candidate.zone,
        case when _s.auto_confirm then 'confirmed' else 'pending' end,
        nullif(left(trim(coalesce(_notes,'')),1000),''),nullif(left(trim(coalesce(_occasion,'')),120),''),
        'public',null,_deposit,case when _deposit>0 then 'pending' else 'not_required' end
      ) returning id into _id;
      exit;
    exception when exclusion_violation then
      _id:=null;
    end;
  end loop;

  if _id is null then raise exception 'This time is no longer available'; end if;
  select * into _booking from public.table_bookings where id=_id;

  perform public.queue_webhook_event(_r.id,'booking.created',
    jsonb_build_object('booking_id',_booking.id,'booking_at',_booking.booking_at,'guest_count',_booking.guest_count,'status',_booking.status,'source','public'));

  return jsonb_build_object(
    'booking_id',_booking.id,
    'public_token',_booking.public_token,
    'confirmation_code',_booking.confirmation_code,
    'status',_booking.status,
    'booking_at',_booking.booking_at,
    'guest_count',_booking.guest_count,
    'deposit_amount',_booking.deposit_amount,
    'deposit_status',_booking.deposit_status,
    'currency',_r.currency,
    'restaurant_name',_r.name
  );
end;
$$;

revoke all on function public.create_public_booking(text,text,text,text,integer,timestamptz,text,text,boolean) from public;
grant execute on function public.create_public_booking(text,text,text,text,integer,timestamptz,text,text,boolean) to anon,authenticated;

create or replace function public.get_public_booking_status(_token text)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'restaurant',jsonb_build_object('name',r.name,'slug',r.slug,'logo_url',r.logo_url,'currency',r.currency,'timezone',r.timezone),
    'booking',jsonb_build_object(
      'confirmation_code',b.confirmation_code,'booking_at',b.booking_at,'ends_at',b.ends_at,'guest_count',b.guest_count,
      'status',b.status,'occasion',b.occasion,'deposit_amount',b.deposit_amount,'deposit_status',b.deposit_status,
      'can_cancel',b.status in ('pending','confirmed') and b.booking_at>now()+make_interval(hours=>s.cancellation_cutoff_hours)
    )
  )
  from public.table_bookings b
  join public.restaurants r on r.id=b.restaurant_id
  join public.booking_settings s on s.restaurant_id=b.restaurant_id
  where b.public_token=_token
  limit 1;
$$;
revoke all on function public.get_public_booking_status(text) from public;
grant execute on function public.get_public_booking_status(text) to anon,authenticated;

create or replace function public.cancel_public_booking(_token text,_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare _b public.table_bookings; _s public.booking_settings;
begin
  select * into _b from public.table_bookings where public_token=_token for update;
  if _b.id is null then return false; end if;
  select * into _s from public.booking_settings where restaurant_id=_b.restaurant_id;
  if _b.status not in ('pending','confirmed') then raise exception 'Booking can no longer be cancelled'; end if;
  if _b.booking_at<=now()+make_interval(hours=>_s.cancellation_cutoff_hours) then raise exception 'Cancellation cutoff has passed'; end if;
  update public.table_bookings set status='cancelled',cancel_reason=nullif(left(trim(coalesce(_reason,'')),500),'') where id=_b.id;
  perform public.queue_webhook_event(_b.restaurant_id,'booking.cancelled',jsonb_build_object('booking_id',_b.id,'booking_at',_b.booking_at,'source','public'));
  return true;
end;
$$;
revoke all on function public.cancel_public_booking(text,text) from public;
grant execute on function public.cancel_public_booking(text,text) to anon,authenticated;

do $$
begin
  perform cron.unschedule('quickserve-booking-table-status') where exists(select 1 from cron.job where jobname='quickserve-booking-table-status');
exception when others then null;
end $$;
select cron.schedule('quickserve-booking-table-status','*/5 * * * *','select public.refresh_upcoming_booking_table_statuses();');

notify pgrst,'reload schema';
commit;
