begin;

alter table public.orders
  add column if not exists delivery_provider text,
  add column if not exists delivery_provider_reference text,
  add column if not exists delivery_status text,
  add column if not exists delivery_status_updated_at timestamptz;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='orders_delivery_status_check') then
    alter table public.orders add constraint orders_delivery_status_check
      check (delivery_status is null or delivery_status in ('pending','accepted','driver_assigned','picked_up','on_the_way','delivered','cancelled','failed'));
  end if;
end $$;
create index if not exists orders_delivery_provider_reference_idx
  on public.orders(restaurant_id,delivery_provider,delivery_provider_reference)
  where delivery_provider_reference is not null;

create table if not exists public.integration_jobs(
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  category text not null check(category in ('delivery','accounting')),
  action text not null,
  external_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check(status in ('queued','in_flight','retry','completed','failed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  request_started_at timestamptz,
  completed_at timestamptz,
  response_status integer,
  response_body text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id,external_key)
);
create index if not exists integration_jobs_queue_idx on public.integration_jobs(status,next_attempt_at)
  where status in ('queued','retry','in_flight');
create index if not exists integration_jobs_restaurant_idx on public.integration_jobs(restaurant_id,created_at desc);

alter table public.integration_jobs enable row level security;
drop policy if exists integration_jobs_read on public.integration_jobs;
create policy integration_jobs_read on public.integration_jobs
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_restaurant')
  or app.has_capability(restaurant_id,'view_analytics')
  or app.is_super_admin()
);
revoke all on public.integration_jobs from public,anon,authenticated;
grant select on public.integration_jobs to authenticated;
grant all on public.integration_jobs to service_role;
drop trigger if exists trg_integration_jobs_updated on public.integration_jobs;
create trigger trg_integration_jobs_updated before update on public.integration_jobs
for each row execute function public.set_updated_at();

create or replace function app.enqueue_delivery_integration_job()
returns trigger language plpgsql security definer set search_path=''
as $$
declare _connection uuid;
begin
  if new.fulfillment_type<>'delivery' or coalesce(new.total,0)<=0 then return new; end if;
  if tg_op='UPDATE' and coalesce(old.total,0)>0 and old.delivery_address is not distinct from new.delivery_address then return new; end if;
  select id into _connection from public.integration_connections
  where restaurant_id=new.restaurant_id and category='delivery' and status<>'disabled'
  order by case when status='healthy' then 0 when status='configured' then 1 else 2 end,created_at
  limit 1;
  if _connection is null then return new; end if;
  insert into public.integration_jobs(restaurant_id,connection_id,category,action,external_key,payload)
  values(new.restaurant_id,_connection,'delivery','create_order','delivery:order:'||new.id::text,jsonb_build_object('order_id',new.id))
  on conflict(connection_id,external_key) do nothing;
  update public.orders set delivery_status=coalesce(delivery_status,'pending'),delivery_status_updated_at=now() where id=new.id;
  return new;
end;
$$;
drop trigger if exists trg_enqueue_delivery_integration_job on public.orders;
create trigger trg_enqueue_delivery_integration_job
after insert or update of total,delivery_address on public.orders
for each row execute function app.enqueue_delivery_integration_job();

create or replace function app.enqueue_accounting_payment_job()
returns trigger language plpgsql security definer set search_path=''
as $$
declare _connection uuid;
begin
  if new.status<>'completed' then return new; end if;
  select id into _connection from public.integration_connections
  where restaurant_id=new.restaurant_id and category='accounting' and status<>'disabled'
  order by case when status='healthy' then 0 when status='configured' then 1 else 2 end,created_at
  limit 1;
  if _connection is null then return new; end if;
  insert into public.integration_jobs(restaurant_id,connection_id,category,action,external_key,payload)
  values(new.restaurant_id,_connection,'accounting','post_payment','accounting:payment:'||new.id::text,jsonb_build_object('payment_id',new.id))
  on conflict(connection_id,external_key) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_enqueue_accounting_payment_job on public.payment_transactions;
create trigger trg_enqueue_accounting_payment_job
after insert on public.payment_transactions
for each row execute function app.enqueue_accounting_payment_job();

