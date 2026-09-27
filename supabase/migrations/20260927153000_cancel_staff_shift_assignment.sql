begin;

create or replace function public.cancel_staff_shift_assignment(
  _restaurant_id uuid,
  _assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _assignment public.shift_assignments;
  _shift public.shifts;
  _effective_end timestamptz;
begin
  if not (
    app.can_manage_restaurant(_restaurant_id)
    or app.has_capability(_restaurant_id, 'manage_shifts')
    or app.is_super_admin()
  ) then
    raise exception 'Shift management access is required' using errcode = '42501';
  end if;

  select a.* into _assignment
  from public.shift_assignments a
  where a.id = _assignment_id
    and a.restaurant_id = _restaurant_id
  for update;

  if _assignment.id is null then
    raise exception 'Shift assignment not found';
  end if;

  select sh.* into _shift
  from public.shifts sh
  where sh.id = _assignment.shift_id
    and sh.restaurant_id = _restaurant_id
    and sh.deleted_at is null
  for update;

  if _shift.id is null then
    raise exception 'Shift not found';
  end if;

  _effective_end := coalesce(_assignment.ends_at, _shift.planned_end);
  if _shift.status = 'closed'
     or _assignment.status = 'released'
     or (_effective_end is not null and _effective_end <= now())
     or (_effective_end is null and _shift.shift_date < current_date) then
    raise exception 'Past or completed shift assignments cannot be cancelled';
  end if;

  insert into public.audit_logs(
    restaurant_id,
    actor_user_id,
    action,
    entity,
    entity_id,
    metadata
  )
  values (
    _restaurant_id,
    auth.uid(),
    'staff_shift_cancelled',
    'shift_assignment',
    _assignment.id,
    jsonb_build_object(
      'shift_id', _shift.id,
      'shift_name', _shift.name,
      'staff_id', _assignment.staff_id,
      'assignment_status', _assignment.status,
      'starts_at', coalesce(_assignment.starts_at, _shift.planned_start),
      'ends_at', _effective_end
    )
  );

  delete from public.shift_assignments
  where id = _assignment.id;
end;
$$;

revoke all on function public.cancel_staff_shift_assignment(uuid, uuid) from public, anon;
grant execute on function public.cancel_staff_shift_assignment(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
