
drop policy if exists staff_write_audit on public.audit_logs;
create policy staff_write_audit
on public.audit_logs
for insert
to authenticated
with check (
  actor_user_id = (select auth.uid())
  and (
    restaurant_id is null
    or app.has_restaurant_access(restaurant_id)
  )
);
