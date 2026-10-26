begin;
set local lock_timeout='2s';
do $$ declare t text; begin
  foreach t in array array['booking_notification_jobs','waitlist_notification_jobs','booking_messages','crm_campaign_recipients'] loop
    execute format('alter table public.%I add column if not exists lease_token uuid, add column if not exists lease_expires_at timestamptz',t);
  end loop;
end $$;
alter table public.crm_campaign_recipients add column if not exists next_attempt_at timestamptz not null default now();

create or replace function public.claim_notification_jobs(_queue text,_campaign_id uuid default null)
returns setof jsonb language plpgsql security invoker set search_path=''
as $$
declare status_col text:='status'; ready text[]; extra text:=''; attempts integer:=3;
begin
  case _queue
    when 'booking_notification_jobs' then ready:=array['queued','retry'];
    when 'waitlist_notification_jobs' then ready:=array['queued','retry'];
    when 'booking_messages' then ready:=array['queued','failed']; status_col:='provider_status'; extra:=' and direction=''outbound'''; attempts:=4;
    when 'crm_campaign_recipients' then
      if _campaign_id is null then raise exception 'Campaign is required'; end if;
      ready:=array['pending','failed']; extra:=format(' and campaign_id=%L::uuid',_campaign_id);
    else raise exception 'Unsupported notification queue';
  end case;
  -- Non-idempotent SMS may have been accepted before a worker disappeared.
  -- Quarantine uncertain sends for reconciliation instead of blindly resending.
  execute format('update public.%I set %I=''failed'',attempt_count=$1,lease_token=null,lease_expires_at=null,last_error=''Delivery outcome unknown after interrupted attempt; reconcile with provider before retry'' where %I=''sending'' and (lease_expires_at<now() or (lease_expires_at is null and updated_at<now()-interval ''5 minutes''))',_queue,status_col,status_col) using attempts;
  return query execute format('with eligible as materialized (
      select id,row_number() over(partition by restaurant_id order by next_attempt_at,created_at,id) as position
      from public.%1$I where %2$I=any($1) and attempt_count<$2 and next_attempt_at<=now() %3$s
    ), candidates as (
      select j.id from public.%1$I j join eligible e on e.id=j.id where e.position<=2
      order by e.position,j.next_attempt_at,j.created_at,j.id limit 8 for update of j skip locked
    ), claimed as (
      update public.%1$I j set %2$I=''sending'',attempt_count=j.attempt_count+1,last_error=null,
        lease_token=gen_random_uuid(),lease_expires_at=now()+interval ''3 minutes''
      from candidates c where c.id=j.id returning j.*
    ) select to_jsonb(claimed) from claimed',_queue,status_col,extra) using ready,attempts;
end $$;
revoke all on function public.claim_notification_jobs(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_notification_jobs(text,uuid) to service_role;

create or replace function public.campaign_delivery_counts(_campaign_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('sent',count(*) filter(where status='sent'),
    'skipped',count(*) filter(where status='skipped'),
    'failed',count(*) filter(where status='failed' and attempt_count>=3),
    'remaining',count(*) filter(where status in ('pending','sending') or (status='failed' and attempt_count<3)))
  from public.crm_campaign_recipients where campaign_id=_campaign_id;
$$;
revoke all on function public.campaign_delivery_counts(uuid) from public,anon,authenticated;
grant execute on function public.campaign_delivery_counts(uuid) to service_role;
commit;
