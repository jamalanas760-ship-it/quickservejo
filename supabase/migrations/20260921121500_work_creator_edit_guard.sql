begin;

create or replace function public.update_own_work_task_details(
  _task_id uuid,
  _title text,
  _description text default null,
  _priority text default 'normal',
  _due_at timestamptz default null
)
returns public.work_tasks
language plpgsql
security definer
set search_path=''
as $$
declare
  _task public.work_tasks;
  _actor_staff_id uuid;
begin
  select * into _task from public.work_tasks where id=_task_id for update;
  if _task.id is null then raise exception 'Work item not found'; end if;

  select id into _actor_staff_id
  from public.staff
  where restaurant_id=_task.restaurant_id
    and auth_user_id=(select auth.uid())
    and is_active
  limit 1;

  if _actor_staff_id is null or _task.created_by_staff_id is distinct from _actor_staff_id then
    raise exception 'Only the creator can edit this work item' using errcode='42501';
  end if;

  if char_length(trim(coalesce(_title,''))) not between 1 and 160 then
    raise exception 'Title must be between 1 and 160 characters';
  end if;
  if _priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid priority';
  end if;

  update public.work_tasks
  set title=trim(_title),
      description=nullif(left(trim(coalesce(_description,'')),4000),''),
      priority=_priority,
      due_at=_due_at,
      updated_at=now()
  where id=_task_id
  returning * into _task;

  insert into public.work_task_activity(task_id,restaurant_id,actor_staff_id,action,note,metadata)
  values(_task.id,_task.restaurant_id,_actor_staff_id,'details_updated',null,jsonb_build_object('priority',_priority,'due_at',_due_at));

  return _task;
end;
$$;

revoke all on function public.update_own_work_task_details(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.update_own_work_task_details(uuid,text,text,text,timestamptz) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
