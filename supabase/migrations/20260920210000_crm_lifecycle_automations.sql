
begin;

create table if not exists public.crm_automations(
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check(length(trim(name)) between 2 and 120),
  trigger_type text not null check(trigger_type in ('birthday','inactive_30','loyalty_milestone','high_value')),
  channel text not null check(channel in ('sms','whatsapp','email')),
  config jsonb not null default '{}'::jsonb,
  subject text,
  message text not null check(length(trim(message)) between 1 and 2000),
  cooldown_days integer not null default 30 check(cooldown_days between 1 and 3650),
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_automations_restaurant_idx on public.crm_automations(restaurant_id,enabled,trigger_type);
alter table public.crm_automations enable row level security;
drop policy if exists crm_automations_read on public.crm_automations;
create policy crm_automations_read on public.crm_automations for select to authenticated
using(app.has_capability(restaurant_id,'manage_restaurant') or app.has_capability(restaurant_id,'view_analytics') or app.is_super_admin());
drop policy if exists crm_automations_manage on public.crm_automations;
create policy crm_automations_manage on public.crm_automations for all to authenticated
using(app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin())
with check(app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin());
revoke all on public.crm_automations from public,anon,authenticated;
grant select,insert,update,delete on public.crm_automations to authenticated;
grant all on public.crm_automations to service_role;
drop trigger if exists trg_crm_automations_updated on public.crm_automations;
create trigger trg_crm_automations_updated before update on public.crm_automations for each row execute function public.set_updated_at();

create table if not exists public.crm_automation_history(
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.crm_automations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  guest_id uuid not null references public.crm_guests(id) on delete cascade,
  trigger_key text not null,
  campaign_id uuid references public.crm_campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(automation_id,guest_id,trigger_key)
);
create index if not exists crm_automation_history_recent_idx on public.crm_automation_history(automation_id,guest_id,created_at desc);
alter table public.crm_automation_history enable row level security;
drop policy if exists crm_automation_history_read on public.crm_automation_history;
create policy crm_automation_history_read on public.crm_automation_history for select to authenticated
using(app.has_capability(restaurant_id,'manage_restaurant') or app.has_capability(restaurant_id,'view_analytics') or app.is_super_admin());
revoke all on public.crm_automation_history from public,anon,authenticated;
grant select on public.crm_automation_history to authenticated;
grant all on public.crm_automation_history to service_role;

create or replace function public.process_crm_automations()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _a public.crm_automations%rowtype;
  _campaign_id uuid;
  _count integer;
  _trigger_key text;
  _threshold numeric;
  _tier_points integer;
  _result jsonb:='[]'::jsonb;
begin
  for _a in select * from public.crm_automations where enabled order by created_at loop
    begin
      _campaign_id:=gen_random_uuid();
      _threshold:=coalesce((_a.config->>'threshold')::numeric,case when _a.trigger_type='high_value' then 100 else 0 end);
      _tier_points:=coalesce((_a.config->>'points')::integer,100);

      _trigger_key:=case
        when _a.trigger_type='birthday' then 'birthday:'||extract(year from current_date)::int::text
        when _a.trigger_type='inactive_30' then 'inactive:'||to_char(current_date,'YYYY-MM-DD')
        when _a.trigger_type='loyalty_milestone' then 'loyalty:'||_tier_points::text
        when _a.trigger_type='high_value' then 'spend:'||_threshold::text
        else _a.trigger_type||':'||current_date::text
      end;

      insert into public.crm_campaigns(
        id,restaurant_id,name,channel,segment_type,segment_config,subject,message,status,scheduled_at,created_by
      ) values(
        _campaign_id,_a.restaurant_id,_a.name||' · Auto',_a.channel,
        case
          when _a.trigger_type='birthday' then 'birthday_month'
          when _a.trigger_type='inactive_30' then 'inactive_30'
          when _a.trigger_type='high_value' then 'vip'
          else 'loyalty_tier'
        end,
        _a.config,_a.subject,_a.message,'scheduled',now(),null
      );

      with eligible as (
        select g.id,g.phone,g.email,
          case _a.channel when 'email' then trim(g.email) else trim(g.phone) end destination
        from public.crm_guests g
        left join public.crm_loyalty_accounts l on l.restaurant_id=g.restaurant_id and l.guest_id=g.id
        where g.restaurant_id=_a.restaurant_id
          and g.marketing_opt_in
          and case _a.channel when 'email' then nullif(trim(g.email),'') is not null else nullif(trim(g.phone),'') is not null end
          and case _a.trigger_type
            when 'birthday' then g.birthday is not null and extract(month from g.birthday)=extract(month from current_date) and extract(day from g.birthday)=extract(day from current_date)
            when 'inactive_30' then g.last_visit_at is not null and g.last_visit_at < now()-interval '30 days'
            when 'loyalty_milestone' then coalesce(l.points,0)>=_tier_points
            when 'high_value' then g.lifetime_spend>=_threshold
            else false end
          and not exists(
            select 1 from public.crm_automation_history h
            where h.automation_id=_a.id and h.guest_id=g.id
              and (
                h.trigger_key=_trigger_key
                or h.created_at>now()-make_interval(days=>_a.cooldown_days)
              )
          )
      ),
      inserted as (
        insert into public.crm_campaign_recipients(campaign_id,restaurant_id,guest_id,destination)
        select _campaign_id,_a.restaurant_id,id,destination from eligible
        returning guest_id
      ),
      history as (
        insert into public.crm_automation_history(automation_id,restaurant_id,guest_id,trigger_key,campaign_id)
        select _a.id,_a.restaurant_id,guest_id,_trigger_key,_campaign_id from inserted
        on conflict(automation_id,guest_id,trigger_key) do nothing
        returning guest_id
      )
      select count(*)::int into _count from history;

      if _count=0 then
        delete from public.crm_campaigns where id=_campaign_id;
      else
        update public.crm_campaigns set recipient_count=_count where id=_campaign_id;
      end if;

      update public.crm_automations set last_run_at=now(),last_error=null where id=_a.id;
      _result:=_result||jsonb_build_array(jsonb_build_object('automation_id',_a.id,'campaign_id',case when _count>0 then _campaign_id else null end,'recipients',_count));
    exception when others then
      update public.crm_automations set last_run_at=now(),last_error=left(sqlerrm,1000) where id=_a.id;
      _result:=_result||jsonb_build_array(jsonb_build_object('automation_id',_a.id,'error',sqlerrm));
    end;
  end loop;
  return _result;
end;
$$;
revoke all on function public.process_crm_automations() from public,anon,authenticated;
grant execute on function public.process_crm_automations() to service_role;

do $$
begin
  perform cron.unschedule('quickserve-crm-automations') where exists(select 1 from cron.job where jobname='quickserve-crm-automations');
exception when others then null;
end $$;
select cron.schedule('quickserve-crm-automations','15 * * * *','select public.process_crm_automations();');

notify pgrst,'reload schema';
commit;
