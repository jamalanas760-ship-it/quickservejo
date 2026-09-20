-- Phase 4 follow-up: advisor cleanup for security and FK coverage.

drop policy if exists public_rate_limits_no_direct_access on public.public_rate_limits;
create policy public_rate_limits_no_direct_access
on public.public_rate_limits
for all
to anon, authenticated
using (false)
with check (false);

revoke execute on function public.erp_post_receipt_expense() from public, anon, authenticated;
revoke execute on function public.sync_booking_table_status() from public, anon, authenticated;

drop policy if exists restaurant_group_members_manage on public.restaurant_group_members;
drop policy if exists restaurant_group_members_insert on public.restaurant_group_members;
drop policy if exists restaurant_group_members_update on public.restaurant_group_members;
drop policy if exists restaurant_group_members_delete on public.restaurant_group_members;

create policy restaurant_group_members_insert
on public.restaurant_group_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_groups g
    where g.id = group_id
      and (g.owner_user_id = (select auth.uid()) or app.is_super_admin())
  )
);

create policy restaurant_group_members_update
on public.restaurant_group_members
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurant_groups g
    where g.id = group_id
      and (g.owner_user_id = (select auth.uid()) or app.is_super_admin())
  )
)
with check (
  exists (
    select 1
    from public.restaurant_groups g
    where g.id = group_id
      and (g.owner_user_id = (select auth.uid()) or app.is_super_admin())
  )
);

create policy restaurant_group_members_delete
on public.restaurant_group_members
for delete
to authenticated
using (
  exists (
    select 1
    from public.restaurant_groups g
    where g.id = group_id
      and (g.owner_user_id = (select auth.uid()) or app.is_super_admin())
  )
);

create index if not exists cash_sessions_closed_by_idx on public.cash_sessions(closed_by) where closed_by is not null;
create index if not exists cash_sessions_staff_id_idx on public.cash_sessions(staff_id) where staff_id is not null;
create index if not exists crm_gift_cards_created_by_idx on public.crm_gift_cards(created_by) where created_by is not null;
create index if not exists crm_loyalty_accounts_restaurant_idx on public.crm_loyalty_accounts(restaurant_id);
create index if not exists crm_loyalty_ledger_restaurant_idx on public.crm_loyalty_ledger(restaurant_id);
create index if not exists erp_menu_recipes_menu_item_idx on public.erp_menu_recipes(menu_item_id);
create index if not exists erp_order_consumptions_restaurant_idx on public.erp_order_consumptions(restaurant_id);
create index if not exists erp_recipe_items_restaurant_idx on public.erp_recipe_items(restaurant_id);
create index if not exists erp_supplier_invoices_supplier_idx on public.erp_supplier_invoices(supplier_id) where supplier_id is not null;
create index if not exists item_modifiers_menu_item_idx on public.item_modifiers(menu_item_id);
create index if not exists menu_pdf_item_links_restaurant_idx on public.menu_pdf_item_links(restaurant_id);
create index if not exists order_items_menu_item_idx on public.order_items(menu_item_id) where menu_item_id is not null;
create index if not exists restaurant_groups_owner_idx on public.restaurant_groups(owner_user_id);
create index if not exists staff_leave_requests_restaurant_idx on public.staff_leave_requests(restaurant_id);
create index if not exists staff_leave_requests_reviewed_by_idx on public.staff_leave_requests(reviewed_by) where reviewed_by is not null;
create index if not exists staff_time_entries_approved_by_idx on public.staff_time_entries(approved_by) where approved_by is not null;
create index if not exists system_events_user_id_idx on public.system_events(user_id) where user_id is not null;
create index if not exists waiter_calls_table_id_idx on public.waiter_calls(table_id);
