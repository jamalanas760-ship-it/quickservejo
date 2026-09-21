begin;

-- Core work-item details are creator-owned. Assignees/managers can still move,
-- assign and operationally act on cards, but cannot silently rewrite the
-- creator's title, description, category, priority, due date or approval setup.
create or replace function app.guard_work_task_creator_fields()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  _actor_staff_id uuid;
  _core_changed boolean;
begin
  if current_user in ('postgres','service_role','supabase_admin') then
    return new;
  end if;

  _core_changed :=
    old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.category is distinct from new.category
    or old.priority is distinct from new.priority
    or old.due_at is distinct from new.due_at
    or old.requires_approval is distinct from new.requires_approval
    or old.approval_role is distinct from new.approval_role;

  if not _core_changed then
    return new;
  end if;

  select id into _actor_staff_id
  from public.staff
  where restaurant_id=old.restaurant_id
    and auth_user_id=(select auth.uid())
    and is_active
  limit 1;

  if _actor_staff_id is null or old.created_by_staff_id is distinct from _actor_staff_id then
    raise exception 'Only the creator can edit core work item details' using errcode='42501';
  end if;

  return new;
end;
$$;

revoke all on function app.guard_work_task_creator_fields() from public,anon,authenticated;

drop trigger if exists guard_work_task_creator_fields on public.work_tasks;
create trigger guard_work_task_creator_fields
before update on public.work_tasks
for each row execute function app.guard_work_task_creator_fields();

notify pgrst,'reload schema';
commit;
