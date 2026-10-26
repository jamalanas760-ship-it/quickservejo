begin;
create or replace function public.platform_reliability_snapshot()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare q record; rows jsonb; queues jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or not public.is_platform_owner() then
    raise exception 'Platform owner access required' using errcode='42501';
  end if;
  for q in select * from (values
    ('integration_jobs','status',5,''),
    ('booking_notification_jobs','status',3,''),
    ('waitlist_notification_jobs','status',3,''),
    ('booking_messages','provider_status',4,' where direction=''outbound'''),
    ('crm_campaign_recipients','status',3,'')
  ) as queues(table_name,status_col,max_attempts,extra) loop
    execute format('select coalesce(jsonb_agg(x),''[]''::jsonb) from (
      select %L as queue,restaurant_id,
        count(*) filter(where %I in (''queued'',''retry'',''pending'') or (%I=''failed'' and attempt_count<%s)) as pending,
        count(*) filter(where %I in (''sending'',''in_flight'')) as in_flight,
        count(*) filter(where %I in (''sending'',''in_flight'') and lease_expires_at<now()) as expired_leases,
        count(*) filter(where %I=''failed'' and attempt_count>=%s) as failed,
        max(extract(epoch from now()-created_at)) filter(where %I in (''queued'',''retry'',''pending'') or (%I=''failed'' and attempt_count<%s)) as oldest_pending_seconds
      from public.%I %s group by restaurant_id
    ) x',q.table_name,q.status_col,q.status_col,q.max_attempts,q.status_col,q.status_col,q.status_col,q.max_attempts,q.status_col,q.status_col,q.max_attempts,q.table_name,q.extra) into rows;
    queues:=queues||rows;
  end loop;
  return jsonb_build_object('sampled_at',now(),'queues',queues);
end $$;
revoke all on function public.platform_reliability_snapshot() from public,anon;
grant execute on function public.platform_reliability_snapshot() to authenticated;
commit;
