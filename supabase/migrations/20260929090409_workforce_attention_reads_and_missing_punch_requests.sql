begin;

create table if not exists public.staff_missing_punch_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz not null,
  break_minutes integer not null default 0,
  reason text not null,
  status text not null default 'pending',
  reviewed_by_staff_id uuid references public.staff(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_missing_punch_requests_status_chk
    check (status in ('pending','approved','rejected','cancelled')),
  constraint staff_missing_punch_requests_window_chk
    check (clock_out > clock_in),
  constraint staff_missing_punch_requests_break_chk
    check (break_minutes >= 0),
  constraint staff_missing_punch_requests_reason_chk
    check (char_length(btrim(reason)) between 3 and 500)
);

create index if not exists staff_missing_punch_requests_restaurant_idx
  on public.staff_missing_punch_requests(restaurant_id,status,created_at desc);
create index if not exists staff_missing_punch_requests_staff_idx
  on public.staff_missing_punch_requests(staff_id,status,created_at desc);

alter table public.staff_missing_punch_requests enable row level security;
grant select on public.staff_missing_punch_requests to authenticated;
grant all on public.staff_missing_punch_requests to service_role;

drop policy if exists staff_missing_punch_requests_select on public.staff_missing_punch_requests;
create policy staff_missing_punch_requests_select
on public.staff_missing_punch_requests
for select
to authenticated
using (
  app.has_restaurant_access(restaurant_id)
  and (
    app.has_capability(restaurant_id,'manage_shifts')
    or app.can_manage_restaurant(restaurant_id)
    or app.is_super_admin()
    or staff_id in (
      select s.id
      from public.staff s
      where s.restaurant_id=staff_missing_punch_requests.restaurant_id
        and s.auth_user_id=(select auth.uid())
        and s.is_active
    )
  )
);

