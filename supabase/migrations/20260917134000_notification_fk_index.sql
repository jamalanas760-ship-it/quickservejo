-- Cover the notification -> staff foreign key for delete/update checks and joins.
create index if not exists in_app_notifications_staff_fk_idx
  on public.in_app_notifications(staff_id)
  where staff_id is not null;
