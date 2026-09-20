create index if not exists order_view_receipts_user_idx
  on public.order_view_receipts(user_id);

create index if not exists erp_inventory_archived_by_idx
  on public.erp_inventory(archived_by)
  where archived_by is not null;