create or replace function public.submit_missing_punch_request(
  _restaurant_id uuid,
  _clock_in timestamptz,
  _clock_out timestamptz,
  _break_minutes integer default 0,
  _reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _staff_id uuid;
  _staff_name text;
  _request_id uuid;
  _duration_minutes integer;
  _role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not app.has_restaurant_access(_restaurant_id) then
    raise exception 'Restaurant access is required' using errcode='42501';
  end if;

  select s.id,s.name into _staff_id,_staff_name
  from public.staff s
  where s.restaurant_id=_restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  limit 1;

  if _staff_id is null then
    raise exception 'Active staff member not found' using errcode='22023';
  end if;

  if _clock_in is null or _clock_out is null or _clock_out <= _clock_in then
    raise exception 'Clock-out must be after clock-in' using errcode='22023';
  end if;

  if _clock_in > now()+interval '5 minutes' or _clock_out > now()+interval '5 minutes' then
    raise exception 'Missing punch requests cannot be in the future' using errcode='22023';
  end if;

  _duration_minutes := floor(extract(epoch from (_clock_out-_clock_in))/60)::integer;
  if _duration_minutes <= 0 or _duration_minutes > 2160 then
    raise exception 'Time entry must be between 1 minute and 36 hours' using errcode='22023';
  end if;

  if coalesce(_break_minutes,0) < 0 or coalesce(_break_minutes,0) >= _duration_minutes then
    raise exception 'Break minutes must be shorter than the worked time' using errcode='22023';
  end if;

  if nullif(btrim(coalesce(_reason,'')),'') is null or char_length(btrim(_reason)) < 3 then
    raise exception 'A reason is required' using errcode='22023';
  end if;

  if exists (
    select 1
    from public.staff_time_entries e
    where e.restaurant_id=_restaurant_id
      and e.staff_id=_staff_id
      and _clock_in < coalesce(e.clock_out,'infinity'::timestamptz)
      and _clock_out > e.clock_in
  ) then
    raise exception 'This request overlaps an existing time entry' using errcode='23P01';
  end if;

  if exists (
    select 1
    from public.staff_missing_punch_requests r
    where r.restaurant_id=_restaurant_id
      and r.staff_id=_staff_id
      and r.status='pending'
      and _clock_in < r.clock_out
      and _clock_out > r.clock_in
  ) then
    raise exception 'A pending missing punch request already covers this time' using errcode='23505';
  end if;

  insert into public.staff_missing_punch_requests(
    restaurant_id,staff_id,clock_in,clock_out,break_minutes,reason,status
  )
  values(
    _restaurant_id,_staff_id,_clock_in,_clock_out,coalesce(_break_minutes,0),btrim(_reason),'pending'
  )
  returning id into _request_id;

  foreach _role in array array['restaurant_admin','operations_manager','manager']::text[]
  loop
    insert into public.in_app_notifications(
      restaurant_id,target_role,kind,title,body,source_type,source_id,dedupe_key
    )
    values(
      _restaurant_id,_role,'alert','Missing punch request',
      coalesce(_staff_name,'Team member') || ' submitted a missing clock-in/out request.',
      'missing_punch_request',_request_id,
      'missing-punch-request:'||_request_id::text||':'||_role
    )
    on conflict (restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  insert into public.audit_logs(
    restaurant_id,actor_user_id,action,entity,entity_id,metadata
  )
  values(
    _restaurant_id,auth.uid(),'missing_punch_requested','staff_missing_punch_request',_request_id,
    jsonb_build_object(
      'staff_id',_staff_id,
      'clock_in',_clock_in,
      'clock_out',_clock_out,
      'break_minutes',coalesce(_break_minutes,0)
    )
  );

  return _request_id;
end;
$$;

revoke all on function public.submit_missing_punch_request(uuid,timestamptz,timestamptz,integer,text)
from public,anon;
grant execute on function public.submit_missing_punch_request(uuid,timestamptz,timestamptz,integer,text)
to authenticated,service_role;

create or replace function public.review_missing_punch_request(
  _request_id uuid,
  _decision text,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _r public.staff_missing_punch_requests%rowtype;
  _actor_staff_id uuid;
  _entry_id uuid;
  _staff_name text;
begin
  select * into _r
  from public.staff_missing_punch_requests
  where id=_request_id
  for update;

  if _r.id is null then
    raise exception 'Missing punch request not found' using errcode='22023';
  end if;

  if not (
    app.can_manage_restaurant(_r.restaurant_id)
    or app.has_capability(_r.restaurant_id,'manage_shifts')
    or app.is_super_admin()
  ) then
    raise exception 'Shift management access is required' using errcode='42501';
  end if;

  if _r.status <> 'pending' then
    raise exception 'This missing punch request has already been reviewed' using errcode='22023';
  end if;

  if _decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected' using errcode='22023';
  end if;

  select s.id into _actor_staff_id
  from public.staff s
  where s.restaurant_id=_r.restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  limit 1;

  if _decision='approved' then
    perform pg_advisory_xact_lock(hashtextextended(_r.staff_id::text, 9114));

    if exists (
      select 1
      from public.staff_time_entries e
      where e.restaurant_id=_r.restaurant_id
        and e.staff_id=_r.staff_id
        and _r.clock_in < coalesce(e.clock_out,'infinity'::timestamptz)
        and _r.clock_out > e.clock_in
    ) then
      raise exception 'The requested time now overlaps an existing time entry' using errcode='23P01';
    end if;

    insert into public.staff_time_entries(
      restaurant_id,staff_id,clock_in,clock_out,break_minutes,notes,
      review_status,reviewed_by_staff_id,reviewed_at,review_note
    )
    values(
      _r.restaurant_id,_r.staff_id,_r.clock_in,_r.clock_out,_r.break_minutes,
      'Approved missing punch: '||_r.reason,
      'approved',_actor_staff_id,now(),coalesce(nullif(btrim(_note),''),'Approved missing punch request')
    )
    returning id into _entry_id;

    insert into public.staff_time_entry_corrections(
      restaurant_id,entry_id,actor_staff_id,action,previous,next,reason
    )
    values(
      _r.restaurant_id,_entry_id,_actor_staff_id,'create_missing','{}'::jsonb,
      jsonb_build_object(
        'staff_id',_r.staff_id,
        'clock_in',_r.clock_in,
        'clock_out',_r.clock_out,
        'break_minutes',_r.break_minutes,
        'review_status','approved'
      ),
      coalesce(nullif(btrim(_note),''),_r.reason)
    );
  end if;

  update public.staff_missing_punch_requests
  set status=_decision,
      reviewed_by_staff_id=_actor_staff_id,
      reviewed_at=now(),
      review_note=nullif(btrim(coalesce(_note,'')),''),
      updated_at=now()
  where id=_request_id;

  select s.name into _staff_name
  from public.staff s
  where s.id=_r.staff_id;

  insert into public.in_app_notifications(
    restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key
  )
  values(
    _r.restaurant_id,_r.staff_id,'shift',
    case when _decision='approved' then 'Missing punch approved' else 'Missing punch rejected' end,
    case when _decision='approved'
      then 'Your missing clock-in/out request was approved.'
      else 'Your missing clock-in/out request was rejected.' end,
    'missing_punch_request',_request_id,
    'missing-punch-result:'||_request_id::text
  )
  on conflict (restaurant_id,dedupe_key) where dedupe_key is not null
  do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now();

  insert into public.audit_logs(
    restaurant_id,actor_user_id,action,entity,entity_id,metadata
  )
  values(
    _r.restaurant_id,auth.uid(),'missing_punch_'||_decision,'staff_missing_punch_request',_request_id,
    jsonb_build_object('staff_id',_r.staff_id,'time_entry_id',_entry_id,'note',_note)
  );

  return _entry_id;
end;
$$;

revoke all on function public.review_missing_punch_request(uuid,text,text)
from public,anon;
grant execute on function public.review_missing_punch_request(uuid,text,text)
to authenticated,service_role;

create or replace function public.mark_workforce_attention_read(
  _restaurant_id uuid,
  _alert_keys text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  _staff_id uuid;
  _count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not app.has_restaurant_access(_restaurant_id) then
    raise exception 'Restaurant access is required' using errcode='42501';
  end if;

  select s.id into _staff_id
  from public.staff s
  where s.restaurant_id=_restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  limit 1;

  if _staff_id is null then
    raise exception 'Active staff member not found' using errcode='22023';
  end if;

  if coalesce(cardinality(_alert_keys),0)=0 then
    return 0;
  end if;

  if cardinality(_alert_keys) > 50 then
    raise exception 'Too many alerts at once' using errcode='22023';
  end if;

  insert into public.in_app_notifications(
    restaurant_id,staff_id,kind,title,body,source_type,dedupe_key,read_at
  )
  select
    _restaurant_id,_staff_id,'system','Workforce alert acknowledged',
    left(btrim(k),500),'workforce_alert_read',
    'workforce-read:'||_staff_id::text||':'||md5(btrim(k)),
    now()
  from (
    select distinct unnest(_alert_keys) k
  ) keys
  where nullif(btrim(k),'') is not null
  on conflict (restaurant_id,dedupe_key) where dedupe_key is not null
  do update set read_at=now(),body=excluded.body,created_at=now();

  get diagnostics _count = row_count;
  return _count;
end;
$$;

revoke all on function public.mark_workforce_attention_read(uuid,text[])
from public,anon;
grant execute on function public.mark_workforce_attention_read(uuid,text[])
to authenticated,service_role;

notify pgrst,'reload schema';
commit;
