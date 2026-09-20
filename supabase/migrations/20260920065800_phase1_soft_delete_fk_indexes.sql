create index if not exists work_tasks_deleted_by_staff_idx
  on public.work_tasks(deleted_by_staff_id)
  where deleted_by_staff_id is not null;

create index if not exists shifts_deleted_by_staff_idx
  on public.shifts(deleted_by_staff_id)
  where deleted_by_staff_id is not null;
