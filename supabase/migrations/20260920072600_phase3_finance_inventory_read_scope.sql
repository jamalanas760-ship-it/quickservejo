drop policy if exists erp_inventory_select on public.erp_inventory;
create policy erp_inventory_select on public.erp_inventory for select using (
  app.has_capability(restaurant_id,'manage_inventory')
  or app.has_capability(restaurant_id,'manage_procurement')
  or app.has_capability(restaurant_id,'manage_finance')
  or app.has_capability(restaurant_id,'manage_restaurant')
);
