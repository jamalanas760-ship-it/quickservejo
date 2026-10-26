begin;
set local lock_timeout='2s';
alter table public.integration_jobs add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;
create index if not exists integration_jobs_expired_lease_idx on public.integration_jobs(lease_expires_at) where status='in_flight';

-- Service role only; no SECURITY DEFINER or caller-selected table/tenant context.
create or replace function public.claim_integration_jobs(_limit integer default 8)
returns setof public.integration_jobs language plpgsql security invoker set search_path=''
as $$
begin
  -- Old workers may have left an in-flight row without a lease. Give those rows
  -- a five-minute grace period before recovering them.
  update public.integration_jobs set status=case when attempt_count>=5 then 'failed' else 'retry' end,
    next_attempt_at=now(),lease_token=null,lease_expires_at=null,last_error='Previous worker lease expired'
  where status='in_flight' and (lease_expires_at<now() or
    (lease_expires_at is null and coalesce(request_started_at,updated_at)<now()-interval '5 minutes'));
  update public.integration_jobs set status='failed',last_error='Delivery retry limit reached'
    where status in ('queued','retry') and attempt_count>=5;

  return query
  with eligible as materialized (
    select id, row_number() over(partition by restaurant_id order by next_attempt_at,created_at,id) as position
    from public.integration_jobs where status in ('queued','retry') and next_attempt_at<=now() and attempt_count<5
  ), candidates as (
    select j.id from public.integration_jobs j join eligible e on e.id=j.id
    where e.position<=2 order by e.position,j.next_attempt_at,j.created_at,j.id
    limit greatest(1,least(coalesce(_limit,8),8)) for update of j skip locked
  )
  update public.integration_jobs j set status='in_flight',attempt_count=j.attempt_count+1,
    request_started_at=now(),lease_token=gen_random_uuid(),lease_expires_at=now()+interval '3 minutes',last_error=null
  from candidates c where c.id=j.id returning j.*;
end $$;
revoke all on function public.claim_integration_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_integration_jobs(integer) to service_role;

-- Manual retry must never steal a live lease or reset a completed external effect.
create or replace function public.retry_integration_job(_job_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare j public.integration_jobs;
begin
  select * into j from public.integration_jobs where id=_job_id for update;
  if not found then raise exception 'Integration job not found'; end if;
  if auth.uid() is null or not(app.has_capability(j.restaurant_id,'manage_restaurant') or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if j.status not in ('failed','retry') then raise exception 'Only failed/retry jobs can be retried' using errcode='22023'; end if;
  update public.integration_jobs set status='queued',attempt_count=0,next_attempt_at=now(),last_error=null,
    response_status=null,response_body=null,lease_token=null,lease_expires_at=null where id=_job_id;
end $$;
revoke all on function public.retry_integration_job(uuid) from public,anon;
grant execute on function public.retry_integration_job(uuid) to authenticated;
commit;
