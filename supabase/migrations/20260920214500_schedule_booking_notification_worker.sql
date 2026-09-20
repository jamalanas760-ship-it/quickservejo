begin;
do $$
begin
  perform cron.unschedule('quickserve-booking-notification-worker') where exists(select 1 from cron.job where jobname='quickserve-booking-notification-worker');
exception when others then null;
end $$;
select cron.schedule(
  'quickserve-booking-notification-worker','* * * * *',
  $cron$
    select net.http_post(
      url:='https://gtcmyaksmyiarokloyje.supabase.co/functions/v1/quickserve-booking-worker',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'x-quickserve-worker',(select decrypted_secret from vault.decrypted_secrets where name='quickserve_booking_worker_secret')
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=10000
    );
  $cron$
);
commit;