
-- Restore production schema contracts required by current QuickServe operations UI.

-- ---------------------------------------------------------------------------
-- Staff PIN/badge sign-in primitives.
-- ---------------------------------------------------------------------------
alter table public.restaurants
  add column if not exists staff_code text;

create unique index if not exists restaurants_staff_code_uidx
  on public.restaurants(staff_code)
  where staff_code is not null;

create or replace function app.assign_restaurant_staff_code()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare _candidate text;
begin
  if nullif(btrim(coalesce(new.staff_code,'')),'') is not null then
    new.staff_code := upper(btrim(new.staff_code));
    return new;
  end if;

  loop
    _candidate := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists (
      select 1 from public.restaurants r where r.staff_code=_candidate
    );
  end loop;
  new.staff_code := _candidate;
  return new;
end;
$$;

drop trigger if exists trg_restaurant_staff_code on public.restaurants;
create trigger trg_restaurant_staff_code
before insert on public.restaurants
for each row execute function app.assign_restaurant_staff_code();

do $$
declare _row record; _candidate text;
begin
  for _row in select id from public.restaurants where staff_code is null or btrim(staff_code)='' loop
    loop
      _candidate := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
      exit when not exists(select 1 from public.restaurants where staff_code=_candidate);
    end loop;
    update public.restaurants set staff_code=_candidate where id=_row.id;
  end loop;
end $$;

alter table public.restaurants
  add constraint restaurants_staff_code_format_check
  check (staff_code is null or staff_code ~ '^[A-Z0-9]{4,12}$') not valid;
alter table public.restaurants validate constraint restaurants_staff_code_format_check;

