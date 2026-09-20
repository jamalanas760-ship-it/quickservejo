create index if not exists automation_runs_work_task_idx
  on public.automation_runs(work_task_id)
  where work_task_id is not null;

create index if not exists erp_procurement_requests_finance_expense_idx
  on public.erp_procurement_requests(finance_expense_id)
  where finance_expense_id is not null;

create index if not exists erp_procurement_requests_stock_movement_idx
  on public.erp_procurement_requests(stock_movement_id)
  where stock_movement_id is not null;
