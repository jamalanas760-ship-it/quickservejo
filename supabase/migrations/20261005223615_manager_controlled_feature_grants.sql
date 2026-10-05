-- Role defaults remain unchanged. Explicit grants/revocations are tenant scoped.
create or replace function app.has_capability(_restaurant_id uuid, _capability text)
returns boolean language sql stable security definer set search_path = '' as $$
select app.is_super_admin() or exists (
  select 1 from public.staff s
  where s.auth_user_id=(select auth.uid()) and s.is_active and s.restaurant_id=_restaurant_id
  and _capability = any(array['manage_restaurant','manage_menu','manage_tables','manage_staff','manage_appearance','view_analytics','view_orders','view_order_prices','update_order_status','manage_payments','handle_waiter_calls','view_work','create_work','manage_work','approve_work','view_erp','manage_inventory','manage_procurement','manage_finance','manage_shifts'])
  and coalesce(case when jsonb_typeof(s.permission_overrides -> _capability)='boolean'
    then (s.permission_overrides ->> _capability)::boolean else null end,
    case s.role::text
           when 'restaurant_admin' then _capability = any(array[
             'manage_restaurant','manage_menu','manage_tables','manage_staff','manage_appearance','view_analytics',
             'view_orders','view_order_prices','update_order_status','manage_payments','handle_waiter_calls',
             'view_work','create_work','manage_work','approve_work','view_erp','manage_inventory','manage_procurement','manage_finance','manage_shifts'
           ])
           when 'operations_manager' then _capability = any(array[
             'manage_menu','manage_tables','view_analytics','view_orders','view_order_prices','update_order_status','handle_waiter_calls',
             'view_work','create_work','manage_work','approve_work','view_erp','manage_inventory','manage_procurement','manage_shifts'
           ])
           when 'manager' then _capability = any(array[
             'manage_menu','manage_tables','view_analytics','view_orders','view_order_prices','update_order_status','handle_waiter_calls',
             'view_work','create_work','manage_work','approve_work','manage_shifts'
           ])
           when 'kitchen' then _capability = any(array['view_orders','update_order_status','view_work','create_work'])
           when 'waiter' then _capability = any(array['view_orders','view_order_prices','update_order_status','manage_tables','handle_waiter_calls','view_work','create_work'])
           when 'cashier' then _capability = any(array['view_orders','view_order_prices','manage_payments','view_work','create_work'])
           when 'host' then _capability = any(array['view_orders','manage_tables','handle_waiter_calls','view_work','create_work'])
           when 'inventory' then _capability = any(array['view_work','create_work','view_erp','manage_inventory'])
           when 'procurement' then _capability = any(array['view_work','create_work','view_erp','manage_procurement'])
           when 'hr' then _capability = any(array['view_work','create_work','manage_shifts'])
           when 'accountant' then _capability = any(array['view_work','create_work','view_erp','manage_finance','view_analytics','view_order_prices'])
           else false
         end)
);
$$;

-- Permission delegation is an account authority, never a delegable feature.
create or replace function app.can_grant_restaurant_permissions(_restaurant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
select app.is_super_admin() or exists(select 1 from public.staff s
  where s.auth_user_id=(select auth.uid()) and s.is_active and s.restaurant_id=_restaurant_id and s.role='restaurant_admin');
$$;
revoke all on function app.can_grant_restaurant_permissions(uuid) from public,anon;
grant execute on function app.can_grant_restaurant_permissions(uuid) to authenticated,service_role;

create or replace function app.guard_staff_permission_grants()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Service-backed administration has its own caller checks; direct clients use this guard.
  if (select auth.uid()) is null or app.is_super_admin() then return case when tg_op='DELETE' then old else new end; end if;
  if (tg_op<>'INSERT' and old.role='super_admin') or (tg_op<>'DELETE' and new.role='super_admin') then raise exception 'Only the Super Admin can change platform access' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='INSERT' then
    if not app.can_grant_restaurant_permissions(new.restaurant_id) then
      raise exception 'Only the Restaurant Manager can add accounts' using errcode='42501';
    end if;
  elsif new.permission_overrides is distinct from old.permission_overrides or new.role is distinct from old.role then
    if not app.can_grant_restaurant_permissions(old.restaurant_id) then
      raise exception 'Only the Restaurant Manager can change roles and permissions' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.guard_staff_permission_grants() from public,anon,authenticated;
drop trigger if exists trg_guard_staff_permission_grants on public.staff;
create trigger trg_guard_staff_permission_grants before insert or update or delete on public.staff for each row execute function app.guard_staff_permission_grants();

-- General restaurant settings follow the explicit feature switch, not the job title.
create or replace function app.can_manage_restaurant(_restaurant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
select app.has_capability(_restaurant_id,'manage_restaurant');
$$;

-- Menu and branding publishing remain scoped to the delegated feature.
create or replace function app.can_manage_menu_design(_restaurant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
select app.has_capability(_restaurant_id,'manage_appearance') or app.has_capability(_restaurant_id,'manage_menu') or app.has_capability(_restaurant_id,'manage_restaurant');
$$;
revoke all on function app.can_manage_menu_design(uuid) from public,anon;
grant execute on function app.can_manage_menu_design(uuid) to authenticated,service_role;
alter policy menu_design_versions_read on public.menu_design_versions using(app.can_manage_menu_design(restaurant_id));
-- Preserve current function bodies and replace only their scoped authorization guard.
do $$
declare f record; definition text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('save_menu_design_draft','publish_menu_design_version','schedule_menu_design_version','cancel_scheduled_menu_design','rollback_menu_design_version','delete_menu_design_version','delete_all_menu_design_versions')
  loop
    definition:=pg_get_functiondef(f.oid);
    definition:=replace(definition,'app.can_manage_restaurant(', 'app.can_manage_menu_design(');
    execute definition;
  end loop;
end;
$$;
-- Keep document/link ownership predicates while allowing menu-specific editing.
do $$
declare p record; predicate text; check_predicate text;
begin
  for p in select * from pg_policies where schemaname='public' and tablename in ('menu_pdf_documents','menu_pdf_item_links') and cmd='ALL'
  loop
    predicate:=replace(p.qual,'app.can_manage_restaurant(restaurant_id)', '(app.has_capability(restaurant_id,''manage_menu'') or app.can_manage_restaurant(restaurant_id))');
    check_predicate:=replace(p.with_check,'app.can_manage_restaurant(restaurant_id)', '(app.has_capability(restaurant_id,''manage_menu'') or app.can_manage_restaurant(restaurant_id))');
    execute format('alter policy %I on public.%I using (%s) with check (%s)',p.policyname,p.tablename,predicate,check_predicate);
  end loop;
end;
$$;
