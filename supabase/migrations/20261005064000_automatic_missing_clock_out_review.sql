begin;
alter table public.staff_missing_punch_requests
  add column origin text not null default 'employee' check(origin in ('employee','automatic')),
  add column time_entry_id uuid references public.staff_time_entries(id) on delete cascade,
  add column assignment_id uuid references public.shift_assignments(id) on delete set null,
  add column scheduled_end timestamptz,
  add column recorded_clock_out timestamptz,
  add column resolution text check(resolution in ('corrected_clock_out','overtime_approved','rejected'));
alter table public.staff_time_entries add column approved_overtime_minutes integer not null default 0 check(approved_overtime_minutes>=0);
alter table public.staff_missing_punch_requests add constraint automatic_clock_out_case_integrity check(origin<>'automatic' or (time_entry_id is not null and scheduled_end is not null));
create index missing_clock_out_assignment_fk on public.staff_missing_punch_requests(assignment_id) where assignment_id is not null;
create unique index missing_clock_out_one_case_per_entry on public.staff_missing_punch_requests(time_entry_id) where origin='automatic';
create index shift_assignment_clock_out_lookup on public.shift_assignments(restaurant_id,staff_id,starts_at,ends_at) where status<>'released';

-- Runs independently of whether any browser or PWA is open. Never changes worked hours.
create or replace function app.detect_missing_clock_outs(_restaurant_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare e public.staff_time_entries%rowtype; a record; _end timestamptz; _extended timestamptz;
  _id uuid; _staff_name text; _recipient record; _count integer:=0;
begin
  for e in select t.* from public.staff_time_entries t
    join public.staff s on s.id=t.staff_id and s.restaurant_id=t.restaurant_id and s.is_active
    where t.clock_out is null and t.review_status<>'rejected'
      and (_restaurant_id is null or t.restaurant_id=_restaurant_id)
      and exists(select 1 from public.shift_assignments x join public.shifts h on h.id=x.shift_id and h.restaurant_id=x.restaurant_id where x.restaurant_id=t.restaurant_id and x.staff_id=t.staff_id and x.status<>'released' and h.deleted_at is null and coalesce(x.starts_at,h.planned_start)<=t.clock_in+interval '4 hours' and coalesce(x.ends_at,h.planned_end)>t.clock_in and coalesce(x.ends_at,h.planned_end)+interval '15 minutes'<=now())
      and not exists(select 1 from public.staff_missing_punch_requests r where r.time_entry_id=t.id and r.origin='automatic')
    order by t.clock_in limit 500 for update of t skip locked loop
    select x.id,coalesce(x.ends_at,h.planned_end) as ends_at into a
      from public.shift_assignments x join public.shifts h on h.id=x.shift_id and h.restaurant_id=x.restaurant_id
      where x.restaurant_id=e.restaurant_id and x.staff_id=e.staff_id and x.status<>'released' and h.deleted_at is null
        and coalesce(x.starts_at,h.planned_start)<=e.clock_in+interval '4 hours'
        and coalesce(x.ends_at,h.planned_end)>e.clock_in
        and coalesce(x.starts_at,h.planned_start)<coalesce(x.ends_at,h.planned_end)
      order by abs(extract(epoch from (coalesce(x.starts_at,h.planned_start)-e.clock_in))) limit 1;
    if not found then continue; end if;
    _end:=a.ends_at;
    -- A continuous second assignment extends the workday rather than raising a false missing punch.
    loop
      select max(coalesce(x.ends_at,h.planned_end)) into _extended
      from public.shift_assignments x join public.shifts h on h.id=x.shift_id and h.restaurant_id=x.restaurant_id
      where x.restaurant_id=e.restaurant_id and x.staff_id=e.staff_id and x.status<>'released' and h.deleted_at is null
        and coalesce(x.starts_at,h.planned_start)<=_end+interval '15 minutes'
        and coalesce(x.ends_at,h.planned_end)>_end;
      exit when _extended is null; _end:=_extended;
    end loop;
    if _end+interval '15 minutes'>now() then continue; end if;
    insert into public.staff_missing_punch_requests(restaurant_id,staff_id,clock_in,clock_out,break_minutes,reason,origin,time_entry_id,assignment_id,scheduled_end)
      values(e.restaurant_id,e.staff_id,e.clock_in,_end,e.break_minutes,
        'No clock-out recorded after the scheduled shift and 15-minute grace period. HR must confirm missing punch or overtime.',
        'automatic',e.id,a.id,_end)
      on conflict(time_entry_id) where origin='automatic' do nothing returning id into _id;
    if _id is null then continue; end if;
    select name into _staff_name from public.staff where id=e.staff_id;
    for _recipient in select s.id from public.staff s where s.restaurant_id=e.restaurant_id and s.is_active and s.id<>e.staff_id
      and s.role::text in ('restaurant_admin','operations_manager','manager')
      and coalesce(s.permission_overrides->>'manage_shifts','true')<>'false' loop
      insert into public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key)
      values(e.restaurant_id,_recipient.id,'approval','Missing clock-out · HR review',
        coalesce(_staff_name,'Team member')||' has not clocked out. Confirm the actual end time or approve overtime.',
        'missing_punch_request',_id,'auto-clock-out:'||_id||':'||_recipient.id)
      on conflict(restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
    end loop;
    insert into public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key)
      values(e.restaurant_id,e.staff_id,'shift','Clock-out needs review',
        'Your shift has ended and no clock-out is recorded. If you are still working, clock out when finished; HR will review any overtime.',
        'missing_punch_request',_id,'auto-clock-out-staff:'||_id)
      on conflict(restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
    insert into public.audit_logs(restaurant_id,action,entity,entity_id,metadata)
      values(e.restaurant_id,'missing_clock_out_detected','staff_missing_punch_request',_id,jsonb_build_object('time_entry_id',e.id,'scheduled_end',_end,'grace_minutes',15));
    _count:=_count+1;
  end loop;
  return _count;
end; $$;
revoke all on function app.detect_missing_clock_outs(uuid) from public,anon,authenticated;

create or replace function app.sync_missing_clock_out_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.staff_missing_punch_requests set recorded_clock_out=new.clock_out,updated_at=now()
    where time_entry_id=new.id and origin='automatic' and status='pending';
  return new;
end; $$;
revoke all on function app.sync_missing_clock_out_evidence() from public,anon,authenticated;
create trigger sync_missing_clock_out_evidence after update of clock_out on public.staff_time_entries
  for each row when(old.clock_out is distinct from new.clock_out) execute function app.sync_missing_clock_out_evidence();

create or replace function public.review_automatic_clock_out(_request_id uuid,_resolution text,_clock_out timestamptz default null,_note text default null,_expected_clock_out timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.staff_missing_punch_requests%rowtype; e public.staff_time_entries%rowtype;
  _actor uuid; _before jsonb; _overtime integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into r from public.staff_missing_punch_requests where id=_request_id;
  if not found or not(app.has_capability(r.restaurant_id,'manage_shifts') or app.can_manage_restaurant(r.restaurant_id) or app.is_super_admin()) then
    raise exception 'HR shift management access required' using errcode='42501'; end if;
  select id into _actor from public.staff where auth_user_id=auth.uid() and restaurant_id=r.restaurant_id and is_active limit 1;
  if _actor=r.staff_id then raise exception 'Another HR reviewer must review your own attendance' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.staff_id::text,9101));
  select * into e from public.staff_time_entries where id=r.time_entry_id and restaurant_id=r.restaurant_id and staff_id=r.staff_id for update;
  select * into r from public.staff_missing_punch_requests where id=_request_id for update;
  if r.origin<>'automatic' or r.status<>'pending' or e.id is null then raise exception 'This automatic case is no longer pending' using errcode='22023'; end if;
  if _resolution is null or _resolution not in ('corrected_clock_out','overtime_approved','rejected') then raise exception 'Choose an HR decision' using errcode='22023'; end if;
  if char_length(btrim(coalesce(_note,''))) not between 3 and 500 then raise exception 'Add an HR review reason (3–500 characters)' using errcode='22023'; end if;
  if _resolution<>'rejected' then
    if e.clock_out is distinct from _expected_clock_out then raise exception 'Clock-out changed while reviewing. Reopen the case to see the latest punch.' using errcode='40001'; end if;
    if _clock_out is null or _clock_out<=e.clock_in or _clock_out>now()+interval '5 minutes' then raise exception 'Choose a valid actual end time, not a future time' using errcode='22023'; end if;
    if _resolution='corrected_clock_out' and _clock_out>r.scheduled_end then raise exception 'Use approve overtime for time after the scheduled end' using errcode='22023'; end if;
    if _resolution='overtime_approved' and _clock_out<=r.scheduled_end then raise exception 'Overtime must finish after the scheduled end' using errcode='22023'; end if;
    if exists(select 1 from public.staff_time_entries x where x.staff_id=e.staff_id and x.restaurant_id=e.restaurant_id and x.id<>e.id and e.clock_in<coalesce(x.clock_out,'infinity'::timestamptz) and _clock_out>x.clock_in) then
      raise exception 'This end time overlaps another attendance entry' using errcode='23P01'; end if;
    if e.break_minutes>=floor(extract(epoch from(_clock_out-e.clock_in))/60) then raise exception 'Break time exceeds the corrected work period' using errcode='22023'; end if;
    _before:=to_jsonb(e);
    _overtime:=case when _resolution='overtime_approved' then greatest(0,floor(extract(epoch from(_clock_out-r.scheduled_end))/60)::integer) else 0 end;
    update public.staff_time_entries set clock_out=_clock_out,approved_overtime_minutes=_overtime,review_status='approved',reviewed_by_staff_id=_actor,reviewed_at=now(),review_note=btrim(_note) where id=e.id;
    insert into public.staff_time_entry_corrections(restaurant_id,entry_id,actor_staff_id,action,previous,next,reason)
      values(r.restaurant_id,e.id,_actor,'correct',_before,jsonb_build_object('clock_out',_clock_out,'approved_overtime_minutes',_overtime,'resolution',_resolution),btrim(_note));
  end if;
  update public.staff_missing_punch_requests set status=case when _resolution='rejected' then 'rejected' else 'approved' end,
    resolution=_resolution,reviewed_by_staff_id=_actor,reviewed_at=now(),review_note=btrim(_note),updated_at=now() where id=r.id;
  insert into public.in_app_notifications(restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key)
    values(r.restaurant_id,r.staff_id,'shift',case _resolution when 'overtime_approved' then 'Overtime approved' when 'corrected_clock_out' then 'Clock-out corrected' else 'Clock-out case rejected' end,
      btrim(_note),'missing_punch_request',r.id,'auto-clock-out-result:'||r.id)
    on conflict(restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
    values(r.restaurant_id,auth.uid(),'automatic_clock_out_reviewed','staff_missing_punch_request',r.id,jsonb_build_object('resolution',_resolution,'time_entry_id',e.id,'clock_out',_clock_out,'approved_overtime_minutes',_overtime,'note',btrim(_note)));
  return e.id;
end; $$;
revoke all on function public.review_automatic_clock_out(uuid,text,timestamptz,text,timestamptz) from public,anon;
grant execute on function public.review_automatic_clock_out(uuid,text,timestamptz,text,timestamptz) to authenticated;

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

  if _r.origin='automatic' then raise exception 'Use the automatic HR clock-out review for this case' using errcode='22023'; end if;
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


select cron.schedule('quickserve-missing-clock-out-review','* * * * *','select app.detect_missing_clock_outs();');
notify pgrst,'reload schema';
commit;
