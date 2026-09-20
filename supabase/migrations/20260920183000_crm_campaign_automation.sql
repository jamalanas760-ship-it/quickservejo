begin;

alter table public.crm_guests
  add column if not exists birthday date,
  add column if not exists marketing_consent_source text,
  add column if not exists preferences jsonb not null default '{}'::jsonb,
  add column if not exists allergies text[] not null default array[]::text[];

create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  channel text not null check (channel in ('sms','whatsapp','email')),
  segment_type text not null check (segment_type in ('all_opted_in','vip','repeat','inactive_30','inactive_60','inactive_90','birthday_month','loyalty_tier')),
  segment_config jsonb not null default '{}'::jsonb,
  subject text,
  message text not null check (length(trim(message)) between 1 and 2000),
  status text not null default 'draft' check (status in ('draft','scheduled','processing','completed','blocked','cancelled')),
  scheduled_at timestamptz,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_campaigns_restaurant_idx on public.crm_campaigns(restaurant_id, created_at desc);
create index if not exists crm_campaigns_due_idx on public.crm_campaigns(status, scheduled_at) where status='scheduled';

alter table public.crm_campaigns enable row level security;
drop policy if exists crm_campaigns_read on public.crm_campaigns;
create policy crm_campaigns_read on public.crm_campaigns
for select to authenticated
using (app.has_capability(restaurant_id,'manage_restaurant') or app.has_capability(restaurant_id,'view_analytics') or app.is_super_admin());
revoke all on public.crm_campaigns from public,anon,authenticated;
grant select on public.crm_campaigns to authenticated;
grant all on public.crm_campaigns to service_role;
drop trigger if exists trg_crm_campaigns_updated on public.crm_campaigns;
create trigger trg_crm_campaigns_updated before update on public.crm_campaigns for each row execute function public.set_updated_at();

create table if not exists public.crm_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.crm_campaigns(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_id uuid not null references public.crm_guests(id) on delete cascade,
  destination text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','skipped')),
  attempt_count integer not null default 0,
  provider_reference text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,guest_id)
);

create index if not exists crm_campaign_recipients_campaign_idx on public.crm_campaign_recipients(campaign_id,status);
create index if not exists crm_campaign_recipients_restaurant_idx on public.crm_campaign_recipients(restaurant_id,created_at desc);
alter table public.crm_campaign_recipients enable row level security;
drop policy if exists crm_campaign_recipients_read on public.crm_campaign_recipients;
create policy crm_campaign_recipients_read on public.crm_campaign_recipients
for select to authenticated
using (app.has_capability(restaurant_id,'manage_restaurant') or app.has_capability(restaurant_id,'view_analytics') or app.is_super_admin());
revoke all on public.crm_campaign_recipients from public,anon,authenticated;
grant select on public.crm_campaign_recipients to authenticated;
grant all on public.crm_campaign_recipients to service_role;
drop trigger if exists trg_crm_campaign_recipients_updated on public.crm_campaign_recipients;
create trigger trg_crm_campaign_recipients_updated before update on public.crm_campaign_recipients for each row execute function public.set_updated_at();

create or replace function public.preview_campaign_segment(
  _restaurant_id uuid,_segment_type text,_segment_config jsonb default '{}'::jsonb,_channel text default 'sms'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare _count int; _sample jsonb;
begin
  if not (app.has_capability(_restaurant_id,'manage_restaurant') or app.has_capability(_restaurant_id,'view_analytics') or app.is_super_admin())
  then raise exception 'Not authorized' using errcode='42501'; end if;

  with eligible as (
    select g.id,g.name,g.phone,g.email,g.visits,g.lifetime_spend,g.last_visit_at,g.birthday,coalesce(l.tier,'') loyalty_tier
    from public.crm_guests g
    left join public.crm_loyalty_accounts l on l.restaurant_id=g.restaurant_id and l.guest_id=g.id
    where g.restaurant_id=_restaurant_id and g.marketing_opt_in
      and case _channel when 'email' then nullif(trim(g.email),'') is not null else nullif(trim(g.phone),'') is not null end
      and case _segment_type
        when 'all_opted_in' then true
        when 'vip' then g.lifetime_spend >= coalesce((_segment_config->>'min_spend')::numeric,100)
        when 'repeat' then g.visits >= coalesce((_segment_config->>'min_visits')::int,2)
        when 'inactive_30' then g.last_visit_at is null or g.last_visit_at < now()-interval '30 days'
        when 'inactive_60' then g.last_visit_at is null or g.last_visit_at < now()-interval '60 days'
        when 'inactive_90' then g.last_visit_at is null or g.last_visit_at < now()-interval '90 days'
        when 'birthday_month' then g.birthday is not null and extract(month from g.birthday)=extract(month from current_date)
        when 'loyalty_tier' then coalesce(l.tier,'')=coalesce(_segment_config->>'tier','')
        else false end
  )
  select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'visits',visits,'lifetime_spend',lifetime_spend)) filter(where rn<=5),'[]'::jsonb)
  into _count,_sample
  from (select e.*,row_number() over(order by lifetime_spend desc nulls last,visits desc) rn from eligible e) ranked;
  return jsonb_build_object('count',coalesce(_count,0),'sample',coalesce(_sample,'[]'::jsonb));
end;
$$;

