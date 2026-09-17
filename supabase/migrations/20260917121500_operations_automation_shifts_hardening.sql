-- QuickServe Phase 2 hardening and production parity.
-- This follows the initial Phase 2 migration and brings clean installs to the same
-- final state already applied to the connected production Supabase project.

create index if not exists work_tasks_source_rule_idx
  on public.work_tasks(source_rule_id)
  where source_rule_id is not null;

create index if not exists shifts_opened_by_idx
  on public.shifts(opened_by_staff_id)
  where opened_by_staff_id is not null;
create index if not exists shifts_closed_by_idx
  on public.shifts(closed_by_staff_id)
  where closed_by_staff_id is not null;
create index if not exists shift_handovers_from_staff_idx
  on public.shift_handovers(from_staff_id)
  where from_staff_id is not null;
create index if not exists shift_handovers_ack_staff_idx
  on public.shift_handovers(acknowledged_by_staff_id)
  where acknowledged_by_staff_id is not null;

-- Avoid duplicate permissive SELECT paths from FOR ALL write policies.
drop policy if exists operational_rules_write on public.operational_rules;
drop policy if exists operational_rules_insert on public.operational_rules;
drop policy if exists operational_rules_update on public.operational_rules;
drop policy if exists operational_rules_delete on public.operational_rules;
create policy operational_rules_insert on public.operational_rules for insert to authenticated
  with check (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'));
create policy operational_rules_update on public.operational_rules for update to authenticated
  using (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'))
  with check (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'));
create policy operational_rules_delete on public.operational_rules for delete to authenticated
  using (app.has_capability(restaurant_id, 'manage_work') or app.has_capability(restaurant_id, 'manage_shifts'));

-- Keep internal event helpers trigger-owned rather than callable from browser clients.
revoke all on function app.create_tasks_from_event(uuid,text,text,uuid,text,text,jsonb) from public;
revoke all on function app.create_tasks_from_event(uuid,text,text,uuid,text,text,jsonb) from anon;
revoke all on function app.create_tasks_from_event(uuid,text,text,uuid,text,text,jsonb) from authenticated;

-- Seed useful defaults for all current tenants.
insert into public.operational_rules
  (restaurant_id, name, event_type, enabled, priority, target_role, due_minutes, requires_approval, approval_role, rule_config)
select r.id, 'Waiter call response', 'waiter_call_created', true, 'high', 'waiter', 3, false, null, '{"system_default":true}'::jsonb
from public.restaurants r
on conflict (restaurant_id, event_type, name) do nothing;

insert into public.operational_rules
  (restaurant_id, name, event_type, enabled, priority, target_role, due_minutes, requires_approval, approval_role, rule_config)
select r.id, 'Shift opening checklist', 'shift_opening', false, 'normal', 'manager', 10, false, null, '{"system_default":true}'::jsonb
from public.restaurants r
on conflict (restaurant_id, event_type, name) do nothing;

insert into public.operational_rules
  (restaurant_id, name, event_type, enabled, priority, target_role, due_minutes, requires_approval, approval_role, rule_config)
select r.id, 'Shift closing checklist', 'shift_closing', false, 'normal', 'manager', 15, false, null, '{"system_default":true}'::jsonb
from public.restaurants r
on conflict (restaurant_id, event_type, name) do nothing;

create or replace function app.seed_operational_rules_for_restaurant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.operational_rules
    (restaurant_id, name, event_type, enabled, priority, target_role, due_minutes, requires_approval, rule_config)
  values
    (new.id, 'Waiter call response', 'waiter_call_created', true, 'high', 'waiter', 3, false, '{"system_default":true}'::jsonb),
    (new.id, 'Shift opening checklist', 'shift_opening', false, 'normal', 'manager', 10, false, '{"system_default":true}'::jsonb),
    (new.id, 'Shift closing checklist', 'shift_closing', false, 'normal', 'manager', 15, false, '{"system_default":true}'::jsonb)
  on conflict (restaurant_id, event_type, name) do nothing;
  return new;
end;
$$;

revoke all on function app.seed_operational_rules_for_restaurant() from public;
revoke all on function app.seed_operational_rules_for_restaurant() from anon;
revoke all on function app.seed_operational_rules_for_restaurant() from authenticated;

drop trigger if exists seed_operational_rules_after_restaurant on public.restaurants;
create trigger seed_operational_rules_after_restaurant
after insert on public.restaurants
for each row execute function app.seed_operational_rules_for_restaurant();

-- Keep updated_at maintained consistently.
drop trigger if exists operational_rules_set_updated_at on public.operational_rules;
create trigger operational_rules_set_updated_at
before update on public.operational_rules
for each row execute function public.set_updated_at();

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at
before update on public.shifts
for each row execute function public.set_updated_at();

-- Shift lifecycle itself emits opening/closing work. The client must not duplicate it.
create or replace function app.on_shift_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status is distinct from 'open') then
    perform app.create_tasks_from_event(
      new.restaurant_id, 'shift_opening', 'shift_opening', new.id,
      new.name || ' opening checklist', new.notes,
      jsonb_build_object('shift_id', new.id, 'shift_date', new.shift_date, 'shift_name', new.name)
    );
  end if;

  if new.status = 'closed' and (tg_op = 'INSERT' or old.status is distinct from 'closed') then
    perform app.create_tasks_from_event(
      new.restaurant_id, 'shift_closing', 'shift_closing', new.id,
      new.name || ' closing checklist', new.notes,
      jsonb_build_object('shift_id', new.id, 'shift_date', new.shift_date, 'shift_name', new.name)
    );
  end if;

  return new;
end;
$$;

revoke all on function app.on_shift_status_change() from public;
revoke all on function app.on_shift_status_change() from anon;
revoke all on function app.on_shift_status_change() from authenticated;

drop trigger if exists shift_status_automation on public.shifts;
create trigger shift_status_automation
after insert or update of status on public.shifts
for each row execute function app.on_shift_status_change();
