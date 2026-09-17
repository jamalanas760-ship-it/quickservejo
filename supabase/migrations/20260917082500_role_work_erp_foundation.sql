-- QuickServe role-aware operations foundation: expanded job profiles + My Work engine.
-- Tenant isolation remains enforced by RLS and app.has_capability.

alter type public.app_role add value if not exists 'operations_manager';
alter type public.app_role add value if not exists 'host';
alter type public.app_role add value if not exists 'inventory';
alter type public.app_role add value if not exists 'procurement';
alter type public.app_role add value if not exists 'accountant';

create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text,
  category text not null default 'task' check (category in ('task','approval','handover','alert')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_approval','completed','cancelled')),
  assigned_staff_id uuid references public.staff(id) on delete set null,
  assigned_role text,
  created_by_staff_id uuid references public.staff(id) on delete set null,
  source_type text,
  source_id uuid,
  due_at timestamptz,
  requires_approval boolean not null default false,
  approval_role text,
  approved_by_staff_id uuid references public.staff(id) on delete set null,
  approved_at timestamptz,
  completion_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint work_tasks_assignment_required check (assigned_staff_id is not null or assigned_role is not null)
);

create table if not exists public.work_task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_staff_id uuid references public.staff(id) on delete set null,
  action text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists work_tasks_restaurant_status_idx on public.work_tasks(restaurant_id, status, created_at desc);
create index if not exists work_tasks_assigned_staff_idx on public.work_tasks(assigned_staff_id, status) where assigned_staff_id is not null;
create index if not exists work_tasks_assigned_role_idx on public.work_tasks(restaurant_id, assigned_role, status) where assigned_role is not null;
create index if not exists work_tasks_due_idx on public.work_tasks(restaurant_id, due_at) where due_at is not null and status not in ('completed','cancelled');
create index if not exists work_task_activity_task_idx on public.work_task_activity(task_id, created_at desc);

create or replace function app.has_capability(_restaurant_id uuid, _capability text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_super_admin() or exists (
    select 1
      from public.staff s
     where s.auth_user_id = (select auth.uid())
       and s.is_active
       and s.restaurant_id = _restaurant_id
       and (
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
           when 'accountant' then _capability = any(array['view_work','create_work','view_erp','manage_finance','view_analytics','view_order_prices'])
           else false
         end
       )
       and case
         when jsonb_typeof(s.permission_overrides -> _capability) = 'boolean'
           then (s.permission_overrides ->> _capability)::boolean
         else true
       end
  );
$$;

alter table public.work_tasks enable row level security;
alter table public.work_task_activity enable row level security;

-- A worker sees tasks specifically assigned to them/their role; managers see the restaurant work queue.
drop policy if exists work_tasks_select on public.work_tasks;
create policy work_tasks_select on public.work_tasks for select using (
  app.has_restaurant_access(restaurant_id)
  and (
    app.has_capability(restaurant_id, 'manage_work')
    or assigned_staff_id in (
      select s.id from public.staff s
       where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = work_tasks.restaurant_id
    )
    or assigned_role in (
      select s.role::text from public.staff s
       where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = work_tasks.restaurant_id
    )
    or created_by_staff_id in (
      select s.id from public.staff s
       where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = work_tasks.restaurant_id
    )
  )
);

drop policy if exists work_tasks_insert on public.work_tasks;
create policy work_tasks_insert on public.work_tasks for insert with check (
  app.has_restaurant_access(restaurant_id)
  and app.has_capability(restaurant_id, 'create_work')
  and (
    created_by_staff_id is null
    or created_by_staff_id in (
      select s.id from public.staff s
       where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = work_tasks.restaurant_id
    )
    or app.has_capability(restaurant_id, 'manage_work')
  )
);

drop policy if exists work_tasks_update on public.work_tasks;
create policy work_tasks_update on public.work_tasks for update using (
  app.has_capability(restaurant_id, 'manage_work')
  or assigned_staff_id in (
    select s.id from public.staff s
     where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = work_tasks.restaurant_id
  )
  or assigned_role in (
    select s.role::text from public.staff s
     where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = work_tasks.restaurant_id
  )
) with check (app.has_restaurant_access(restaurant_id));

drop policy if exists work_tasks_delete on public.work_tasks;
create policy work_tasks_delete on public.work_tasks for delete using (app.has_capability(restaurant_id, 'manage_work'));

drop policy if exists work_task_activity_select on public.work_task_activity;
create policy work_task_activity_select on public.work_task_activity for select using (
  exists (select 1 from public.work_tasks t where t.id = task_id)
);

drop policy if exists work_task_activity_insert on public.work_task_activity;
create policy work_task_activity_insert on public.work_task_activity for insert with check (
  app.has_restaurant_access(restaurant_id)
  and exists (select 1 from public.work_tasks t where t.id = task_id and t.restaurant_id = work_task_activity.restaurant_id)
  and (
    actor_staff_id is null
    or actor_staff_id in (
      select s.id from public.staff s where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = work_task_activity.restaurant_id
    )
  )
);

grant select, insert, update, delete on public.work_tasks to authenticated;
grant select, insert on public.work_task_activity to authenticated;
