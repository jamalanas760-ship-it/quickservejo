begin;
-- ERP records belong to the tenant, just like orders, menus and memberships.
do $$ declare c record; begin
  for c in select conrelid::regclass as rel, conname from pg_constraint where contype='f' and confrelid='public.restaurants'::regclass and conrelid in ('public.erp_suppliers'::regclass,'public.erp_inventory'::regclass,'public.erp_stock_movements'::regclass,'public.erp_expenses'::regclass) loop
    execute format('alter table %s drop constraint %I',c.rel,c.conname);
    execute format('alter table %s add constraint %I foreign key (restaurant_id) references public.restaurants(id) on delete cascade',c.rel,c.conname);
  end loop;
end $$;
create table public.restaurant_media_cleanup (
  restaurant_id uuid primary key,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.restaurant_media_cleanup enable row level security;
revoke all on public.restaurant_media_cleanup from anon, authenticated;
grant select,insert,update,delete on public.restaurant_media_cleanup to service_role;
-- No FK: the cleanup job must survive restaurant deletion.
create or replace function public.admin_restaurant_lifecycle(_restaurant_id uuid, _action text, _confirmation text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.restaurants%rowtype; begin
  if auth.uid() is null or not app.is_super_admin() then raise exception 'Super admin access required' using errcode='42501'; end if;
  if _action not in ('archive','restore','delete') then raise exception 'Invalid restaurant action'; end if;
  select * into r from public.restaurants where id=_restaurant_id for update;
  if not found then raise exception 'Restaurant no longer exists'; end if;
  if _action='delete' and _confirmation is distinct from r.name then raise exception 'Type the exact restaurant name to confirm deletion'; end if;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(r.id,auth.uid(),case _action when 'archive' then 'restaurant.archived' when 'restore' then 'restaurant.restored' else 'restaurant.deleted' end,'restaurants',r.id,jsonb_build_object('name',r.name,'slug',r.slug));
  if _action='delete' then
    insert into public.restaurant_media_cleanup(restaurant_id) values(r.id) on conflict do nothing;
    delete from public.restaurants where id=r.id;
  elsif _action='archive' then
    update public.restaurants set archived_at=coalesce(archived_at,now()),is_active=false where id=r.id;
  else
    update public.restaurants set archived_at=null,is_active=true where id=r.id;
  end if;
end $$;
revoke all on function public.admin_restaurant_lifecycle(uuid,text,text) from public,anon;
grant execute on function public.admin_restaurant_lifecycle(uuid,text,text) to authenticated;
-- Route permanent deletes through the audited transaction and durable cleanup queue.
drop policy if exists super_admin_delete_restaurants on public.restaurants;
create or replace function public.restaurant_cleanup_worker_authorized(_secret text) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets where name='quickserve_restaurant_cleanup_secret' and decrypted_secret=_secret);
$$;
create or replace function public.claim_restaurant_cleanup() returns setof public.restaurant_media_cleanup
language sql security definer set search_path='' as $$
 update public.restaurant_media_cleanup q set next_attempt_at=now()+interval '5 minutes',attempts=attempts+1
 where restaurant_id in (select restaurant_id from public.restaurant_media_cleanup where next_attempt_at<=now() order by created_at for update skip locked limit 3) returning q.*;
$$;
create or replace function public.restaurant_cleanup_objects(_restaurant_id uuid) returns table(bucket_id text,name text)
language sql security definer set search_path='' as $$
 select o.bucket_id,o.name from storage.objects o where o.bucket_id in ('restaurant-media','menu-pdfs') and o.name like _restaurant_id::text||'/%' order by o.bucket_id,o.name limit 500;
$$;
revoke all on function public.restaurant_cleanup_worker_authorized(text),public.claim_restaurant_cleanup(),public.restaurant_cleanup_objects(uuid) from public,anon,authenticated;
grant execute on function public.restaurant_cleanup_worker_authorized(text),public.claim_restaurant_cleanup(),public.restaurant_cleanup_objects(uuid) to service_role;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='quickserve_restaurant_cleanup_secret') then
   perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'quickserve_restaurant_cleanup_secret','Restaurant media cleanup worker');
 end if;
end $$;
select cron.schedule('quickserve-restaurant-media-cleanup','* * * * *', $cron$
 select net.http_post(url:='https://gtcmyaksmyiarokloyje.supabase.co/functions/v1/quickserve-restaurant-cleanup',headers:=jsonb_build_object('Content-Type','application/json','x-quickserve-worker',(select decrypted_secret from vault.decrypted_secrets where name='quickserve_restaurant_cleanup_secret')),body:='{}'::jsonb,timeout_milliseconds:=10000);
$cron$);
commit;
