begin;
CREATE OR REPLACE FUNCTION app.has_capability(_restaurant_id uuid, _capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
           when 'hr' then _capability = any(array['view_work','create_work','manage_shifts','manage_staff'])
           when 'accountant' then _capability = any(array['view_work','create_work','view_erp','manage_finance','view_analytics','view_order_prices'])
           else false
         end)
);
$function$;

create table public.workforce_holidays (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 holiday_date date not null check (holiday_date between date '2000-01-01' and date '2200-12-31'),
 annual boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid,
 unique (restaurant_id, holiday_date, name)
);
alter table public.workforce_holidays enable row level security;
revoke all on public.workforce_holidays from public, anon;
grant select, insert, update, delete on public.workforce_holidays to authenticated;
create index workforce_holidays_restaurant_date_idx on public.workforce_holidays(restaurant_id, holiday_date);
create policy holidays_read on public.workforce_holidays for select to authenticated
 using (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'view_work'));
create policy holidays_insert on public.workforce_holidays for insert to authenticated
 with check (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts'));
create policy holidays_update on public.workforce_holidays for update to authenticated
 using (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts'))
 with check (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts'));
create policy holidays_delete on public.workforce_holidays for delete to authenticated
 using (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts'));
create function app.workforce_holiday_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.id is distinct from old.id or new.restaurant_id is distinct from old.restaurant_id then
     raise exception 'Holiday workspace cannot change';
   end if;
   new.created_at:=old.created_at;
   new.created_by:=old.created_by;
 else
   new.created_at:=now();
   new.created_by:=(select auth.uid());
 end if;
 new.name:=btrim(new.name);
 new.updated_at:=now();
 return new;
end $$;
revoke all on function app.workforce_holiday_guard() from public, anon;
grant execute on function app.workforce_holiday_guard() to authenticated;
create trigger workforce_holiday_guard before insert or update on public.workforce_holidays
 for each row execute function app.workforce_holiday_guard();

commit;
