-- QuickServe Phase 2: event-driven operations, shifts and handover.
-- This migration is intentionally tenant-scoped and capability-aware.

create table if not exists public.operational_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  event_type text not null check (event_type in ('waiter_call_created','order_stuck','low_stock','shift_opening','shift_closing','manual_exception')),
  enabled boolean not null default true,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  target_role text,
  due_minutes integer not null default 15 check (due_minutes between 0 and 1440),
  requires_approval boolean not null default false,
  approval_role text,
  rule_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_rules_unique_name unique (restaurant_id, event_type, name)
);

create index if not exists operational_rules_event_idx
  on public.operational_rules(restaurant_id, event_type)
  where enabled;

alter table public.work_tasks
  add column if not exists source_rule_id uuid references public.operational_rules(id) on delete set null;

create unique index if not exists work_tasks_source_rule_unique
  on public.work_tasks(restaurant_id, source_type, source_id, source_rule_id)
  where source_id is not null and source_rule_id is not null;
create index if not exists work_tasks_source_idx
  on public.work_tasks(restaurant_id, source_type, source_id)
  where source_id is not null;

alter table public.operational_rules enable row level security;
grant select, insert, update, delete on public.operational_rules to authenticated;

drop policy if exists operational_rules_select on public.operational_rules;
create policy operational_rules_select on public.operational_rules for select to authenticated
  using (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'));

drop policy if exists operational_rules_insert on public.operational_rules;
create policy operational_rules_insert on public.operational_rules for insert to authenticated
  with check (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'));

drop policy if exists operational_rules_update on public.operational_rules;
create policy operational_rules_update on public.operational_rules for update to authenticated
  using (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'))
  with check (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'));

drop policy if exists operational_rules_delete on public.operational_rules;
create policy operational_rules_delete on public.operational_rules for delete to authenticated
  using (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'));

create or replace function app.create_tasks_from_event(
  _restaurant_id uuid,
  _event_type text,
  _source_type text,
  _source_id uuid,
  _title text,
  _description text default null,
  _metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _rule record;
  _created integer := 0;
begin
  if _restaurant_id is null or _event_type is null then return 0; end if;

  for _rule in
    select r.*
    from public.operational_rules r
    where r.restaurant_id = _restaurant_id
      and r.event_type = _event_type
      and r.enabled
    order by case r.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, r.created_at
  loop
    insert into public.work_tasks (
      restaurant_id, title, description, category, priority, status,
      assigned_role, source_type, source_id, source_rule_id, due_at,
      requires_approval, approval_role, metadata
    ) values (
      _restaurant_id,
      left(coalesce(nullif(trim(_title), ''), _rule.name), 160),
      _description,
      case when _rule.requires_approval then 'approval' when _event_type in ('order_stuck','low_stock') then 'alert' else 'task' end,
      _rule.priority,
      'open',
      coalesce(nullif(_rule.target_role, ''), 'manager'),
      _source_type,
      _source_id,
      _rule.id,
      now() + make_interval(mins => _rule.due_minutes),
      _rule.requires_approval,
      _rule.approval_role,
      coalesce(_metadata, '{}'::jsonb) || jsonb_build_object('rule_id', _rule.id, 'event_type', _event_type, 'automated', true)
    ) on conflict do nothing;
    if found then _created := _created + 1; end if;
  end loop;
  return _created;
end;
$$;

revoke all on function app.create_tasks_from_event(uuid,text,text,uuid,text,text,jsonb) from public;
revoke all on function app.create_tasks_from_event(uuid,text,text,uuid,text,text,jsonb) from anon;
revoke all on function app.create_tasks_from_event(uuid,text,text,uuid,text,text,jsonb) from authenticated;

create or replace function app.on_waiter_call_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare _table_number text;
begin
  select t.table_number into _table_number
  from public.restaurant_tables t where t.id = new.table_id;

  perform app.create_tasks_from_event(
    new.restaurant_id, 'waiter_call_created', 'waiter_call', new.id,
    'Table ' || coalesce(_table_number, '?') || ' needs service',
    new.note,
    jsonb_build_object('table_id', new.table_id, 'table_number', _table_number, 'waiter_call_status', new.status::text)
  );
  return new;
end;
$$;

revoke all on function app.on_waiter_call_created() from public;
revoke all on function app.on_waiter_call_created() from anon;
revoke all on function app.on_waiter_call_created() from authenticated;

drop trigger if exists waiter_call_automation on public.waiter_calls;
create trigger waiter_call_automation after insert on public.waiter_calls
for each row execute function app.on_waiter_call_created();

-- ---------------------------------------------------------------- shifts
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  shift_date date not null,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_opened_at timestamptz,
  actual_closed_at timestamptz,
  status text not null default 'planned' check (status in ('planned','open','closed')),
  opened_by_staff_id uuid references public.staff(id) on delete set null,
  closed_by_staff_id uuid references public.staff(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  role_snapshot text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','present','late','absent','released')),
  notes text,
  created_at timestamptz not null default now(),
  constraint shift_assignments_unique unique (shift_id, staff_id)
);

create table if not exists public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete set null,
  from_staff_id uuid references public.staff(id) on delete set null,
  to_staff_id uuid references public.staff(id) on delete set null,
  target_role text,
  summary text not null check (char_length(trim(summary)) between 1 and 4000),
  unresolved_items text,
  cash_note text,
  inventory_note text,
  acknowledged_at timestamptz,
  acknowledged_by_staff_id uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shifts_restaurant_date_idx on public.shifts(restaurant_id, shift_date desc, status);
create index if not exists shifts_open_idx on public.shifts(restaurant_id, status) where status = 'open';
create index if not exists shift_assignments_shift_idx on public.shift_assignments(shift_id);
create index if not exists shift_assignments_staff_idx on public.shift_assignments(restaurant_id, staff_id, status);
create index if not exists shift_handovers_restaurant_idx on public.shift_handovers(restaurant_id, created_at desc);
create index if not exists shift_handovers_shift_idx on public.shift_handovers(shift_id);
create index if not exists shift_handovers_to_staff_idx on public.shift_handovers(to_staff_id) where to_staff_id is not null;

alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.shift_handovers enable row level security;

grant select, insert, update, delete on public.shifts to authenticated;
grant select, insert, update, delete on public.shift_assignments to authenticated;
grant select, insert, update, delete on public.shift_handovers to authenticated;

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select to authenticated using (
  app.has_capability(restaurant_id, 'manage_shifts')
  or (app.has_restaurant_access(restaurant_id) and (
    status = 'open'
    or exists (
      select 1 from public.shift_assignments sa
      join public.staff s on s.id = sa.staff_id
      where sa.shift_id = shifts.id
        and sa.restaurant_id = shifts.restaurant_id
        and s.auth_user_id = (select auth.uid()) and s.is_active
    )
  ))
);

drop policy if exists shifts_insert on public.shifts;
create policy shifts_insert on public.shifts for insert to authenticated
  with check (app.has_capability(restaurant_id, 'manage_shifts'));
drop policy if exists shifts_update on public.shifts;
create policy shifts_update on public.shifts for update to authenticated
  using (app.has_capability(restaurant_id, 'manage_shifts'))
  with check (app.has_capability(restaurant_id, 'manage_shifts'));
drop policy if exists shifts_delete on public.shifts;
create policy shifts_delete on public.shifts for delete to authenticated
  using (app.has_capability(restaurant_id, 'manage_shifts'));

drop policy if exists shift_assignments_select on public.shift_assignments;
create policy shift_assignments_select on public.shift_assignments for select to authenticated using (
  app.has_capability(restaurant_id, 'manage_shifts')
  or staff_id in (
    select s.id from public.staff s
    where s.auth_user_id = (select auth.uid()) and s.is_active
      and s.restaurant_id = shift_assignments.restaurant_id
  )
);
drop policy if exists shift_assignments_insert on public.shift_assignments;
create policy shift_assignments_insert on public.shift_assignments for insert to authenticated
  with check (app.has_capability(restaurant_id, 'manage_shifts'));
drop policy if exists shift_assignments_update on public.shift_assignments;
create policy shift_assignments_update on public.shift_assignments for update to authenticated
  using (app.has_capability(restaurant_id, 'manage_shifts'))
  with check (app.has_capability(restaurant_id, 'manage_shifts'));
drop policy if exists shift_assignments_delete on public.shift_assignments;
create policy shift_assignments_delete on public.shift_assignments for delete to authenticated
  using (app.has_capability(restaurant_id, 'manage_shifts'));

drop policy if exists shift_handovers_select on public.shift_handovers;
create policy shift_handovers_select on public.shift_handovers for select to authenticated using (
  app.has_capability(restaurant_id, 'manage_shifts')
  or from_staff_id in (
    select s.id from public.staff s where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = shift_handovers.restaurant_id
  )
  or to_staff_id in (
    select s.id from public.staff s where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = shift_handovers.restaurant_id
  )
  or target_role in (
    select s.role::text from public.staff s where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = shift_handovers.restaurant_id
  )
);

drop policy if exists shift_handovers_insert on public.shift_handovers;
create policy shift_handovers_insert on public.shift_handovers for insert to authenticated with check (
  app.has_restaurant_access(restaurant_id)
  and app.has_capability(restaurant_id, 'view_work')
  and (
    app.has_capability(restaurant_id, 'manage_shifts')
    or from_staff_id in (
      select s.id from public.staff s where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = shift_handovers.restaurant_id
    )
  )
);

drop policy if exists shift_handovers_update on public.shift_handovers;
create policy shift_handovers_update on public.shift_handovers for update to authenticated using (
  app.has_capability(restaurant_id, 'manage_shifts')
  or to_staff_id in (
    select s.id from public.staff s where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = shift_handovers.restaurant_id
  )
  or target_role in (
    select s.role::text from public.staff s where s.auth_user_id = (select auth.uid()) and s.is_active and s.restaurant_id = shift_handovers.restaurant_id
  )
) with check (app.has_restaurant_access(restaurant_id));

drop policy if exists shift_handovers_delete on public.shift_handovers;
create policy shift_handovers_delete on public.shift_handovers for delete to authenticated
  using (app.has_capability(restaurant_id, 'manage_shifts'));
