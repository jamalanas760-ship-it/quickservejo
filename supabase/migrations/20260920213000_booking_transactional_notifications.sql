
begin;

create table if not exists public.booking_notification_jobs(
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  booking_id uuid not null references public.table_bookings(id) on delete cascade,
  notification_type text not null check(notification_type in ('confirmation','reminder')),
  channel text not null check(channel in ('sms','whatsapp','email')),
  destination text not null,
  status text not null default 'queued' check(status in ('queued','sending','retry','sent','failed','skipped')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_reference text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(booking_id,notification_type)
);
create index if not exists booking_notification_jobs_queue_idx on public.booking_notification_jobs(status,next_attempt_at)
  where status in ('queued','retry','sending');
create index if not exists booking_notification_jobs_restaurant_idx on public.booking_notification_jobs(restaurant_id,created_at desc);
alter table public.booking_notification_jobs enable row level security;
drop policy if exists booking_notification_jobs_read on public.booking_notification_jobs;
create policy booking_notification_jobs_read on public.booking_notification_jobs
for select to authenticated
using(app.has_capability(restaurant_id,'manage_tables') or app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin());
revoke all on public.booking_notification_jobs from public,anon,authenticated;
grant select on public.booking_notification_jobs to authenticated;
grant all on public.booking_notification_jobs to service_role;
drop trigger if exists trg_booking_notification_jobs_updated on public.booking_notification_jobs;
create trigger trg_booking_notification_jobs_updated before update on public.booking_notification_jobs
for each row execute function public.set_updated_at();

create or replace function app.enqueue_booking_confirmation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare _s public.booking_settings; _channel text; _destination text;
begin
  if new.status<>'confirmed' or new.confirmation_sent_at is not null then return new; end if;
  if tg_op='UPDATE' and old.status='confirmed' then return new; end if;
  select * into _s from public.booking_settings where restaurant_id=new.restaurant_id;
  _channel:=coalesce(_s.confirmation_channel,'none');
  if _channel='none' then return new; end if;
  _destination:=case when _channel='email' then nullif(trim(new.email),'') else nullif(trim(new.phone),'') end;
  if _destination is null then return new; end if;
  insert into public.booking_notification_jobs(restaurant_id,booking_id,notification_type,channel,destination)
  values(new.restaurant_id,new.id,'confirmation',_channel,_destination)
  on conflict(booking_id,notification_type) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_enqueue_booking_confirmation on public.table_bookings;
create trigger trg_enqueue_booking_confirmation
after insert or update of status on public.table_bookings
for each row execute function app.enqueue_booking_confirmation();

create or replace function public.enqueue_due_booking_reminders()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare _count integer;
begin
  insert into public.booking_notification_jobs(restaurant_id,booking_id,notification_type,channel,destination)
  select b.restaurant_id,b.id,'reminder',s.reminder_channel,
    case when s.reminder_channel='email' then trim(b.email) else trim(b.phone) end
  from public.table_bookings b
  join public.booking_settings s on s.restaurant_id=b.restaurant_id
  where b.status='confirmed'
    and b.reminder_sent_at is null
    and s.reminder_channel<>'none'
    and b.booking_at>now()
    and b.booking_at<=now()+make_interval(hours=>s.reminder_hours)
    and case when s.reminder_channel='email' then nullif(trim(b.email),'') is not null else nullif(trim(b.phone),'') is not null end
  on conflict(booking_id,notification_type) do nothing;
  get diagnostics _count=row_count;
  return _count;
end;
$$;
revoke all on function public.enqueue_due_booking_reminders() from public,anon,authenticated;
grant execute on function public.enqueue_due_booking_reminders() to service_role;

do $$
declare _secret text; _id uuid;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='quickserve_booking_worker_secret') then
    _secret:=encode(extensions.gen_random_bytes(32),'hex');
    select vault.create_secret(_secret,'quickserve_booking_worker_secret','QuickServe booking notification worker authentication') into _id;
  end if;
end $$;

create or replace function public.verify_booking_worker_secret(_secret text)
returns boolean language sql security definer set search_path=''
as $$ select exists(select 1 from vault.decrypted_secrets where name='quickserve_booking_worker_secret' and decrypted_secret=coalesce(_secret,'')); $$;
revoke all on function public.verify_booking_worker_secret(text) from public,anon,authenticated;
grant execute on function public.verify_booking_worker_secret(text) to service_role;

do $$
begin
  perform cron.unschedule('quickserve-booking-reminders') where exists(select 1 from cron.job where jobname='quickserve-booking-reminders');
exception when others then null;
end $$;
select cron.schedule('quickserve-booking-reminders','*/10 * * * *','select public.enqueue_due_booking_reminders();');

notify pgrst,'reload schema';
commit;
