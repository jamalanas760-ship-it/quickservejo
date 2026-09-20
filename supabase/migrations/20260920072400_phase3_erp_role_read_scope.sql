drop policy if exists erp_inventory_select on public.erp_inventory;
create policy erp_inventory_select on public.erp_inventory for select using (
  app.has_capability(restaurant_id,'manage_inventory')
  or app.has_capability(restaurant_id,'manage_procurement')
  or app.has_capability(restaurant_id,'manage_restaurant')
);

drop policy if exists erp_stock_movements_select on public.erp_stock_movements;
create policy erp_stock_movements_select on public.erp_stock_movements for select using (
  app.has_capability(restaurant_id,'manage_inventory')
  or app.has_capability(restaurant_id,'manage_procurement')
  or app.has_capability(restaurant_id,'manage_finance')
  or app.has_capability(restaurant_id,'manage_restaurant')
);

drop policy if exists erp_suppliers_select on public.erp_suppliers;
create policy erp_suppliers_select on public.erp_suppliers for select using (
  app.has_capability(restaurant_id,'manage_procurement')
  or app.has_capability(restaurant_id,'manage_inventory')
  or app.has_capability(restaurant_id,'manage_finance')
  or app.has_capability(restaurant_id,'manage_restaurant')
);
