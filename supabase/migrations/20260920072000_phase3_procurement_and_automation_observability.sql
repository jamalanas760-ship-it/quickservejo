-- QuickServe Phase 3: procurement workflow + automation execution observability.
-- Applied to production Supabase on 2026-09-20.

create table if not exists public.erp_procurement_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid references public.erp_inventory(id) on delete set null,
  item_name_snapshot text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  estimated_unit_cost numeric not null default 0 check (estimated_unit_cost >= 0),
  actual_unit_cost numeric,
  supplier_id uuid references public.erp_suppliers(id) on delete set null,
  status text not null default 'requested' check (status in ('requested','approved','rejected','ordered','received','cancelled')),
  needed_by date,
  notes text not null default '',
  po_reference text not null default '',
  requested_by uuid not null default auth.uid(),
  approved_by uuid,
  approved_at timestamptz,
  ordered_at timestamptz,
  received_at timestamptz,
  stock_movement_id uuid references public.erp_stock_movements(id) on delete set null,
  finance_expense_id uuid references public.erp_expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_procurement_requests_restaurant_status_idx on public.erp_procurement_requests(restaurant_id,status,created_at desc);
create index if not exists erp_procurement_requests_supplier_idx on public.erp_procurement_requests(supplier_id) where supplier_id is not null;
create index if not exists erp_procurement_requests_item_idx on public.erp_procurement_requests(item_id) where item_id is not null;
create index if not exists erp_procurement_requests_needed_idx on public.erp_procurement_requests(restaurant_id,needed_by) where status not in ('received','rejected','cancelled');

alter table public.erp_procurement_requests enable row level security;
drop policy if exists erp_procurement_requests_select on public.erp_procurement_requests;
create policy erp_procurement_requests_select on public.erp_procurement_requests for select using (
  app.has_capability(restaurant_id,'manage_procurement')
  or app.has_capability(restaurant_id,'manage_inventory')
  or app.has_capability(restaurant_id,'manage_finance')
  or app.has_capability(restaurant_id,'manage_restaurant')
);
drop policy if exists erp_procurement_requests_insert on public.erp_procurement_requests;
create policy erp_procurement_requests_insert on public.erp_procurement_requests for insert with check (
  (app.has_capability(restaurant_id,'manage_procurement') or app.has_capability(restaurant_id,'manage_restaurant'))
  and requested_by=(select auth.uid())
);
grant select,insert on public.erp_procurement_requests to authenticated;
revoke update,delete on public.erp_procurement_requests from authenticated;

create or replace function public.erp_set_procurement_status(_request_id uuid,_status text,_po_reference text default null)
returns void language plpgsql security definer set search_path='' as $$
declare
  _req public.erp_procurement_requests%rowtype;
  _can_procure boolean;
  _can_manage boolean;
begin
  select * into _req from public.erp_procurement_requests where id=_request_id for update;
  if _req.id is null then raise exception 'Procurement request not found'; end if;

  _can_procure:=app.has_capability(_req.restaurant_id,'manage_procurement');
  _can_manage:=app.has_capability(_req.restaurant_id,'manage_restaurant');

  if _status not in ('approved','rejected','ordered','cancelled') then raise exception 'Unsupported procurement status transition'; end if;

  if _status in ('approved','rejected') then
    if not _can_manage and not app.is_super_admin() then raise exception 'Only Restaurant Management can approve or reject procurement requests'; end if;
    if _req.status<>'requested' then raise exception 'Only requested items can be approved or rejected'; end if;
    update public.erp_procurement_requests
      set status=_status,approved_by=(select auth.uid()),approved_at=now(),updated_at=now()
      where id=_request_id;
    return;
  end if;

  if _status='ordered' then
    if not (_can_procure or _can_manage or app.is_super_admin()) then raise exception 'Procurement access is required'; end if;
    if _req.status<>'approved' then raise exception 'Only approved requests can be marked ordered'; end if;
    update public.erp_procurement_requests
      set status='ordered',po_reference=coalesce(_po_reference,po_reference),ordered_at=now(),updated_at=now()
      where id=_request_id;
    return;
  end if;

  if _status='cancelled' then
    if not (_can_procure or _can_manage or app.is_super_admin()) then raise exception 'Procurement access is required'; end if;
    if _req.status in ('received','rejected','cancelled') then raise exception 'This procurement request can no longer be cancelled'; end if;
    update public.erp_procurement_requests set status='cancelled',updated_at=now() where id=_request_id;
  end if;
end;
$$;
revoke all on function public.erp_set_procurement_status(uuid,text,text) from public,anon;
grant execute on function public.erp_set_procurement_status(uuid,text,text) to authenticated,service_role;

