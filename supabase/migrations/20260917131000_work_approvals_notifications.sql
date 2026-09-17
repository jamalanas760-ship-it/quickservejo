-- QuickServe Phase 3: first-class approvals, operational notifications and handover resolution.
-- Additive only. Keeps approval actions server-enforced and notifications tenant scoped.

alter table public.work_tasks
  add column if not exists approval_status text not null default 'not_required'
    check (approval_status in ('not_required','pending','approved','rejected','changes_requested')),
  add column if not exists approval_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists approval_note text,
  add column if not exists approval_action_at timestamptz;

update public.work_tasks
set approval_status = case
  when requires_approval and status = 'completed' then 'approved'
  when requires_approval then 'pending'
  else 'not_required'
end
where approval_status = 'not_required';

create index if not exists work_tasks_approval_queue_idx
  on public.work_tasks(restaurant_id, approval_status, created_at desc)
  where approval_status = 'pending';
create index if not exists work_tasks_approval_staff_idx
  on public.work_tasks(approval_staff_id)
  where approval_staff_id is not null;

alter table public.shift_handovers
  add column if not exists category text not null default 'general'
    check (category in ('stock','kitchen','service','cash','maintenance','customer','general')),
  add column if not exists priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  add column if not exists next_shift_id uuid references public.shifts(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by_staff_id uuid references public.staff(id) on delete set null;

create index if not exists shift_handovers_next_shift_idx
  on public.shift_handovers(next_shift_id)
  where next_shift_id is not null;
create index if not exists shift_handovers_resolved_by_idx
  on public.shift_handovers(resolved_by_staff_id)
  where resolved_by_staff_id is not null;
create index if not exists shift_handovers_open_idx
  on public.shift_handovers(restaurant_id, created_at desc)
  where resolved_at is null;

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete cascade,
  target_role text,
  kind text not null check (kind in ('task','approval','handover','shift','alert','system')),
  title text not null check (char_length(trim(title)) between 1 and 180),
  body text,
  source_type text,
  source_id uuid,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint in_app_notification_target check (staff_id is not null or target_role is not null)
);

