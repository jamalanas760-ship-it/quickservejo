create or replace function app.create_tasks_from_event(
  _restaurant_id uuid,
  _event_type text,
  _source_type text,
  _source_id uuid,
  _title text,
  _description text default null,
  _metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  _rule record;
  _created integer := 0;
  _task_id uuid;
  _run_id uuid;
begin
  if _restaurant_id is null or _event_type is null then return 0; end if;

  for _rule in
    select r.*
    from public.operational_rules r
    where r.restaurant_id=_restaurant_id
      and r.event_type=_event_type
      and r.enabled
    order by case r.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
             r.created_at
  loop
    _task_id:=null;
    _run_id:=gen_random_uuid();

    insert into public.work_tasks(
      restaurant_id,title,description,category,priority,status,assigned_role,
      source_type,source_id,source_rule_id,due_at,requires_approval,approval_role,metadata
    ) values(
      _restaurant_id,
      left(coalesce(nullif(trim(_title),''),_rule.name),160),
      _description,
      case when _rule.requires_approval then 'approval'
           when _event_type in ('order_stuck','low_stock') then 'alert'
           else 'task' end,
      _rule.priority,'open',coalesce(nullif(_rule.target_role,''),'manager'),
      _source_type,_source_id,_rule.id,now()+make_interval(mins=>_rule.due_minutes),
      _rule.requires_approval,_rule.approval_role,
      coalesce(_metadata,'{}'::jsonb)
        || jsonb_build_object(
          'rule_id',_rule.id,
          'event_type',_event_type,
          'automated',true,
          'automation_run_id',_run_id,
          'action_type',coalesce(_rule.rule_config->>'action_type','create_work_task')
        )
    )
    on conflict do nothing
    returning id into _task_id;

    if _task_id is not null then
      insert into public.automation_runs(
        id,restaurant_id,rule_id,triggered_by,started_at,completed_at,status,result_summary,work_task_id
      ) values(
        _run_id,_restaurant_id,_rule.id,'event',now(),now(),'success','Work item created from event',_task_id
      );

      update public.operational_rules
      set last_run_at=now(),last_status='success',last_error=null,updated_at=now()
      where id=_rule.id;

      _created:=_created+1;
    end if;
  end loop;

  return _created;
end;
$$;
