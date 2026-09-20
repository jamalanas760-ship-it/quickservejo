begin;
do $$
begin
  perform cron.unschedule('quickserve-campaign-worker') where exists(select 1 from cron.job where jobname='quickserve-campaign-worker');
exception when others then null;
end $$;
select cron.schedule(
  'quickserve-campaign-worker','* * * * *',
  $cron$
    select net.http_post(
      url:='https://gtcmyaksmyiarokloyje.supabase.co/functions/v1/quickserve-campaign-worker',
      headers:=jsonb_build_object('Content-Type','application/json','x-quickserve-worker',(select decrypted_secret from vault.decrypted_secrets where name='quickserve_campaign_worker_secret')),
      body:='{}'::jsonb,
      timeout_milliseconds:=8000
    );
  $cron$
);
commit;