create table if not exists public.staff_credentials (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  pin_hash text,
  login_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists staff_credentials_login_code_uidx
  on public.staff_credentials(login_code)
  where login_code is not null;
create index if not exists staff_credentials_restaurant_idx
  on public.staff_credentials(restaurant_id)
  where restaurant_id is not null;

alter table public.staff_credentials enable row level security;
drop policy if exists staff_credentials_no_direct_access on public.staff_credentials;
create policy staff_credentials_no_direct_access
on public.staff_credentials
for all
to anon,authenticated
using(false)
with check(false);

revoke all on public.staff_credentials from public,anon,authenticated;
grant all on public.staff_credentials to service_role;

drop trigger if exists trg_staff_credentials_updated on public.staff_credentials;
create trigger trg_staff_credentials_updated
before update on public.staff_credentials
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Menu availability metadata.
-- ---------------------------------------------------------------------------
alter table public.menu_items
  add column if not exists sold_out_until timestamptz,
  add column if not exists sold_out_note text;

create index if not exists menu_items_sold_out_until_idx
  on public.menu_items(restaurant_id,sold_out_until)
  where sold_out_until is not null;

-- ---------------------------------------------------------------------------
-- Order assignment, cancellation and append-only status history.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists assigned_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

create index if not exists orders_assigned_staff_idx
  on public.orders(assigned_staff_id)
  where assigned_staff_id is not null;
create index if not exists orders_cancelled_by_idx
  on public.orders(cancelled_by)
  where cancelled_by is not null;
create index if not exists orders_restaurant_created_idx
  on public.orders(restaurant_id,created_at desc);

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_role public.app_role,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_status_events_order_idx
  on public.order_status_events(order_id,created_at);
create index if not exists order_status_events_restaurant_idx
  on public.order_status_events(restaurant_id,created_at desc);
create index if not exists order_status_events_actor_idx
  on public.order_status_events(actor_user_id)
  where actor_user_id is not null;

alter table public.order_status_events enable row level security;
drop policy if exists order_status_events_select on public.order_status_events;
create policy order_status_events_select
on public.order_status_events
for select
to authenticated
using(
  app.has_capability(restaurant_id,'view_orders')
  or app.has_capability(restaurant_id,'view_analytics')
  or app.has_capability(restaurant_id,'manage_restaurant')
);
revoke all on public.order_status_events from public,anon,authenticated;
grant select on public.order_status_events to authenticated;
grant all on public.order_status_events to service_role;

create or replace function app.log_order_status_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _staff public.staff%rowtype;
  _from public.order_status;
  _note text;
begin
  if tg_op='INSERT' then
    _from := null;
  elsif old.status is not distinct from new.status then
    return new;
  else
    _from := old.status;
  end if;

  if (select auth.uid()) is not null then
    select * into _staff
    from public.staff s
    where s.auth_user_id=(select auth.uid())
      and s.restaurant_id=new.restaurant_id
      and s.is_active
    order by case when s.role='restaurant_admin' then 0 else 1 end
    limit 1;
  end if;

  _note := case when new.status='cancelled' then new.cancellation_note else null end;

  insert into public.order_status_events(
    restaurant_id,order_id,from_status,to_status,
    actor_user_id,actor_name,actor_role,note
  ) values(
    new.restaurant_id,new.id,_from,new.status,
    (select auth.uid()),_staff.name,_staff.role,_note
  );
  return new;
end;
$$;

drop trigger if exists trg_order_status_event_insert on public.orders;
create trigger trg_order_status_event_insert
after insert on public.orders
for each row execute function app.log_order_status_event();

drop trigger if exists trg_order_status_event_update on public.orders;
create trigger trg_order_status_event_update
after update of status on public.orders
for each row execute function app.log_order_status_event();

create or replace function app.stamp_order_operational_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.assigned_staff_id is distinct from old.assigned_staff_id then
    if new.assigned_staff_id is null then
      new.assigned_at := null;
    else
      if not exists(
        select 1 from public.staff s
        where s.id=new.assigned_staff_id
          and s.restaurant_id=old.restaurant_id
          and s.is_active
      ) then
        raise exception 'Assigned staff member does not belong to this restaurant'
          using errcode='22023';
      end if;
      new.assigned_at := coalesce(new.assigned_at,now());
    end if;
  end if;

  if new.status='cancelled' and old.status is distinct from new.status then
    new.cancelled_at := coalesce(new.cancelled_at,now());
    new.cancelled_by := coalesce(new.cancelled_by,(select auth.uid()));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stamp_order_operational_fields on public.orders;
create trigger trg_stamp_order_operational_fields
before update on public.orders
for each row execute function app.stamp_order_operational_fields();

-- Remove the obsolete hard-coded role trigger. Capability-based guarding below
-- is the single source of truth and supports all current roles.
drop trigger if exists trg_enforce_member_order_scope on public.orders;

create or replace function app.guard_order_capability_updates()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _can_status boolean;
  _can_payment boolean;
  _allowed text[] := array['updated_at'];
begin
  if app.is_super_admin() or app.has_capability(old.restaurant_id,'manage_restaurant') then
    return new;
  end if;

  _can_status := app.has_capability(old.restaurant_id,'update_order_status');
  _can_payment := app.has_capability(old.restaurant_id,'manage_payments');

  if not _can_status and not _can_payment then
    raise exception 'You do not have permission to update this order'
      using errcode='42501';
  end if;

  if _can_status then
    _allowed := _allowed || array[
      'status','assigned_staff_id','assigned_at',
      'cancellation_reason','cancellation_note','cancelled_at','cancelled_by'
    ];
  end if;

  if _can_payment then
    _allowed := _allowed || array['payment_status'];
    if (old.status='served' and new.status='paid')
       or (old.status='paid' and new.status='served') then
      _allowed := _allowed || array['status'];
    end if;
  end if;

  if (to_jsonb(new) - _allowed) is distinct from (to_jsonb(old) - _allowed) then
    raise exception 'This role may only update permitted order fields'
      using errcode='42501';
  end if;

  if new.status is distinct from old.status then
    if _can_status then
      null;
    elsif _can_payment and (
      (old.status='served' and new.status='paid')
      or (old.status='paid' and new.status='served')
    ) then
      null;
    else
      raise exception 'You do not have permission to change order status'
        using errcode='42501';
    end if;
  end if;

  if new.payment_status is distinct from old.payment_status and not _can_payment then
    raise exception 'You do not have permission to change payment status'
      using errcode='42501';
  end if;

  return new;
end;
$$;

notify pgrst,'reload schema';