create or replace function public.erp_receive_procurement_request(_request_id uuid,_unit_cost numeric default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  _req public.erp_procurement_requests%rowtype;
  _movement_id uuid;
  _expense_id uuid;
  _cost numeric;
begin
  select * into _req from public.erp_procurement_requests where id=_request_id for update;
  if _req.id is null then raise exception 'Procurement request not found'; end if;

  if not (
    app.has_capability(_req.restaurant_id,'manage_inventory')
    or app.has_capability(_req.restaurant_id,'manage_procurement')
    or app.has_capability(_req.restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then raise exception 'Inventory or procurement access is required'; end if;

  if _req.status='received' then return _req.stock_movement_id; end if;
  if _req.status not in ('approved','ordered') then raise exception 'Only approved or ordered requests can be received'; end if;
  if _req.item_id is null then raise exception 'Link an inventory item before receiving'; end if;

  _cost:=coalesce(_unit_cost,_req.estimated_unit_cost);
  if _cost is null or _cost<=0 then raise exception 'Unit cost is required'; end if;

  if not exists(select 1 from public.erp_inventory i where i.id=_req.item_id and i.restaurant_id=_req.restaurant_id) then
    raise exception 'Inventory item does not belong to this restaurant';
  end if;
  if _req.supplier_id is not null and not exists(select 1 from public.erp_suppliers s where s.id=_req.supplier_id and s.restaurant_id=_req.restaurant_id) then
    raise exception 'Supplier does not belong to this restaurant';
  end if;

  insert into public.erp_stock_movements(restaurant_id,item_id,supplier_id,quantity,unit_cost,movement_type,reason)
  values(_req.restaurant_id,_req.item_id,_req.supplier_id,_req.quantity,_cost,'receipt',concat('Procurement receipt · ',upper(left(_req.id::text,8))))
  returning id into _movement_id;

  select finance_expense_id into _expense_id from public.erp_stock_movements where id=_movement_id;

  update public.erp_procurement_requests
  set status='received',actual_unit_cost=_cost,received_at=now(),stock_movement_id=_movement_id,finance_expense_id=_expense_id,updated_at=now()
  where id=_request_id;

  return _movement_id;
end;
$$;
revoke all on function public.erp_receive_procurement_request(uuid,numeric) from public,anon;
grant execute on function public.erp_receive_procurement_request(uuid,numeric) to authenticated,service_role;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rule_id uuid not null references public.operational_rules(id) on delete cascade,
  triggered_by text not null check (triggered_by in ('manual','scheduled','event')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','success','failed')),
  result_summary text,
  error text,
  work_task_id uuid references public.work_tasks(id) on delete set null
);
create index if not exists automation_runs_rule_started_idx on public.automation_runs(rule_id,started_at desc);
create index if not exists automation_runs_restaurant_started_idx on public.automation_runs(restaurant_id,started_at desc);
create index if not exists automation_runs_failed_idx on public.automation_runs(restaurant_id,started_at desc) where status='failed';

alter table public.automation_runs enable row level security;
drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs for select using (
  app.has_capability(restaurant_id,'manage_work')
  or app.has_capability(restaurant_id,'manage_shifts')
  or app.has_capability(restaurant_id,'manage_restaurant')
);
grant select on public.automation_runs to authenticated;
revoke insert,update,delete on public.automation_runs from authenticated;

create or replace function app.execute_operational_rule(_rule_id uuid,_manual boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  _rule public.operational_rules%rowtype;
  _task_id uuid;
  _run_id uuid;
  _error text;
begin
  select * into _rule from public.operational_rules where id=_rule_id;
  if _rule.id is null then raise exception 'Automation rule not found'; end if;
  if not _manual and not _rule.enabled then return null; end if;

  insert into public.automation_runs(restaurant_id,rule_id,triggered_by,status)
  values(_rule.restaurant_id,_rule.id,case when _manual then 'manual' else 'scheduled' end,'running')
  returning id into _run_id;

  begin
    insert into public.work_tasks(
      restaurant_id,title,description,category,priority,status,assigned_role,source_type,source_id,source_rule_id,due_at,
      requires_approval,approval_role,metadata
    ) values(
      _rule.restaurant_id,_rule.name,coalesce(_rule.rule_config->>'description','Automation rule generated this work item.'),
      case when _rule.requires_approval then 'approval' else 'task' end,_rule.priority,'open',coalesce(_rule.target_role,'manager'),
      'automation_run',_run_id,_rule.id,now()+make_interval(mins=>_rule.due_minutes),_rule.requires_approval,_rule.approval_role,
      jsonb_build_object('automated',true,'automation_rule_id',_rule.id,'automation_run_id',_run_id,'event_type',_rule.event_type,
        'action_type',coalesce(_rule.rule_config->>'action_type','create_work_task'),'manual_run',_manual,'scheduled_run',not _manual)
    ) returning id into _task_id;

    update public.operational_rules
    set last_run_at=now(),last_status='success',last_error=null,
        next_run_at=case when schedule_time is null then null else app.compute_next_rule_run(schedule_time,schedule_recurrence,schedule_timezone,now()) end,
        updated_at=now()
    where id=_rule.id;

    update public.automation_runs
    set completed_at=now(),status='success',result_summary='Work item created',work_task_id=_task_id
    where id=_run_id;

    return _task_id;
  exception when others then
    _error:=sqlerrm;
    update public.operational_rules
    set last_run_at=now(),last_status='failed',last_error=left(_error,1000),
        next_run_at=case when schedule_time is null then null else app.compute_next_rule_run(schedule_time,schedule_recurrence,schedule_timezone,now()) end,
        updated_at=now()
    where id=_rule.id;
    update public.automation_runs
    set completed_at=now(),status='failed',error=left(_error,2000),result_summary='Execution failed'
    where id=_run_id;
    return null;
  end;
end;
$$;
revoke all on function app.execute_operational_rule(uuid,boolean) from public,anon,authenticated;
grant execute on function app.execute_operational_rule(uuid,boolean) to service_role;

create or replace function public.run_operational_rule(_rule_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare _restaurant_id uuid;
begin
  select restaurant_id into _restaurant_id from public.operational_rules where id=_rule_id;
  if _restaurant_id is null then raise exception 'Automation rule not found'; end if;
  if not (
    app.has_capability(_restaurant_id,'manage_work')
    or app.has_capability(_restaurant_id,'manage_shifts')
    or app.has_capability(_restaurant_id,'manage_restaurant')
    or app.is_super_admin()
  ) then raise exception 'Not authorized to run automation rules'; end if;
  return app.execute_operational_rule(_rule_id,true);
end;
$$;
revoke all on function public.run_operational_rule(uuid) from public,anon;
grant execute on function public.run_operational_rule(uuid) to authenticated,service_role;