create unique index if not exists in_app_notifications_dedupe_idx
  on public.in_app_notifications(restaurant_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists in_app_notifications_staff_idx
  on public.in_app_notifications(restaurant_id, staff_id, read_at, created_at desc)
  where staff_id is not null;
create index if not exists in_app_notifications_role_idx
  on public.in_app_notifications(restaurant_id, target_role, read_at, created_at desc)
  where target_role is not null;
create index if not exists in_app_notifications_source_idx
  on public.in_app_notifications(source_type, source_id)
  where source_id is not null;

alter table public.in_app_notifications enable row level security;
grant select, update on public.in_app_notifications to authenticated;

create or replace function app.current_staff_id(_restaurant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.staff s
  where s.restaurant_id = _restaurant_id
    and s.auth_user_id = (select auth.uid())
    and s.is_active
  order by s.created_at
  limit 1
$$;
revoke all on function app.current_staff_id(uuid) from public, anon;
grant execute on function app.current_staff_id(uuid) to authenticated;

create or replace function app.can_approve_work_task(_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_tasks t
    where t.id = _task_id
      and t.requires_approval
      and t.approval_status = 'pending'
      and app.has_restaurant_access(t.restaurant_id)
      and (
        app.is_super_admin()
        or exists (
          select 1
          from public.staff s
          where s.restaurant_id = t.restaurant_id
            and s.auth_user_id = (select auth.uid())
            and s.is_active
            and app.has_capability(t.restaurant_id, 'approve_work')
            and (t.approval_staff_id is null or t.approval_staff_id = s.id)
            and (t.approval_role is null or t.approval_role = s.role::text)
        )
      )
  )
$$;
revoke all on function app.can_approve_work_task(uuid) from public, anon;
grant execute on function app.can_approve_work_task(uuid) to authenticated;

create or replace function public.action_work_approval(
  _task_id uuid,
  _action text,
  _note text default null
) returns public.work_tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  _task public.work_tasks;
  _actor uuid;
  _next_status text;
  _approval_status text;
begin
  if _action not in ('approve','reject','changes_requested') then
    raise exception 'Unsupported approval action';
  end if;

  select * into _task from public.work_tasks where id = _task_id for update;
  if _task.id is null then raise exception 'Work item not found'; end if;
  if not app.can_approve_work_task(_task_id) then raise exception 'Approval not permitted'; end if;

  _actor := app.current_staff_id(_task.restaurant_id);
  _approval_status := case _action
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    else 'changes_requested'
  end;
  _next_status := case _action
    when 'approve' then 'completed'
    when 'reject' then 'cancelled'
    else 'in_progress'
  end;

  update public.work_tasks
  set approval_status = _approval_status,
      approval_note = nullif(trim(coalesce(_note, '')), ''),
      approval_action_at = now(),
      approved_by_staff_id = case when _action = 'approve' then _actor else approved_by_staff_id end,
      approved_at = case when _action = 'approve' then now() else approved_at end,
      status = _next_status,
      completed_at = case when _action = 'approve' then now() else null end,
      updated_at = now()
  where id = _task_id
  returning * into _task;

  insert into public.work_task_activity(task_id, restaurant_id, actor_staff_id, action, note, metadata)
  values (_task.id, _task.restaurant_id, _actor, 'approval_' || _approval_status, nullif(trim(coalesce(_note, '')), ''), jsonb_build_object('approval_status', _approval_status));

  return _task;
end;
$$;
revoke all on function public.action_work_approval(uuid,text,text) from public, anon;
grant execute on function public.action_work_approval(uuid,text,text) to authenticated;

-- Prevent direct client updates from setting an approval result without the server action.
create or replace function app.guard_work_approval_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
  if old.approval_status is distinct from new.approval_status
     or old.approval_note is distinct from new.approval_note
     or old.approval_action_at is distinct from new.approval_action_at
     or old.approved_by_staff_id is distinct from new.approved_by_staff_id
     or old.approved_at is distinct from new.approved_at then
    raise exception 'Approval fields must be changed through the approval action';
  end if;
  return new;
end;
$$;
revoke all on function app.guard_work_approval_fields() from public, anon, authenticated;

drop trigger if exists guard_work_approval_fields on public.work_tasks;
create trigger guard_work_approval_fields
before update on public.work_tasks
for each row execute function app.guard_work_approval_fields();

-- Notification visibility is limited to the signed-in staff member or their active restaurant role.
drop policy if exists in_app_notifications_select on public.in_app_notifications;
create policy in_app_notifications_select on public.in_app_notifications
for select to authenticated using (
  app.has_restaurant_access(restaurant_id)
  and (
    staff_id in (
      select s.id from public.staff s
      where s.restaurant_id = in_app_notifications.restaurant_id
        and s.auth_user_id = (select auth.uid()) and s.is_active
    )
    or target_role in (
      select s.role::text from public.staff s
      where s.restaurant_id = in_app_notifications.restaurant_id
        and s.auth_user_id = (select auth.uid()) and s.is_active
    )
  )
);

drop policy if exists in_app_notifications_update on public.in_app_notifications;
create policy in_app_notifications_update on public.in_app_notifications
for update to authenticated using (
  app.has_restaurant_access(restaurant_id)
  and (
    staff_id in (
      select s.id from public.staff s
      where s.restaurant_id = in_app_notifications.restaurant_id
        and s.auth_user_id = (select auth.uid()) and s.is_active
    )
    or target_role in (
      select s.role::text from public.staff s
      where s.restaurant_id = in_app_notifications.restaurant_id
        and s.auth_user_id = (select auth.uid()) and s.is_active
    )
  )
) with check (
  app.has_restaurant_access(restaurant_id)
  and (
    staff_id in (
      select s.id from public.staff s
      where s.restaurant_id = in_app_notifications.restaurant_id
        and s.auth_user_id = (select auth.uid()) and s.is_active
    )
    or target_role in (
      select s.role::text from public.staff s
      where s.restaurant_id = in_app_notifications.restaurant_id
        and s.auth_user_id = (select auth.uid()) and s.is_active
    )
  )
);

create or replace function app.notify_work_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_staff_id is not null then
    insert into public.in_app_notifications(restaurant_id, staff_id, kind, title, body, source_type, source_id, dedupe_key)
    values (new.restaurant_id, new.assigned_staff_id,
      case when new.category = 'alert' then 'alert' else 'task' end,
      new.title, new.description, 'work_task', new.id, 'work:' || new.id::text || ':assignee')
    on conflict do nothing;
  elsif new.assigned_role is not null then
    insert into public.in_app_notifications(restaurant_id, target_role, kind, title, body, source_type, source_id, dedupe_key)
    values (new.restaurant_id, new.assigned_role,
      case when new.category = 'alert' then 'alert' else 'task' end,
      new.title, new.description, 'work_task', new.id, 'work:' || new.id::text || ':role:' || new.assigned_role)
    on conflict do nothing;
  end if;

  if new.requires_approval and new.approval_status = 'pending' then
    if new.approval_staff_id is not null then
      insert into public.in_app_notifications(restaurant_id, staff_id, kind, title, body, source_type, source_id, dedupe_key)
      values (new.restaurant_id, new.approval_staff_id, 'approval', 'Approval requested: ' || new.title, new.description, 'work_task', new.id, 'approval:' || new.id::text || ':staff')
      on conflict do nothing;
    elsif new.approval_role is not null then
      insert into public.in_app_notifications(restaurant_id, target_role, kind, title, body, source_type, source_id, dedupe_key)
      values (new.restaurant_id, new.approval_role, 'approval', 'Approval requested: ' || new.title, new.description, 'work_task', new.id, 'approval:' || new.id::text || ':role:' || new.approval_role)
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app.notify_work_task() from public, anon, authenticated;

drop trigger if exists work_task_notification on public.work_tasks;
create trigger work_task_notification
after insert on public.work_tasks
for each row execute function app.notify_work_task();

create or replace function app.notify_shift_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare _shift_name text;
begin
  select s.name into _shift_name from public.shifts s where s.id = new.shift_id;
  insert into public.in_app_notifications(restaurant_id, staff_id, kind, title, body, source_type, source_id, dedupe_key)
  values (new.restaurant_id, new.staff_id, 'shift', 'Shift assigned: ' || coalesce(_shift_name, 'Shift'),
    case when new.starts_at is not null then 'Starts ' || new.starts_at::text else null end,
    'shift_assignment', new.id, 'shift-assignment:' || new.id::text)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function app.notify_shift_assignment() from public, anon, authenticated;

drop trigger if exists shift_assignment_notification on public.shift_assignments;
create trigger shift_assignment_notification
after insert on public.shift_assignments
for each row execute function app.notify_shift_assignment();

create or replace function app.link_handover_to_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare _task_id uuid;
begin
  insert into public.work_tasks(
    restaurant_id, title, description, category, priority, status,
    assigned_staff_id, assigned_role, created_by_staff_id,
    source_type, source_id, due_at, requires_approval, approval_status, metadata
  ) values (
    new.restaurant_id,
    left('Handover: ' || new.summary, 160),
    new.unresolved_items,
    'handover', new.priority, 'open',
    new.to_staff_id, new.target_role, new.from_staff_id,
    'shift_handover', new.id, null, false, 'not_required',
    jsonb_build_object('handover_id', new.id, 'category', new.category, 'shift_id', new.shift_id, 'next_shift_id', new.next_shift_id)
  )
  returning id into _task_id;

  insert into public.in_app_notifications(restaurant_id, staff_id, target_role, kind, title, body, source_type, source_id, dedupe_key)
  values (new.restaurant_id, new.to_staff_id, new.target_role, 'handover', 'Handover received', new.summary, 'shift_handover', new.id, 'handover:' || new.id::text)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function app.link_handover_to_work() from public, anon, authenticated;

drop trigger if exists shift_handover_to_work on public.shift_handovers;
create trigger shift_handover_to_work
after insert on public.shift_handovers
for each row execute function app.link_handover_to_work();

create or replace function public.resolve_shift_handover(_handover_id uuid, _note text default null)
returns public.shift_handovers
language plpgsql
security definer
set search_path = ''
as $$
declare
  _row public.shift_handovers;
  _actor uuid;
begin
  select * into _row from public.shift_handovers where id = _handover_id for update;
  if _row.id is null then raise exception 'Handover not found'; end if;
  if not app.has_restaurant_access(_row.restaurant_id) then raise exception 'Forbidden'; end if;
  _actor := app.current_staff_id(_row.restaurant_id);
  if _actor is null then raise exception 'Forbidden'; end if;
  if not (
    app.has_capability(_row.restaurant_id, 'manage_shifts')
    or _row.to_staff_id = _actor
    or exists(select 1 from public.staff s where s.id = _actor and s.role::text = _row.target_role)
  ) then raise exception 'Handover resolution not permitted'; end if;

  update public.shift_handovers
  set resolved_at = coalesce(resolved_at, now()),
      resolved_by_staff_id = coalesce(resolved_by_staff_id, _actor),
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledged_by_staff_id = coalesce(acknowledged_by_staff_id, _actor)
  where id = _handover_id
  returning * into _row;

  update public.work_tasks
  set status = 'completed', completed_at = now(), completion_note = nullif(trim(coalesce(_note, '')), ''), updated_at = now()
  where restaurant_id = _row.restaurant_id
    and source_type = 'shift_handover' and source_id = _row.id
    and status not in ('completed','cancelled');

  return _row;
end;
$$;
revoke all on function public.resolve_shift_handover(uuid,text) from public, anon;
grant execute on function public.resolve_shift_handover(uuid,text) to authenticated;
