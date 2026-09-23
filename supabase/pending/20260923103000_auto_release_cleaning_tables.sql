-- lovable-cron-fallback-reviewed: user-specified 10s release cadence for cleaning tables
-- Auto-release tables that have been in 'cleaning' for 10 minutes.
-- NOTE: this file mirrors the production migration. It is staged here because the
-- hosted database is paused and the managed migration runner could not write it to
-- supabase/migrations/ yet.
create index if not exists restaurant_tables_cleaning_status_updated_idx
  on public.restaurant_tables(status_updated_at)
  where service_status = 'cleaning' and is_active = true;

create or replace function app.release_cleaning_tables()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  released integer;
begin
  with due as (
    select id
    from public.restaurant_tables
    where service_status = 'cleaning'
      and is_active = true
      and status_updated_at is not null
      and status_updated_at <= now() - interval '10 minutes'
    for update skip locked
  )
  update public.restaurant_tables t
  set service_status = 'free',
      activated_at = null,
      status_updated_at = now(),
      status_updated_by = null
  from due
  where t.id = due.id;

  get diagnostics released = row_count;
  return released;
end;
$$;

revoke all on function app.release_cleaning_tables() from public;
revoke all on function app.release_cleaning_tables() from anon;
revoke all on function app.release_cleaning_tables() from authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('quickserve-release-cleaning-tables')
    where exists (
      select 1 from cron.job where jobname = 'quickserve-release-cleaning-tables'
    );

    perform cron.schedule(
      'quickserve-release-cleaning-tables',
      '10 seconds',
      $cron$select app.release_cleaning_tables();$cron$
    );
  end if;
end
$$;
