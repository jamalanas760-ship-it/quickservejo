begin;

create table if not exists public.table_service_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text,
  status text not null default 'active' check (status in ('active','closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists table_service_groups_restaurant_idx
  on public.table_service_groups(restaurant_id,status,created_at desc);

alter table public.table_service_groups enable row level security;
drop policy if exists table_service_groups_read on public.table_service_groups;
create policy table_service_groups_read
on public.table_service_groups
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_tables')
  or app.has_capability(restaurant_id,'view_orders')
  or app.has_capability(restaurant_id,'manage_restaurant')
  or app.is_super_admin()
);

revoke all on public.table_service_groups from public,anon,authenticated;
grant select on public.table_service_groups to authenticated;
grant all on public.table_service_groups to service_role;

alter table public.restaurant_tables
  add column if not exists service_group_id uuid references public.table_service_groups(id) on delete set null;

create index if not exists restaurant_tables_service_group_idx
  on public.restaurant_tables(restaurant_id,service_group_id)
  where service_group_id is not null;

create or replace function public.merge_service_tables(
  _restaurant_id uuid,_table_ids uuid[],_label text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare _ids uuid[]; _count int; _group_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not (app.has_capability(_restaurant_id,'manage_tables') or app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Not authorized' using errcode='42501'; end if;

  select array_agg(distinct value order by value) into _ids
  from unnest(coalesce(_table_ids,array[]::uuid[])) as t(value) where value is not null;
  if coalesce(array_length(_ids,1),0)<2 then raise exception 'Choose at least two tables to merge'; end if;

  perform 1 from public.restaurant_tables rt where rt.id=any(_ids) order by rt.id for update;
  select count(*)::int into _count
  from public.restaurant_tables rt
  where rt.id=any(_ids) and rt.restaurant_id=_restaurant_id and rt.is_active and rt.service_status<>'out_of_service';
  if _count<>array_length(_ids,1) then raise exception 'Every selected table must belong to this restaurant and be active'; end if;
  if exists(select 1 from public.restaurant_tables rt where rt.id=any(_ids) and rt.service_group_id is not null)
    then raise exception 'Split existing table groups before creating a new merge'; end if;

  insert into public.table_service_groups(restaurant_id,label,created_by)
  values(_restaurant_id,nullif(left(trim(coalesce(_label,'')),120),''),auth.uid())
  returning id into _group_id;

  update public.restaurant_tables
  set service_group_id=_group_id,
      service_status=case when service_status='free' then 'active' else service_status end,
      status_updated_at=now(),
      status_updated_by=auth.uid()
  where id=any(_ids) and restaurant_id=_restaurant_id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'tables_merged','table_service_group',_group_id,
    jsonb_build_object('table_ids',to_jsonb(_ids),'label',nullif(left(trim(coalesce(_label,'')),120),'')));
  return _group_id;
end;
$$;
revoke all on function public.merge_service_tables(uuid,uuid[],text) from public,anon;
grant execute on function public.merge_service_tables(uuid,uuid[],text) to authenticated;

create or replace function public.split_service_tables(_group_id uuid,_table_id uuid default null)
returns integer
language plpgsql security definer set search_path=''
as $$
declare _group public.table_service_groups; _affected int:=0; _remaining int:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into _group from public.table_service_groups where id=_group_id for update;
  if _group.id is null then raise exception 'Table group not found'; end if;
  if not (app.has_capability(_group.restaurant_id,'manage_tables') or app.has_capability(_group.restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Not authorized' using errcode='42501'; end if;
  if _group.status<>'active' then raise exception 'Table group is already closed'; end if;

  if _table_id is null then
    update public.restaurant_tables
    set service_group_id=null,status_updated_at=now(),status_updated_by=auth.uid()
    where restaurant_id=_group.restaurant_id and service_group_id=_group_id;
    get diagnostics _affected=row_count;
  else
    update public.restaurant_tables
    set service_group_id=null,status_updated_at=now(),status_updated_by=auth.uid()
    where id=_table_id and restaurant_id=_group.restaurant_id and service_group_id=_group_id;
    get diagnostics _affected=row_count;
    if _affected=0 then raise exception 'Table is not part of this group'; end if;
  end if;

  select count(*)::int into _remaining
  from public.restaurant_tables where restaurant_id=_group.restaurant_id and service_group_id=_group_id;

  if _remaining<2 then
    update public.restaurant_tables
    set service_group_id=null,status_updated_at=now(),status_updated_by=auth.uid()
    where restaurant_id=_group.restaurant_id and service_group_id=_group_id;
    update public.table_service_groups set status='closed',closed_at=now() where id=_group_id;
    _affected:=_affected+_remaining;
  end if;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_group.restaurant_id,auth.uid(),'tables_split','table_service_group',_group_id,
    jsonb_build_object('table_id',_table_id,'affected',_affected));
  return _affected;
end;
$$;
revoke all on function public.split_service_tables(uuid,uuid) from public,anon;
grant execute on function public.split_service_tables(uuid,uuid) to authenticated;

create or replace function public.get_table_service_groups(_restaurant_id uuid)
returns table(id uuid,label text,status text,table_ids uuid[],table_numbers text[],combined_capacity integer,created_at timestamptz)
language sql security definer set search_path=''
as $$
  select g.id,g.label,g.status,
    array_agg(t.id order by t.table_number),
    array_agg(t.table_number order by t.table_number),
    coalesce(sum(t.capacity),0)::int,
    g.created_at
  from public.table_service_groups g
  join public.restaurant_tables t on t.service_group_id=g.id and t.restaurant_id=g.restaurant_id
  where g.restaurant_id=_restaurant_id and g.status='active'
    and (app.has_capability(_restaurant_id,'manage_tables') or app.has_capability(_restaurant_id,'view_orders')
      or app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin())
  group by g.id,g.label,g.status,g.created_at
  having count(*)>=2
  order by g.created_at desc;
$$;
revoke all on function public.get_table_service_groups(uuid) from public,anon;
grant execute on function public.get_table_service_groups(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
