begin;

create table if not exists public.booking_waitlist (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  phone text,
  email text,
  guest_count integer not null check (guest_count between 1 and 100),
  desired_date date not null,
  preferred_time text,
  occasion text,
  notes text,
  source text not null default 'public' check (source in ('public','staff','phone','walk_in','api')),
  status text not null default 'waiting' check (status in ('waiting','notified','converted','cancelled','expired')),
  public_token text not null,
  notified_at timestamptz,
  converted_booking_id uuid references public.table_bookings(id) on delete set null,
  cancellation_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_waitlist_public_token_uidx on public.booking_waitlist(public_token);
create index if not exists booking_waitlist_queue_idx on public.booking_waitlist(restaurant_id,status,desired_date,created_at);
create index if not exists booking_waitlist_contact_idx on public.booking_waitlist(restaurant_id,phone,email,desired_date);

alter table public.booking_waitlist enable row level security;
drop policy if exists booking_waitlist_read on public.booking_waitlist;
create policy booking_waitlist_read on public.booking_waitlist
for select to authenticated
using (app.has_capability(restaurant_id,'manage_tables') or app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin());

revoke all on public.booking_waitlist from public,anon,authenticated;
grant select on public.booking_waitlist to authenticated;
grant all on public.booking_waitlist to service_role;

drop trigger if exists trg_booking_waitlist_updated on public.booking_waitlist;
create trigger trg_booking_waitlist_updated before update on public.booking_waitlist for each row execute function public.set_updated_at();

create or replace function public.create_public_booking_waitlist(
  _slug text,_customer_name text,_phone text,_email text,_guest_count integer,_desired_date date,
  _preferred_time text default null,_notes text default null,_occasion text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  _r public.restaurants; _s public.booking_settings; _id uuid; _token text;
  _phone_clean text:=nullif(trim(coalesce(_phone,'')),'');
  _email_clean text:=nullif(lower(trim(coalesce(_email,''))),'');
  _position integer; _today date;
begin
  select * into _r from public.restaurants where slug=_slug and is_active limit 1;
  if _r.id is null then raise exception 'Restaurant not found'; end if;
  select * into _s from public.booking_settings where restaurant_id=_r.id;
  if _s.restaurant_id is null or not _s.online_enabled then raise exception 'Online reservations are not available'; end if;
  if length(trim(coalesce(_customer_name,'')))<1 then raise exception 'Name is required'; end if;
  if _guest_count<_s.min_party_size or _guest_count>_s.max_party_size then raise exception 'Party size is outside restaurant limits'; end if;
  if _s.require_phone and _phone_clean is null then raise exception 'Phone is required'; end if;
  if _s.require_email and _email_clean is null then raise exception 'Email is required'; end if;
  if _phone_clean is null and _email_clean is null then raise exception 'Phone or email is required'; end if;

  _today:=(now() at time zone coalesce(nullif(_r.timezone,''),'UTC'))::date;
  if _desired_date<_today then raise exception 'Waitlist date cannot be in the past'; end if;
  if _desired_date>_today+_s.max_advance_days then raise exception 'Waitlist date is outside the booking window'; end if;

  if exists(
    select 1 from public.booking_waitlist w
    where w.restaurant_id=_r.id and w.status in ('waiting','notified') and w.desired_date=_desired_date
      and ((_phone_clean is not null and w.phone=_phone_clean) or (_email_clean is not null and lower(w.email)=_email_clean))
  ) then raise exception 'You already have an active waitlist request for this date'; end if;

  if (
    select count(*) from public.booking_waitlist w
    where w.restaurant_id=_r.id and w.created_at>now()-interval '24 hours'
      and ((_phone_clean is not null and w.phone=_phone_clean) or (_email_clean is not null and lower(w.email)=_email_clean))
  )>=3 then raise exception 'Too many waitlist requests. Please try again later'; end if;

  _token:=encode(extensions.gen_random_bytes(24),'hex');

  insert into public.booking_waitlist(
    restaurant_id,customer_name,phone,email,guest_count,desired_date,preferred_time,occasion,notes,source,status,public_token
  ) values(
    _r.id,left(trim(_customer_name),120),_phone_clean,_email_clean,_guest_count,_desired_date,
    nullif(left(trim(coalesce(_preferred_time,'')),80),''),
    nullif(left(trim(coalesce(_occasion,'')),120),''),
    nullif(left(trim(coalesce(_notes,'')),1000),''),
    'public','waiting',_token
  ) returning id into _id;

  select count(*)::int into _position
  from public.booking_waitlist w
  where w.restaurant_id=_r.id and w.status in ('waiting','notified') and w.desired_date=_desired_date
    and (w.created_at<(select created_at from public.booking_waitlist where id=_id) or w.id=_id);

  return jsonb_build_object(
    'id',_id,'public_token',_token,'status','waiting','desired_date',_desired_date,
    'guest_count',_guest_count,'position',coalesce(_position,1),'restaurant_name',_r.name
  );
end;
$$;

revoke all on function public.create_public_booking_waitlist(text,text,text,text,integer,date,text,text,text) from public,authenticated;
grant execute on function public.create_public_booking_waitlist(text,text,text,text,integer,date,text,text,text) to anon,authenticated;

create or replace function public.transition_booking_waitlist(_waitlist_id uuid,_next text,_reason text default null)
returns public.booking_waitlist
language plpgsql security definer set search_path=''
as $$
declare _w public.booking_waitlist;
begin
  select * into _w from public.booking_waitlist where id=_waitlist_id for update;
  if _w.id is null then raise exception 'Waitlist entry not found'; end if;
  if not (app.has_capability(_w.restaurant_id,'manage_tables') or app.has_capability(_w.restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Not authorized' using errcode='42501'; end if;

  if not (
    (_w.status='waiting' and _next in ('notified','cancelled','expired'))
    or (_w.status='notified' and _next in ('waiting','cancelled','expired'))
  ) then raise exception 'Invalid waitlist transition from % to %',_w.status,_next; end if;

  update public.booking_waitlist
  set status=_next,
      notified_at=case when _next='notified' then now() else notified_at end,
      cancellation_reason=case when _next in ('cancelled','expired') then nullif(left(trim(coalesce(_reason,'')),500),'') else cancellation_reason end,
      updated_at=now()
  where id=_waitlist_id returning * into _w;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_w.restaurant_id,auth.uid(),'booking_waitlist_status_changed','booking_waitlist',_w.id,jsonb_build_object('status',_next,'reason',_reason));
  return _w;
end;
$$;
revoke all on function public.transition_booking_waitlist(uuid,text,text) from public,anon;
grant execute on function public.transition_booking_waitlist(uuid,text,text) to authenticated;

create or replace function public.convert_booking_waitlist(_waitlist_id uuid,_booking_at timestamptz,_table_id uuid default null)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare _w public.booking_waitlist; _booking_id uuid;
begin
  select * into _w from public.booking_waitlist where id=_waitlist_id for update;
  if _w.id is null then raise exception 'Waitlist entry not found'; end if;
  if _w.status not in ('waiting','notified') then raise exception 'Waitlist entry is not convertible'; end if;
  if not (app.has_capability(_w.restaurant_id,'manage_tables') or app.has_capability(_w.restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Not authorized' using errcode='42501'; end if;

  select public.create_staff_booking(
    _w.restaurant_id,_w.customer_name,coalesce(_w.phone,''),coalesce(_w.email,''),_w.guest_count,
    _booking_at,_table_id,null,'confirmed',_w.notes,_w.occasion,'staff'
  ) into _booking_id;

  update public.booking_waitlist set status='converted',converted_booking_id=_booking_id,updated_at=now() where id=_waitlist_id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_w.restaurant_id,auth.uid(),'booking_waitlist_converted','booking_waitlist',_w.id,jsonb_build_object('booking_id',_booking_id,'booking_at',_booking_at));
  return _booking_id;
end;
$$;
revoke all on function public.convert_booking_waitlist(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.convert_booking_waitlist(uuid,timestamptz,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