create or replace function app.enqueue_accounting_expense_job()
returns trigger language plpgsql security definer set search_path=''
as $$
declare _connection uuid;
begin
  select id into _connection from public.integration_connections
  where restaurant_id=new.restaurant_id and category='accounting' and status<>'disabled'
  order by case when status='healthy' then 0 when status='configured' then 1 else 2 end,created_at
  limit 1;
  if _connection is null then return new; end if;
  insert into public.integration_jobs(restaurant_id,connection_id,category,action,external_key,payload)
  values(new.restaurant_id,_connection,'accounting','post_expense','accounting:expense:'||new.id::text,jsonb_build_object('expense_id',new.id))
  on conflict(connection_id,external_key) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_enqueue_accounting_expense_job on public.erp_expenses;
create trigger trg_enqueue_accounting_expense_job
after insert on public.erp_expenses
for each row execute function app.enqueue_accounting_expense_job();

create or replace function public.retry_integration_job(_job_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare _j public.integration_jobs;
begin
  select * into _j from public.integration_jobs where id=_job_id for update;
  if _j.id is null then raise exception 'Integration job not found'; end if;
  if not(app.has_capability(_j.restaurant_id,'manage_restaurant') or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.integration_jobs set status='queued',attempt_count=0,next_attempt_at=now(),last_error=null,response_status=null,response_body=null where id=_job_id;
end;
$$;
revoke all on function public.retry_integration_job(uuid) from public,anon;
grant execute on function public.retry_integration_job(uuid) to authenticated;

create or replace function public.get_accounting_export(
  _restaurant_id uuid,_from date,_to date
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare _tz text; _start timestamptz; _finish timestamptz; _result jsonb;
begin
  if not(
    app.has_capability(_restaurant_id,'view_analytics')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.has_capability(_restaurant_id,'manage_payments')
    or app.is_super_admin()
  ) then raise exception 'Not authorized' using errcode='42501'; end if;
  if _to<_from or _to-_from>366 then raise exception 'Invalid export range'; end if;
  select coalesce(nullif(timezone,''),'UTC') into _tz from public.restaurants where id=_restaurant_id;
  if _tz is null then raise exception 'Restaurant not found'; end if;
  _start:=_from::timestamp at time zone _tz;
  _finish:=(_to+1)::timestamp at time zone _tz;

  select jsonb_build_object(
    'restaurant_id',_restaurant_id,'from',_from,'to',_to,'timezone',_tz,
    'transactions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',p.created_at,'entry_type',p.transaction_type,'payment_method',p.method,
        'reference',p.reference,'provider',p.provider,'provider_transaction_id',p.provider_transaction_id,
        'order_id',p.order_id,'order_number',o.order_number,'amount',p.amount,'tip_amount',p.tip_amount,
        'currency',o.currency,'tax_amount',o.tax_amount,'service_amount',o.service_amount,'delivery_amount',o.delivery_amount
      ) order by p.created_at)
      from public.payment_transactions p join public.orders o on o.id=p.order_id
      where p.restaurant_id=_restaurant_id and p.status='completed' and p.created_at>=_start and p.created_at<_finish
    ),'[]'::jsonb),
    'expenses',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',e.expense_date,'entry_type','expense','description',e.description,'category',e.category,
        'amount',e.amount,'reference',e.reference,'supplier_id',e.supplier_id,'source_type',e.source_type,'source_id',e.source_id
      ) order by e.expense_date,e.created_at)
      from public.erp_expenses e
      where e.restaurant_id=_restaurant_id and e.expense_date between _from and _to
    ),'[]'::jsonb)
  ) into _result;
  return _result;
end;
$$;
revoke all on function public.get_accounting_export(uuid,date,date) from public,anon;
grant execute on function public.get_accounting_export(uuid,date,date) to authenticated;

do $$
declare _secret text; _id uuid;
begin
  if not exists(select 1 from vault.decrypted_secrets where name='quickserve_integration_worker_secret') then
    _secret:=encode(extensions.gen_random_bytes(32),'hex');
    select vault.create_secret(_secret,'quickserve_integration_worker_secret','QuickServe integration worker authentication') into _id;
  end if;
end $$;

create or replace function public.verify_integration_worker_secret(_secret text)
returns boolean language sql security definer set search_path=''
as $$ select exists(select 1 from vault.decrypted_secrets where name='quickserve_integration_worker_secret' and decrypted_secret=coalesce(_secret,'')); $$;
revoke all on function public.verify_integration_worker_secret(text) from public,anon,authenticated;
grant execute on function public.verify_integration_worker_secret(text) to service_role;

notify pgrst,'reload schema';
commit;