create or replace function public.create_crm_campaign(
  _restaurant_id uuid,_name text,_channel text,_segment_type text,_segment_config jsonb,_subject text,_message text
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare _id uuid;
begin
  if not (app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin()) then raise exception 'Restaurant admin access is required' using errcode='42501'; end if;
  if _channel not in ('sms','whatsapp','email') then raise exception 'Unsupported campaign channel'; end if;
  insert into public.crm_campaigns(restaurant_id,name,channel,segment_type,segment_config,subject,message,created_by)
  values(_restaurant_id,left(trim(_name),120),_channel,_segment_type,coalesce(_segment_config,'{}'::jsonb),nullif(left(trim(coalesce(_subject,'')),160),''),left(trim(_message),2000),auth.uid())
  returning id into _id;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'crm_campaign_created','crm_campaign',_id,jsonb_build_object('channel',_channel,'segment',_segment_type));
  return _id;
end;
$$;

create or replace function public.schedule_crm_campaign(_campaign_id uuid,_scheduled_at timestamptz)
returns integer
language plpgsql security definer set search_path=''
as $$
declare _c public.crm_campaigns%rowtype; _count int;
begin
  select * into _c from public.crm_campaigns where id=_campaign_id for update;
  if _c.id is null then raise exception 'Campaign not found'; end if;
  if not (app.has_capability(_c.restaurant_id,'manage_restaurant') or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
  if _c.status not in ('draft','blocked') then raise exception 'Campaign cannot be scheduled from current status'; end if;
  if _scheduled_at < now()-interval '1 minute' then raise exception 'Schedule time cannot be in the past'; end if;

  delete from public.crm_campaign_recipients where campaign_id=_campaign_id;
  insert into public.crm_campaign_recipients(campaign_id,restaurant_id,guest_id,destination)
  select _c.id,_c.restaurant_id,g.id,case _c.channel when 'email' then trim(g.email) else trim(g.phone) end
  from public.crm_guests g
  left join public.crm_loyalty_accounts l on l.restaurant_id=g.restaurant_id and l.guest_id=g.id
  where g.restaurant_id=_c.restaurant_id and g.marketing_opt_in
    and case _c.channel when 'email' then nullif(trim(g.email),'') is not null else nullif(trim(g.phone),'') is not null end
    and case _c.segment_type
      when 'all_opted_in' then true
      when 'vip' then g.lifetime_spend >= coalesce((_c.segment_config->>'min_spend')::numeric,100)
      when 'repeat' then g.visits >= coalesce((_c.segment_config->>'min_visits')::int,2)
      when 'inactive_30' then g.last_visit_at is null or g.last_visit_at < now()-interval '30 days'
      when 'inactive_60' then g.last_visit_at is null or g.last_visit_at < now()-interval '60 days'
      when 'inactive_90' then g.last_visit_at is null or g.last_visit_at < now()-interval '90 days'
      when 'birthday_month' then g.birthday is not null and extract(month from g.birthday)=extract(month from current_date)
      when 'loyalty_tier' then coalesce(l.tier,'')=coalesce(_c.segment_config->>'tier','')
      else false end;
  get diagnostics _count=row_count;
  if _count=0 then raise exception 'No opted-in recipients match this campaign'; end if;
  update public.crm_campaigns set status='scheduled',scheduled_at=_scheduled_at,recipient_count=_count,sent_count=0,failed_count=0,skipped_count=0,last_error=null where id=_campaign_id;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_c.restaurant_id,auth.uid(),'crm_campaign_scheduled','crm_campaign',_campaign_id,jsonb_build_object('scheduled_at',_scheduled_at,'recipients',_count));
  return _count;
end;
$$;

create or replace function public.cancel_crm_campaign(_campaign_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare _c public.crm_campaigns%rowtype;
begin
  select * into _c from public.crm_campaigns where id=_campaign_id for update;
  if _c.id is null then raise exception 'Campaign not found'; end if;
  if not (app.has_capability(_c.restaurant_id,'manage_restaurant') or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
  if _c.status in ('completed','cancelled') then raise exception 'Campaign is already closed'; end if;
  update public.crm_campaigns set status='cancelled' where id=_campaign_id;
  update public.crm_campaign_recipients set status='skipped',last_error='Campaign cancelled' where campaign_id=_campaign_id and status in ('pending','sending','failed');
end;
$$;

revoke all on function public.preview_campaign_segment(uuid,text,jsonb,text) from public,anon;
grant execute on function public.preview_campaign_segment(uuid,text,jsonb,text) to authenticated;
revoke all on function public.create_crm_campaign(uuid,text,text,text,jsonb,text,text) from public,anon;
grant execute on function public.create_crm_campaign(uuid,text,text,text,jsonb,text,text) to authenticated;
revoke all on function public.schedule_crm_campaign(uuid,timestamptz) from public,anon;
grant execute on function public.schedule_crm_campaign(uuid,timestamptz) to authenticated;
revoke all on function public.cancel_crm_campaign(uuid) from public,anon;
grant execute on function public.cancel_crm_campaign(uuid) to authenticated;

do $$
declare _worker_secret text; _secret_id uuid;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='quickserve_campaign_worker_secret') then
    _worker_secret := encode(extensions.gen_random_bytes(32),'hex');
    select vault.create_secret(_worker_secret,'quickserve_campaign_worker_secret','QuickServe CRM campaign worker authentication') into _secret_id;
  end if;
end $$;

create or replace function public.verify_campaign_worker_secret(_secret text)
returns boolean language sql security definer set search_path=''
as $$ select exists(select 1 from vault.decrypted_secrets where name='quickserve_campaign_worker_secret' and decrypted_secret=coalesce(_secret,'')); $$;
revoke all on function public.verify_campaign_worker_secret(text) from public,anon,authenticated;
grant execute on function public.verify_campaign_worker_secret(text) to service_role;

notify pgrst, 'reload schema';
commit;
