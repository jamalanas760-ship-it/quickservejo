begin;

create extension if not exists pg_net;

create table if not exists public.integration_api_keys (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  key_prefix text not null,
  key_hash bytea not null unique,
  scopes text[] not null default array['orders:read']::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists integration_api_keys_restaurant_idx
  on public.integration_api_keys(restaurant_id, revoked_at, created_at desc);

alter table public.integration_api_keys enable row level security;
revoke all on public.integration_api_keys from public, anon, authenticated;
grant all on public.integration_api_keys to service_role;

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  url text not null check (url ~ '^https://'),
  event_types text[] not null default array['order.created','order.status_changed','payment.completed']::text[],
  vault_secret_id uuid not null,
  is_active boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_endpoints_restaurant_idx
  on public.webhook_endpoints(restaurant_id, is_active);

alter table public.webhook_endpoints enable row level security;
drop policy if exists webhook_endpoints_select on public.webhook_endpoints;
create policy webhook_endpoints_select
on public.webhook_endpoints for select to authenticated
using (app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin());
revoke all on public.webhook_endpoints from public, anon, authenticated;
grant select on public.webhook_endpoints to authenticated;
grant all on public.webhook_endpoints to service_role;

drop trigger if exists trg_webhook_endpoints_updated on public.webhook_endpoints;
create trigger trg_webhook_endpoints_updated
before update on public.webhook_endpoints
for each row execute function public.set_updated_at();

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','in_flight','retry','delivered','failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  request_id bigint,
  response_status integer,
  response_body text,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_queue_idx
  on public.webhook_deliveries(status, next_attempt_at)
  where status in ('queued','retry','in_flight');
create index if not exists webhook_deliveries_restaurant_idx
  on public.webhook_deliveries(restaurant_id, created_at desc);
create index if not exists webhook_deliveries_endpoint_idx
  on public.webhook_deliveries(endpoint_id, created_at desc);

alter table public.webhook_deliveries enable row level security;
drop policy if exists webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select
on public.webhook_deliveries for select to authenticated
using (app.has_capability(restaurant_id,'manage_restaurant') or app.is_super_admin());
revoke all on public.webhook_deliveries from public, anon, authenticated;
grant select on public.webhook_deliveries to authenticated;
grant all on public.webhook_deliveries to service_role;

drop trigger if exists trg_webhook_deliveries_updated on public.webhook_deliveries;
create trigger trg_webhook_deliveries_updated
before update on public.webhook_deliveries
for each row execute function public.set_updated_at();

create or replace function public.create_integration_api_key(
  _restaurant_id uuid,
  _name text,
  _scopes text[] default array['orders:read']::text[],
  _expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _id uuid := gen_random_uuid();
  _secret text := 'qs_live_' || encode(extensions.gen_random_bytes(24),'hex');
  _prefix text;
begin
  if not (app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if length(trim(coalesce(_name,''))) < 2 then raise exception 'Key name is required'; end if;
  if _expires_at is not null and _expires_at <= now() then raise exception 'Expiration must be in the future'; end if;

  _prefix := left(_secret,16);
  insert into public.integration_api_keys(id,restaurant_id,name,key_prefix,key_hash,scopes,expires_at,created_by)
  values(
    _id,_restaurant_id,left(trim(_name),100),_prefix,
    extensions.digest(convert_to(_secret,'UTF8'),'sha256'),
    coalesce(_scopes,array[]::text[]),_expires_at,auth.uid()
  );

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'integration_api_key_created','integration_api_key',_id,jsonb_build_object('name',left(trim(_name),100),'scopes',coalesce(_scopes,array[]::text[])));

  return jsonb_build_object('id',_id,'api_key',_secret,'key_prefix',_prefix);
end;
$$;

create or replace function public.list_integration_api_keys(_restaurant_id uuid)
returns table(
  id uuid,name text,key_prefix text,scopes text[],expires_at timestamptz,last_used_at timestamptz,revoked_at timestamptz,created_at timestamptz
)
language sql
security definer
set search_path=''
as $$
  select k.id,k.name,k.key_prefix,k.scopes,k.expires_at,k.last_used_at,k.revoked_at,k.created_at
  from public.integration_api_keys k
  where k.restaurant_id=_restaurant_id
    and (app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin())
  order by k.created_at desc;
$$;

create or replace function public.revoke_integration_api_key(_key_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare _row public.integration_api_keys%rowtype;
begin
  select * into _row from public.integration_api_keys where id=_key_id for update;
  if _row.id is null then raise exception 'API key not found'; end if;
  if not (app.has_capability(_row.restaurant_id,'manage_restaurant') or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.integration_api_keys set revoked_at=coalesce(revoked_at,now()) where id=_key_id;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_row.restaurant_id,auth.uid(),'integration_api_key_revoked','integration_api_key',_key_id,jsonb_build_object('name',_row.name));
end;
$$;

create or replace function public.authenticate_integration_api_key(_api_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare _row public.integration_api_keys%rowtype;
begin
  select * into _row
  from public.integration_api_keys
  where key_hash=extensions.digest(convert_to(coalesce(_api_key,''),'UTF8'),'sha256')
    and revoked_at is null
    and (expires_at is null or expires_at>now())
  limit 1;

  if _row.id is null then return null; end if;

  update public.integration_api_keys set last_used_at=now() where id=_row.id;
  return jsonb_build_object('id',_row.id,'restaurant_id',_row.restaurant_id,'scopes',_row.scopes,'name',_row.name);
end;
$$;

revoke all on function public.authenticate_integration_api_key(text) from public,anon,authenticated;
grant execute on function public.authenticate_integration_api_key(text) to service_role;
revoke all on function public.create_integration_api_key(uuid,text,text[],timestamptz) from public,anon;
grant execute on function public.create_integration_api_key(uuid,text,text[],timestamptz) to authenticated;
revoke all on function public.list_integration_api_keys(uuid) from public,anon;
grant execute on function public.list_integration_api_keys(uuid) to authenticated;
revoke all on function public.revoke_integration_api_key(uuid) from public,anon;
grant execute on function public.revoke_integration_api_key(uuid) to authenticated;

create or replace function public.create_webhook_endpoint(
  _restaurant_id uuid,
  _name text,
  _url text,
  _event_types text[]
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  _id uuid := gen_random_uuid();
  _secret text := 'qs_whsec_' || encode(extensions.gen_random_bytes(24),'hex');
  _vault_id uuid;
begin
  if not (app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if _url !~ '^https://' then raise exception 'Webhook URL must use HTTPS'; end if;
  if length(trim(coalesce(_name,'')))<2 then raise exception 'Webhook name is required'; end if;

  select vault.create_secret(_secret,'quickserve-webhook-'||_id::text,'QuickServe webhook signing secret') into _vault_id;

  insert into public.webhook_endpoints(id,restaurant_id,name,url,event_types,vault_secret_id,created_by)
  values(_id,_restaurant_id,left(trim(_name),100),left(trim(_url),2000),coalesce(_event_types,array[]::text[]),_vault_id,auth.uid());

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'webhook_endpoint_created','webhook_endpoint',_id,jsonb_build_object('name',left(trim(_name),100),'url',left(trim(_url),2000)));

  return jsonb_build_object('id',_id,'signing_secret',_secret);
end;
$$;

create or replace function public.disable_webhook_endpoint(_endpoint_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare _row public.webhook_endpoints%rowtype;
begin
  select * into _row from public.webhook_endpoints where id=_endpoint_id for update;
  if _row.id is null then raise exception 'Webhook endpoint not found'; end if;
  if not (app.has_capability(_row.restaurant_id,'manage_restaurant') or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.webhook_endpoints set is_active=false where id=_endpoint_id;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id)
  values(_row.restaurant_id,auth.uid(),'webhook_endpoint_disabled','webhook_endpoint',_endpoint_id);
end;
$$;

create or replace function public.enqueue_webhook_test(_endpoint_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare _row public.webhook_endpoints%rowtype; _id uuid;
begin
  select * into _row from public.webhook_endpoints where id=_endpoint_id and is_active for update;
  if _row.id is null then raise exception 'Active webhook endpoint not found'; end if;
  if not (app.has_capability(_row.restaurant_id,'manage_restaurant') or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  insert into public.webhook_deliveries(restaurant_id,endpoint_id,event_type,payload)
  values(_row.restaurant_id,_endpoint_id,'webhook.test',jsonb_build_object('event','webhook.test','created_at',now(),'restaurant_id',_row.restaurant_id))
  returning id into _id;
  return _id;
end;
$$;

create or replace function public.queue_webhook_event(
  _restaurant_id uuid,
  _event_type text,
  _payload jsonb
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare _count integer;
begin
  insert into public.webhook_deliveries(restaurant_id,endpoint_id,event_type,payload)
  select _restaurant_id,e.id,_event_type,
    jsonb_build_object(
      'id',gen_random_uuid(),
      'event',_event_type,
      'created_at',now(),
      'restaurant_id',_restaurant_id,
      'data',coalesce(_payload,'{}'::jsonb)
    )
  from public.webhook_endpoints e
  where e.restaurant_id=_restaurant_id
    and e.is_active
    and (_event_type=any(e.event_types) or '*'=any(e.event_types));
  get diagnostics _count=row_count;
  return _count;
end;
$$;

revoke all on function public.queue_webhook_event(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.queue_webhook_event(uuid,text,jsonb) to service_role;
revoke all on function public.create_webhook_endpoint(uuid,text,text,text[]) from public,anon;
grant execute on function public.create_webhook_endpoint(uuid,text,text,text[]) to authenticated;
revoke all on function public.disable_webhook_endpoint(uuid) from public,anon;
grant execute on function public.disable_webhook_endpoint(uuid) to authenticated;
revoke all on function public.enqueue_webhook_test(uuid) from public,anon;
grant execute on function public.enqueue_webhook_test(uuid) to authenticated;

create or replace function app.enqueue_quickserve_order_webhooks()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    perform public.queue_webhook_event(new.restaurant_id,'order.created',
      jsonb_build_object('order_id',new.id,'order_number',new.order_number,'status',new.status,'payment_status',new.payment_status,'total',new.total,'currency',new.currency,'fulfillment_type',new.fulfillment_type));
  elsif new.status is distinct from old.status then
    perform public.queue_webhook_event(new.restaurant_id,'order.status_changed',
      jsonb_build_object('order_id',new.id,'order_number',new.order_number,'previous_status',old.status,'status',new.status,'updated_at',new.updated_at));
  end if;
  if tg_op='UPDATE' and new.payment_status is distinct from old.payment_status then
    perform public.queue_webhook_event(new.restaurant_id,'order.payment_changed',
      jsonb_build_object('order_id',new.id,'order_number',new.order_number,'previous_payment_status',old.payment_status,'payment_status',new.payment_status,'updated_at',new.updated_at));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quickserve_order_webhooks on public.orders;
create trigger trg_quickserve_order_webhooks
after insert or update of status,payment_status on public.orders
for each row execute function app.enqueue_quickserve_order_webhooks();

create or replace function app.enqueue_quickserve_payment_webhooks()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='completed' then
    perform public.queue_webhook_event(new.restaurant_id,
      case when new.transaction_type='refund' then 'refund.completed' else 'payment.completed' end,
      jsonb_build_object('payment_id',new.id,'order_id',new.order_id,'transaction_type',new.transaction_type,'method',new.method,'amount',new.amount,'tip_amount',new.tip_amount,'reference',new.reference,'created_at',new.created_at));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quickserve_payment_webhooks on public.payment_transactions;
create trigger trg_quickserve_payment_webhooks
after insert on public.payment_transactions
for each row execute function app.enqueue_quickserve_payment_webhooks();

create or replace function public.dispatch_webhook_deliveries(_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  _row record;
  _secret text;
  _timestamp text;
  _body text;
  _signature text;
  _request_id bigint;
  _count integer := 0;
begin
  for _row in
    select d.*,e.url,e.vault_secret_id
    from public.webhook_deliveries d
    join public.webhook_endpoints e on e.id=d.endpoint_id
    where d.status in ('queued','retry') and d.next_attempt_at<=now() and e.is_active
    order by d.created_at
    limit greatest(1,least(coalesce(_limit,50),100))
    for update of d skip locked
  loop
    select decrypted_secret into _secret from vault.decrypted_secrets where id=_row.vault_secret_id;
    _timestamp := extract(epoch from now())::bigint::text;
    _body := _row.payload::text;
    _signature := encode(extensions.hmac(convert_to(_timestamp||'.'||_body,'UTF8'),convert_to(_secret,'UTF8'),'sha256'),'hex');

    select net.http_post(
      url:=_row.url,
      body:=_row.payload,
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'User-Agent','QuickServe-Webhooks/1.0',
        'X-QuickServe-Event',_row.event_type,
        'X-QuickServe-Delivery',_row.id::text,
        'X-QuickServe-Timestamp',_timestamp,
        'X-QuickServe-Signature','v1='||_signature
      ),
      timeout_milliseconds:=8000
    ) into _request_id;

    update public.webhook_deliveries
    set status='in_flight',request_id=_request_id,attempt_count=attempt_count+1,last_error=null
    where id=_row.id;
    _count := _count+1;
  end loop;
  return _count;
end;
$$;

create or replace function public.reconcile_webhook_deliveries()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare _count integer;
begin
  with responses as (
    select d.id,d.endpoint_id,d.attempt_count,r.status_code,r.content,r.error_msg,r.timed_out
    from public.webhook_deliveries d
    join net._http_response r on r.id=d.request_id
    where d.status='in_flight'
  ),
  updated as (
    update public.webhook_deliveries d
    set
      response_status=r.status_code,
      response_body=left(coalesce(r.content,''),4000),
      last_error=coalesce(r.error_msg,case when r.status_code is not null and r.status_code>=400 then 'HTTP '||r.status_code::text else null end),
      status=case
        when r.status_code between 200 and 299 and r.error_msg is null and not coalesce(r.timed_out,false) then 'delivered'
        when r.attempt_count>=5 then 'failed'
        else 'retry'
      end,
      delivered_at=case when r.status_code between 200 and 299 and r.error_msg is null and not coalesce(r.timed_out,false) then now() else null end,
      next_attempt_at=case
        when r.status_code between 200 and 299 and r.error_msg is null and not coalesce(r.timed_out,false) then d.next_attempt_at
        else now() + make_interval(mins=>least(60,power(2,greatest(r.attempt_count-1,0))::int))
      end
    from responses r
    where d.id=r.id
    returning d.id,d.endpoint_id,d.status,d.last_error
  )
  select count(*)::int into _count from updated;

  update public.webhook_endpoints e
  set
    last_success_at=case when exists(select 1 from public.webhook_deliveries d where d.endpoint_id=e.id and d.status='delivered' and d.updated_at>now()-interval '2 minutes') then now() else e.last_success_at end,
    last_failure_at=case when exists(select 1 from public.webhook_deliveries d where d.endpoint_id=e.id and d.status='failed' and d.updated_at>now()-interval '2 minutes') then now() else e.last_failure_at end,
    last_error=(select d.last_error from public.webhook_deliveries d where d.endpoint_id=e.id and d.status in ('failed','retry') order by d.updated_at desc limit 1)
  where exists(select 1 from public.webhook_deliveries d where d.endpoint_id=e.id and d.updated_at>now()-interval '2 minutes');

  update public.webhook_deliveries
  set status=case when attempt_count>=5 then 'failed' else 'retry' end,
      last_error='Webhook request response timed out',
      next_attempt_at=now()+make_interval(mins=>least(60,power(2,greatest(attempt_count-1,0))::int))
  where status='in_flight' and updated_at<now()-interval '2 minutes';

  return coalesce(_count,0);
end;
$$;

revoke all on function public.dispatch_webhook_deliveries(integer) from public,anon,authenticated;
revoke all on function public.reconcile_webhook_deliveries() from public,anon,authenticated;
grant execute on function public.dispatch_webhook_deliveries(integer) to service_role;
grant execute on function public.reconcile_webhook_deliveries() to service_role;

do $$
begin
  perform cron.unschedule('quickserve-webhook-dispatch') where exists(select 1 from cron.job where jobname='quickserve-webhook-dispatch');
exception when others then null;
end $$;
select cron.schedule('quickserve-webhook-dispatch','* * * * *','select public.reconcile_webhook_deliveries(); select public.dispatch_webhook_deliveries(50);');

notify pgrst, 'reload schema';
commit;
