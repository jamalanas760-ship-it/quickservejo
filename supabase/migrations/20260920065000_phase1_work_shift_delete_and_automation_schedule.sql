-- QuickServe Phase 1 reliability: soft delete + editable scheduled automation
-- Production migration was applied to the connected Supabase project on 2026-09-20.

create extension if not exists pg_cron;

alter table public.work_tasks
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_staff_id uuid references public.staff(id) on delete set null;

alter table public.shifts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_staff_id uuid references public.staff(id) on delete set null;

create index if not exists work_tasks_active_scope_idx
  on public.work_tasks (restaurant_id, status, due_at)
  where deleted_at is null;

create index if not exists shifts_active_scope_idx
  on public.shifts (restaurant_id, shift_date desc, status)
  where deleted_at is null;

create or replace function public.archive_work_task(_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _restaurant_id uuid;
  _staff_id uuid;
begin
  select wt.restaurant_id into _restaurant_id
  from public.work_tasks wt
  where wt.id = _task_id and wt.deleted_at is null;

  if _restaurant_id is null then raise exception 'Work item not found'; end if;

  if not app.is_super_admin()
     and not exists (
       select 1 from public.staff s
       where s.restaurant_id = _restaurant_id
         and s.auth_user_id = (select auth.uid())
         and s.is_active
         and s.role::text = 'restaurant_admin'
     ) then
    raise exception 'Only the Restaurant Manager can delete work items';
  end if;

  _staff_id := app.current_staff_id(_restaurant_id);

  update public.work_tasks
  set deleted_at = now(), deleted_by_staff_id = _staff_id, updated_at = now()
  where id = _task_id and deleted_at is null;
end;
$$;

revoke all on function public.archive_work_task(uuid) from public, anon;
grant execute on function public.archive_work_task(uuid) to authenticated, service_role;

create or replace function public.archive_shift(_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _restaurant_id uuid;
  _staff_id uuid;
begin
  select sh.restaurant_id into _restaurant_id
  from public.shifts sh
  where sh.id = _shift_id and sh.deleted_at is null;

  if _restaurant_id is null then raise exception 'Shift not found'; end if;

  if not app.is_super_admin()
     and not exists (
       select 1 from public.staff s
       where s.restaurant_id = _restaurant_id
         and s.auth_user_id = (select auth.uid())
         and s.is_active
         and s.role::text = 'restaurant_admin'
     ) then
    raise exception 'Only the Restaurant Manager can delete shifts';
  end if;

  _staff_id := app.current_staff_id(_restaurant_id);

  update public.shifts
  set deleted_at = now(), deleted_by_staff_id = _staff_id, updated_at = now()
  where id = _shift_id and deleted_at is null;
end;
$$;

revoke all on function public.archive_shift(uuid) from public, anon;
grant execute on function public.archive_shift(uuid) to authenticated, service_role;

alter table public.operational_rules
  add column if not exists schedule_time time,
  add column if not exists schedule_recurrence text,
  add column if not exists schedule_timezone text not null default 'Asia/Amman',
  add column if not exists last_run_at timestamptz,
  add column if not exists next_run_at timestamptz,
  add column if not exists last_status text,
  add column if not exists last_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operational_rules_schedule_recurrence_check') then
    alter table public.operational_rules
      add constraint operational_rules_schedule_recurrence_check
      check (schedule_recurrence is null or schedule_recurrence in ('daily','weekly'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'operational_rules_last_status_check') then
    alter table public.operational_rules
      add constraint operational_rules_last_status_check
      check (last_status is null or last_status in ('success','failed','never'));
  end if;
end $$;

create index if not exists operational_rules_due_schedule_idx
  on public.operational_rules (next_run_at)
  where enabled and schedule_time is not null and next_run_at is not null;

create or replace function app.compute_next_rule_run(
  _schedule_time time,
  _recurrence text,
  _timezone text,
  _after timestamptz
) returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  _tz text := coalesce(nullif(_timezone,''), 'Asia/Amman');
  _local_date date;
  _candidate timestamptz;
begin
  if _schedule_time is null or _recurrence is null then return null; end if;
  _local_date := (_after at time zone _tz)::date;
  _candidate := (_local_date + _schedule_time) at time zone _tz;

  if _candidate <= _after then
    if _recurrence = 'weekly' then _candidate := _candidate + interval '7 days';
    else _candidate := _candidate + interval '1 day';
    end if;
  end if;

  return _candidate;
end;
$$;

create or replace function app.prepare_operational_rule_schedule()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.schedule_time is null then
    new.schedule_recurrence := null;
    new.next_run_at := null;
  else
    new.schedule_recurrence := coalesce(new.schedule_recurrence, 'daily');
    if tg_op = 'INSERT'
       or new.schedule_time is distinct from old.schedule_time
       or new.schedule_recurrence is distinct from old.schedule_recurrence
       or new.schedule_timezone is distinct from old.schedule_timezone
       or new.next_run_at is null then
      new.next_run_at := app.compute_next_rule_run(new.schedule_time, new.schedule_recurrence, new.schedule_timezone, now());
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists operational_rules_prepare_schedule on public.operational_rules;
create trigger operational_rules_prepare_schedule
before insert or update of schedule_time, schedule_recurrence, schedule_timezone
on public.operational_rules
for each row execute function app.prepare_operational_rule_schedule();

create or replace function app.execute_operational_rule(_rule_id uuid, _manual boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _rule public.operational_rules%rowtype;
  _task_id uuid;
begin
  select * into _rule from public.operational_rules where id = _rule_id;
  if _rule.id is null then raise exception 'Automation rule not found'; end if;
  if not _manual and not _rule.enabled then return null; end if;

  insert into public.work_tasks (
    restaurant_id, title, description, category, priority, status,
    assigned_role, source_type, source_id, source_rule_id, due_at,
    requires_approval, approval_role, metadata
  )
  values (
    _rule.restaurant_id,
    _rule.name,
    coalesce(_rule.rule_config->>'description', 'Automation rule generated this work item.'),
    case when _rule.requires_approval then 'approval' else 'task' end,
    _rule.priority,
    'open',
    coalesce(_rule.target_role, 'manager'),
    'automation_run',
    gen_random_uuid(),
    _rule.id,
    now() + make_interval(mins => _rule.due_minutes),
    _rule.requires_approval,
    _rule.approval_role,
    jsonb_build_object('automation_rule_id', _rule.id, 'event_type', _rule.event_type, 'manual_run', _manual, 'scheduled_run', not _manual)
  )
  returning id into _task_id;

  update public.operational_rules
  set last_run_at = now(),
      last_status = 'success',
      last_error = null,
      next_run_at = case when schedule_time is null then null else app.compute_next_rule_run(schedule_time, schedule_recurrence, schedule_timezone, now()) end,
      updated_at = now()
  where id = _rule.id;

  return _task_id;
exception
  when others then
    update public.operational_rules
    set last_run_at = now(),
        last_status = 'failed',
        last_error = left(sqlerrm, 1000),
        next_run_at = case when schedule_time is null then null else app.compute_next_rule_run(schedule_time, schedule_recurrence, schedule_timezone, now()) end,
        updated_at = now()
    where id = _rule_id;
    raise;
end;
$$;

revoke all on function app.execute_operational_rule(uuid, boolean) from public, anon, authenticated;
grant execute on function app.execute_operational_rule(uuid, boolean) to service_role;

create or replace function public.run_operational_rule(_rule_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _restaurant_id uuid;
begin
  select restaurant_id into _restaurant_id from public.operational_rules where id = _rule_id;
  if _restaurant_id is null then raise exception 'Automation rule not found'; end if;

  if not app.has_capability(_restaurant_id, 'manage_work') and not app.is_super_admin() then
    raise exception 'Not authorized to run automation rules';
  end if;

  return app.execute_operational_rule(_rule_id, true);
end;
$$;

revoke all on function public.run_operational_rule(uuid) from public, anon;
grant execute on function public.run_operational_rule(uuid) to authenticated, service_role;

create or replace function public.run_due_operational_rules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _rule record;
  _count integer := 0;
begin
  for _rule in
    select id from public.operational_rules
    where enabled and schedule_time is not null and next_run_at is not null and next_run_at <= now()
    order by next_run_at
    for update skip locked
  loop
    begin
      perform app.execute_operational_rule(_rule.id, false);
      _count := _count + 1;
    exception when others then
      null;
    end;
  end loop;
  return _count;
end;
$$;

revoke all on function public.run_due_operational_rules() from public, anon, authenticated;
grant execute on function public.run_due_operational_rules() to service_role;

do $$
declare _job_id bigint;
begin
  select jobid into _job_id from cron.job where jobname = 'quickserve-operational-rules-minute' limit 1;
  if _job_id is not null then perform cron.unschedule(_job_id); end if;
  perform cron.schedule('quickserve-operational-rules-minute', '* * * * *', 'select public.run_due_operational_rules();');
end $$;

update public.operational_rules
set last_status = coalesce(last_status, 'never'),
    next_run_at = case
      when schedule_time is null then null
      else app.compute_next_rule_run(schedule_time, coalesce(schedule_recurrence,'daily'), schedule_timezone, now())
    end
where last_status is null or (schedule_time is not null and next_run_at is null);
