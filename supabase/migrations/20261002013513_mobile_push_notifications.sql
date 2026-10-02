-- Device subscriptions are private to the signed-in account and tenant.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  endpoint text not null check(length(endpoint)<=2048 and endpoint like 'https://%'),
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check(auth ~ '^[A-Za-z0-9_-]{22}$'),
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id,restaurant_id,endpoint)
);
alter table public.push_subscriptions enable row level security;
create policy push_own on public.push_subscriptions for all to authenticated
using(user_id=(select auth.uid()) and app.has_restaurant_access(restaurant_id))
with check(user_id=(select auth.uid()) and app.has_restaurant_access(restaurant_id));
grant select,insert,update,delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create table public.push_delivery_jobs (
  notification_id uuid primary key references public.in_app_notifications(id) on delete cascade,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text
);
alter table public.push_delivery_jobs enable row level security;
revoke all on public.push_delivery_jobs from anon,authenticated;
grant all on public.push_delivery_jobs to service_role;

create or replace function public.push_public_key() returns text
language sql security definer set search_path='' as $$
select decrypted_secret from vault.decrypted_secrets where name='quickserve_push_public_key';
$$;
revoke all on function public.push_public_key() from public;
grant execute on function public.push_public_key() to authenticated;
create or replace function public.push_worker_config() returns jsonb
language sql security definer set search_path='' as $$
select jsonb_object_agg(replace(name,'quickserve_push_',''),decrypted_secret)
from vault.decrypted_secrets where name in ('quickserve_push_public_key','quickserve_push_private_key','quickserve_push_worker_secret');
$$;
revoke all on function public.push_worker_config() from public,anon,authenticated;
grant execute on function public.push_worker_config() to service_role;

create or replace function public.claim_push_jobs() returns setof public.push_delivery_jobs
language sql security definer set search_path='' as $$
update public.push_delivery_jobs j set attempts=j.attempts+1,next_attempt_at=now()+interval '90 seconds'
where j.notification_id in (select x.notification_id from public.push_delivery_jobs x
  where x.delivered_at is null and x.attempts<5 and x.next_attempt_at<=now()
  order by x.next_attempt_at for update skip locked limit 30)
returning j.*;
$$;
revoke all on function public.claim_push_jobs() from public,anon,authenticated;
grant execute on function public.claim_push_jobs() to service_role;

create or replace function app.dispatch_mobile_push() returns void
language plpgsql security definer set search_path='' as $$
declare _secret text;
begin
  select decrypted_secret into _secret from vault.decrypted_secrets where name='quickserve_push_worker_secret';
  if _secret is not null then
    perform net.http_post(url:='https://gtcmyaksmyiarokloyje.supabase.co/functions/v1/quickserve-push-worker',
      headers:=jsonb_build_object('Content-Type','application/json','x-quickserve-worker',_secret),body:='{}'::jsonb);
  end if;
exception when others then
  raise warning 'Mobile push dispatch deferred to retry worker';
end; $$;
revoke all on function app.dispatch_mobile_push() from public,anon,authenticated;
create or replace function app.enqueue_mobile_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.push_delivery_jobs(notification_id) values(new.id) on conflict do nothing;
  -- pg_net dispatches only after commit, so rolled-back orders send no alerts.
  perform app.dispatch_mobile_push();
  return new;
end; $$;
create trigger trg_mobile_push after insert on public.in_app_notifications
for each row execute function app.enqueue_mobile_push();
select cron.schedule('quickserve-mobile-push-retry','* * * * *','select app.dispatch_mobile_push();');

create or replace function app.notify_new_order() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key)
  select new.restaurant_id,s.id,'alert','New order · '||new.order_number,
    'A new order is waiting for your team.','order',new.id,'new-order:'||new.id::text||':'||s.id::text
  from public.staff s where s.restaurant_id=new.restaurant_id and s.is_active
    and s.role::text in ('restaurant_admin','operations_manager','manager','kitchen','waiter','cashier','host')
    and coalesce(s.permission_overrides->'view_orders','true'::jsonb)<>'false'::jsonb
  on conflict do nothing;
  return new;
end; $$;
create trigger trg_notify_new_order after insert on public.orders
for each row execute function app.notify_new_order();
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='in_app_notifications') then
    alter publication supabase_realtime add table public.in_app_notifications;
  end if;
end $$;
notify pgrst,'reload schema';
