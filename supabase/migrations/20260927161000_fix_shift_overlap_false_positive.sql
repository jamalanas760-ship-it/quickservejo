begin;

-- Remove stale assignments left behind by previously archived shifts.
-- These rows are not visible in the live shift query, but could still be seen by
-- the client-side conflict checker because they retain starts_at/ends_at values.
delete from public.shift_assignments a
using public.shifts sh
where a.shift_id = sh.id
  and sh.deleted_at is not null;

-- Archiving a shift must also remove its active assignment links so deleted
-- schedules can never block future staff scheduling.
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

  if _restaurant_id is null then
    raise exception 'Shift not found';
  end if;

  if not app.is_super_admin()
     and not exists (
       select 1
       from public.staff s
       where s.restaurant_id = _restaurant_id
         and s.auth_user_id = (select auth.uid())
         and s.is_active
         and s.role::text = 'restaurant_admin'
     ) then
    raise exception 'Only the Restaurant Manager can delete shifts';
  end if;

  _staff_id := app.current_staff_id(_restaurant_id);

  delete from public.shift_assignments
  where shift_id = _shift_id
    and restaurant_id = _restaurant_id;

  update public.shifts
  set deleted_at = now(),
      deleted_by_staff_id = _staff_id,
      updated_at = now()
  where id = _shift_id
    and deleted_at is null;
end;
$$;

revoke all on function public.archive_shift(uuid) from public, anon;
grant execute on function public.archive_shift(uuid) to authenticated, service_role;

-- Keep overlap validation on the server as the source of truth.
-- Adjacent shifts are allowed (end == next start). Only a real time intersection
-- with a live, non-released assignment is rejected.
create or replace function public.assign_staff_shift(
  _restaurant_id uuid,
  _staff_id uuid,
  _shift_id uuid default null,
  _name text default null,
  _shift_date date default null,
  _planned_start timestamptz default null,
  _planned_end timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _resolved_shift uuid := _shift_id;
  _role text;
  _candidate_start timestamptz;
  _candidate_end timestamptz;
begin
  if not (
    app.can_manage_restaurant(_restaurant_id)
    or app.has_capability(_restaurant_id, 'manage_shifts')
    or app.is_super_admin()
  ) then
    raise exception 'Shift management access is required' using errcode = '42501';
  end if;

  select s.role::text into _role
  from public.staff s
  where s.id = _staff_id
    and s.restaurant_id = _restaurant_id
    and s.is_active;

  if _role is null then
    raise exception 'Active staff member not found';
  end if;

  if _resolved_shift is null then
    if nullif(btrim(coalesce(_name, '')), '') is null
       or _shift_date is null
       or _planned_start is null
       or _planned_end is null then
      raise exception 'Shift name, date and time are required';
    end if;
    _candidate_start := _planned_start;
    _candidate_end := _planned_end;
  else
    select sh.planned_start, sh.planned_end
      into _candidate_start, _candidate_end
    from public.shifts sh
    where sh.id = _resolved_shift
      and sh.restaurant_id = _restaurant_id
      and sh.deleted_at is null
      and sh.status <> 'closed';

    if not found then
      raise exception 'Shift not found or already closed';
    end if;

    if exists (
      select 1
      from public.shift_assignments a
      where a.shift_id = _resolved_shift
        and a.staff_id = _staff_id
    ) then
      raise exception 'This staff member is already assigned to the selected shift';
    end if;
  end if;

  if _candidate_start is not null
     and _candidate_end is not null
     and exists (
       select 1
       from public.shift_assignments a
       join public.shifts sh on sh.id = a.shift_id
       where a.restaurant_id = _restaurant_id
         and a.staff_id = _staff_id
         and a.status <> 'released'
         and sh.deleted_at is null
         and sh.status <> 'closed'
         and coalesce(a.starts_at, sh.planned_start) is not null
         and coalesce(a.ends_at, sh.planned_end) is not null
         and _candidate_start < coalesce(a.ends_at, sh.planned_end)
         and _candidate_end > coalesce(a.starts_at, sh.planned_start)
     ) then
    raise exception 'This time overlaps another assignment for this team member';
  end if;

  if _resolved_shift is null then
    insert into public.shifts(
      restaurant_id,
      name,
      shift_date,
      planned_start,
      planned_end,
      status
    )
    values (
      _restaurant_id,
      left(btrim(_name), 80),
      _shift_date,
      _planned_start,
      _planned_end,
      'planned'
    )
    returning id into _resolved_shift;
  end if;

  insert into public.shift_assignments(
    restaurant_id,
    shift_id,
    staff_id,
    role_snapshot,
    starts_at,
    ends_at,
    status
  )
  select
    _restaurant_id,
    _resolved_shift,
    _staff_id,
    _role,
    sh.planned_start,
    sh.planned_end,
    'scheduled'
  from public.shifts sh
  where sh.id = _resolved_shift;

  return _resolved_shift;
end;
$$;

revoke all on function public.assign_staff_shift(uuid, uuid, uuid, text, date, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.assign_staff_shift(uuid, uuid, uuid, text, date, timestamptz, timestamptz)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
