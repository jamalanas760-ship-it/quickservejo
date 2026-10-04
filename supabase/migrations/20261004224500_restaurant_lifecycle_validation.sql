begin;
create or replace function public.admin_restaurant_lifecycle(_restaurant_id uuid, _action text, _confirmation text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.restaurants%rowtype; begin
  if auth.uid() is null or not app.is_super_admin() then raise exception 'Super admin access required' using errcode='42501'; end if;
  if _action is null or _action not in ('archive','restore','delete') then raise exception 'Invalid restaurant action'; end if;
  select * into r from public.restaurants where id=_restaurant_id for update;
  if not found then raise exception 'Restaurant no longer exists'; end if;
  if _action='delete' and _confirmation is distinct from r.name then raise exception 'Type the exact restaurant name to confirm deletion'; end if;
  insert into public.audit_logs(restaurant_id,actor_user_id,actor_name,action,entity,entity_id,metadata)
  values(r.id,auth.uid(),(select name from public.staff where auth_user_id=auth.uid() and role='super_admin' and is_active limit 1),case _action when 'archive' then 'restaurant.archived' when 'restore' then 'restaurant.restored' else 'restaurant.deleted' end,'restaurants',r.id,jsonb_build_object('name',r.name,'slug',r.slug));
  if _action='delete' then
    insert into public.restaurant_media_cleanup(restaurant_id) values(r.id) on conflict do nothing;
    -- Platform owners must retain access when deleting their linked tenant.
    update public.staff set restaurant_id=null where restaurant_id=r.id and role='super_admin';
    delete from public.restaurants where id=r.id;
  elsif _action='archive' then
    update public.restaurants set archived_at=coalesce(archived_at,now()),is_active=false where id=r.id;
  else
    update public.restaurants set archived_at=null,is_active=true where id=r.id;
  end if;
end $$;
revoke all on function public.admin_restaurant_lifecycle(uuid,text,text) from public,anon;
grant execute on function public.admin_restaurant_lifecycle(uuid,text,text) to authenticated;
commit;
