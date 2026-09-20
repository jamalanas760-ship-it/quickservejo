alter table public.menu_items
  add column if not exists sold_out_until timestamptz,
  add column if not exists sold_out_note text;

alter table public.orders
  add column if not exists assigned_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_note text,
  add column if not exists cancelled_at timestamptz;

create index if not exists orders_assigned_staff_idx on public.orders(assigned_staff_id) where assigned_staff_id is not null;

alter table public.restaurants add column if not exists staff_code text;
update public.restaurants
set staff_code = upper(substr(replace(id::text,'-',''),1,8))
where staff_code is null or btrim(staff_code)='';
create unique index if not exists restaurants_staff_code_uidx on public.restaurants(upper(staff_code)) where staff_code is not null;

create table if not exists public.staff_credentials (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  pin_hash text,
  login_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_credentials_login_code_uidx on public.staff_credentials(login_code) where login_code is not null;
create index if not exists staff_credentials_restaurant_idx on public.staff_credentials(restaurant_id);
alter table public.staff_credentials enable row level security;
revoke all on public.staff_credentials from anon, authenticated;

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists order_status_events_order_created_idx on public.order_status_events(order_id,created_at);
create index if not exists order_status_events_restaurant_created_idx on public.order_status_events(restaurant_id,created_at desc);
alter table public.order_status_events enable row level security;
drop policy if exists order_status_events_select on public.order_status_events;
create policy order_status_events_select on public.order_status_events for select to authenticated using(
  app.has_restaurant_access(restaurant_id) or app.is_super_admin()
);
grant select on public.order_status_events to authenticated;
revoke insert,update,delete on public.order_status_events from authenticated,anon;

create or replace function app.log_order_status_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare _actor_name text;
begin
  if old.status is distinct from new.status then
    select s.name into _actor_name
    from public.staff s
    where s.restaurant_id=new.restaurant_id and s.auth_user_id=(select auth.uid()) and s.is_active
    order by s.updated_at desc limit 1;
    insert into public.order_status_events(
      restaurant_id,order_id,from_status,to_status,actor_user_id,actor_name,note
    ) values(
      new.restaurant_id,new.id,old.status,new.status,(select auth.uid()),_actor_name,
      case when new.status='cancelled' then nullif(btrim(coalesce(new.cancellation_note,'')),'') else null end
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_order_status_events on public.orders;
create trigger trg_order_status_events after update of status on public.orders
for each row execute function app.log_order_status_change();

insert into public.order_status_events(restaurant_id,order_id,from_status,to_status,actor_user_id,actor_name,note,created_at)
select o.restaurant_id,o.id,null,o.status,null,null,'Imported current status',o.created_at
from public.orders o
where not exists(select 1 from public.order_status_events e where e.order_id=o.id);

create or replace function public.public_call_waiter(_qr_token text,_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare _table public.restaurant_tables; _settings public.restaurant_settings; _id uuid;
begin
  if _qr_token is null or btrim(_qr_token)='' then raise exception 'invalid table' using errcode='22023'; end if;
  perform app.enforce_public_rate_limit('waiter:'||btrim(_qr_token),4,60);
  select * into _table from public.restaurant_tables t where t.qr_token=btrim(_qr_token) and t.is_active limit 1;
  if _table.id is null then raise exception 'table not found' using errcode='22023'; end if;
  select * into _settings from public.restaurant_settings s where s.restaurant_id=_table.restaurant_id;
  if _settings.id is not null and not _settings.enable_waiter_calls then raise exception 'waiter calls disabled' using errcode='22023'; end if;
  if exists(
    select 1 from public.waiter_calls w
    where w.table_id=_table.id and w.status in ('pending','acknowledged')
      and w.created_at > now()-interval '2 minutes'
  ) then raise exception 'A waiter has already been called. Please wait a moment.' using errcode='P0001'; end if;
  insert into public.waiter_calls(restaurant_id,table_id,note)
  values(_table.restaurant_id,_table.id,nullif(left(btrim(coalesce(_note,'')),500),''))
  returning id into _id;
  return _id;
end;
$$;
revoke all on function public.public_call_waiter(text,text) from public;
grant execute on function public.public_call_waiter(text,text) to anon,authenticated;

create or replace function app.normalize_restaurant_staff_code()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.staff_code is null or btrim(new.staff_code)='' then
    new.staff_code:=upper(substr(replace(new.id::text,'-',''),1,8));
  else
    new.staff_code:=upper(regexp_replace(btrim(new.staff_code),'[^A-Z0-9]','','g'));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_restaurant_staff_code on public.restaurants;
create trigger trg_restaurant_staff_code
before insert or update of staff_code on public.restaurants
for each row execute function app.normalize_restaurant_staff_code();
