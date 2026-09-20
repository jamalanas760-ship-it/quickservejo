create or replace function app.refresh_saas_usage_and_maintenance()
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.saas_usage_daily(restaurant_id,usage_date,orders_count,active_staff,tables_count,menu_items_count)
  select r.id,current_date,
    (select count(*) from public.orders o where o.restaurant_id=r.id and o.created_at>=date_trunc('month',now())),
    (select count(*) from public.staff s where s.restaurant_id=r.id and s.is_active),
    (select count(*) from public.restaurant_tables t where t.restaurant_id=r.id and t.is_active),
    (select count(*) from public.menu_items m where m.restaurant_id=r.id and m.is_available)
  from public.restaurants r
  where r.archived_at is null
  on conflict(restaurant_id,usage_date) do update set
    orders_count=excluded.orders_count,
    active_staff=excluded.active_staff,
    tables_count=excluded.tables_count,
    menu_items_count=excluded.menu_items_count;

  delete from public.public_rate_limits where window_started_at<now()-interval '2 days';
  delete from public.performance_samples where created_at<now()-interval '90 days';
  delete from public.system_events where created_at<now()-interval '90 days' and severity<>'critical';
end;
$$;

do $$
declare _job bigint;
begin
  select jobid into _job from cron.job where jobname='quickserve-daily-usage-maintenance';
  if _job is not null then perform cron.unschedule(_job); end if;
  perform cron.schedule(
    'quickserve-daily-usage-maintenance',
    '17 2 * * *',
    'select app.refresh_saas_usage_and_maintenance();'
  );
end $$;
