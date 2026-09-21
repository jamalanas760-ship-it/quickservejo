begin;

alter table public.booking_messages
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now();

create index if not exists booking_messages_outbound_queue_idx
  on public.booking_messages(direction,provider_status,next_attempt_at)
  where direction='outbound' and provider_status in ('queued','failed');

do $$
declare _worker_secret text; _secret_id uuid;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='quickserve_booking_message_worker_secret') then
    _worker_secret:=encode(extensions.gen_random_bytes(32),'hex');
    select vault.create_secret(
      _worker_secret,
      'quickserve_booking_message_worker_secret',
      'QuickServe booking messaging worker authentication'
    ) into _secret_id;
  end if;
end $$;

create or replace function public.verify_booking_message_worker_secret(_secret text)
returns boolean
language sql
security definer
set search_path=''
as $$
  select exists(
    select 1 from vault.decrypted_secrets
    where name='quickserve_booking_message_worker_secret'
      and decrypted_secret=coalesce(_secret,'')
  );
$$;

revoke all on function public.verify_booking_message_worker_secret(text) from public,anon,authenticated;
grant execute on function public.verify_booking_message_worker_secret(text) to service_role;

do $$
begin
  perform cron.unschedule('quickserve-booking-message-worker')
  where exists(select 1 from cron.job where jobname='quickserve-booking-message-worker');
exception when others then null;
end $$;

select cron.schedule(
  'quickserve-booking-message-worker',
  '* * * * *',
  $cron$
    select net.http_post(
      url:='https://gtcmyaksmyiarokloyje.supabase.co/functions/v1/quickserve-booking-message-worker',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-quickserve-worker',(select decrypted_secret from vault.decrypted_secrets where name='quickserve_booking_message_worker_secret')
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=8000
    );
  $cron$
);

notify pgrst,'reload schema';
commit;
