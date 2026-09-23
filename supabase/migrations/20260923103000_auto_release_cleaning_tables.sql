begin;

create index if not exists restaurant_tables_cleaning_release_idx
  on public.restaurant_tables (status_updated_at)
  where is_active and service_status = 'cleaning';

create or replace function app.release_cleaning_tables()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _released integer;
begin
  update public.restaurant_tables
  set service_status = 'free',
      activated_at = null,
      status_updated_at = now(),
      status_updated_by = null
  where is_active
    and service_status = 'cleaning'
    and status_updated_at <= now() - interval '10 minutes';

  get diagnostics _released = row_count;
  return _released;
end;
$$;

revoke all on function app.release_cleaning_tables() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('quickserve-release-cleaning-tables')
  where exists (
    select 1
    from cron.job
    where jobname = 'quickserve-release-cleaning-tables'
  );
exception when others then
  null;
end $$;

select cron.schedule(
  'quickserve-release-cleaning-tables',
  '10 seconds',
  'select app.release_cleaning_tables();'
);

notify pgrst, 'reload schema';
commit;
