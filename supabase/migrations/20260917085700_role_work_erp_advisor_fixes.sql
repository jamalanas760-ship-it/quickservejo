-- Follow-up for the role-aware work/ERP foundation.
-- Adds covering indexes for new foreign keys and avoids overlapping SELECT policies
-- created by FOR ALL write policies on ERP master tables.

create index if not exists work_task_activity_restaurant_idx
  on public.work_task_activity(restaurant_id);
create index if not exists work_task_activity_actor_idx
  on public.work_task_activity(actor_staff_id)
  where actor_staff_id is not null;
create index if not exists work_tasks_created_by_idx
  on public.work_tasks(created_by_staff_id)
  where created_by_staff_id is not null;
create index if not exists work_tasks_approved_by_idx
  on public.work_tasks(approved_by_staff_id)
  where approved_by_staff_id is not null;

-- Inventory: SELECT stays separate, writes are split by command so SELECT is not evaluated twice.
drop policy if exists erp_inventory_write on public.erp_inventory;
drop policy if exists erp_inventory_insert on public.erp_inventory;
drop policy if exists erp_inventory_update on public.erp_inventory;
drop policy if exists erp_inventory_delete on public.erp_inventory;
create policy erp_inventory_insert on public.erp_inventory
  for insert
  with check (
    app.has_capability(restaurant_id, 'manage_inventory')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  );
create policy erp_inventory_update on public.erp_inventory
  for update
  using (
    app.has_capability(restaurant_id, 'manage_inventory')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  )
  with check (
    app.has_capability(restaurant_id, 'manage_inventory')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  );
create policy erp_inventory_delete on public.erp_inventory
  for delete
  using (
    app.has_capability(restaurant_id, 'manage_inventory')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  );

-- Suppliers: procurement owns writes; inventory can still read supplier context.
drop policy if exists erp_suppliers_write on public.erp_suppliers;
drop policy if exists erp_suppliers_insert on public.erp_suppliers;
drop policy if exists erp_suppliers_update on public.erp_suppliers;
drop policy if exists erp_suppliers_delete on public.erp_suppliers;
create policy erp_suppliers_insert on public.erp_suppliers
  for insert
  with check (
    app.has_capability(restaurant_id, 'manage_procurement')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  );
create policy erp_suppliers_update on public.erp_suppliers
  for update
  using (
    app.has_capability(restaurant_id, 'manage_procurement')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  )
  with check (
    app.has_capability(restaurant_id, 'manage_procurement')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  );
create policy erp_suppliers_delete on public.erp_suppliers
  for delete
  using (
    app.has_capability(restaurant_id, 'manage_procurement')
    or app.has_capability(restaurant_id, 'manage_restaurant')
  );
