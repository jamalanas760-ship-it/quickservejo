begin;

alter table public.staff_time_entries
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_by_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

do $$ begin
  alter table public.staff_time_entries
    add constraint staff_time_entries_review_status_chk
    check (review_status in ('pending','approved','rejected'));
exception when duplicate_object then null; end $$;

create table if not exists public.staff_time_entry_corrections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  entry_id uuid not null references public.staff_time_entries(id) on delete cascade,
  actor_staff_id uuid references public.staff(id) on delete set null,
  action text not null,
  previous jsonb not null default '{}'::jsonb,
  next jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.staff_time_entry_corrections
  drop constraint if exists staff_time_entry_corrections_action_check;
alter table public.staff_time_entry_corrections
  add constraint staff_time_entry_corrections_action_check
  check (action in ('correct','approve','reject','reopen','create_missing'));

create index if not exists staff_time_entry_corrections_entry_idx
  on public.staff_time_entry_corrections(entry_id, created_at desc);

grant select on public.staff_time_entry_corrections to authenticated;
grant all on public.staff_time_entry_corrections to service_role;
alter table public.staff_time_entry_corrections enable row level security;

drop policy if exists staff_time_entry_corrections_select on public.staff_time_entry_corrections;
create policy staff_time_entry_corrections_select
on public.staff_time_entry_corrections
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_shifts')
  or exists (
    select 1
    from public.staff_time_entries e
    join public.staff s on s.id=e.staff_id
    where e.id=entry_id and s.auth_user_id=(select auth.uid())
  )
);

create or replace function public.review_time_entry(
  _entry_id uuid,
  _action text,
  _note text default null,
  _clock_in timestamptz default null,
  _clock_out timestamptz default null,
  _break_minutes integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _e public.staff_time_entries%rowtype;
  _actor uuid;
begin
  select * into _e
  from public.staff_time_entries
  where id=_entry_id
  for update;

  if not found then raise exception 'Time entry not found'; end if;
  if not app.has_capability(_e.restaurant_id,'manage_shifts') then raise exception 'Not allowed'; end if;

  select id into _actor
  from public.staff
  where auth_user_id=auth.uid()
    and restaurant_id=_e.restaurant_id
    and is_active
  limit 1;

  if _action='correct' then
    if _e.review_status='approved' then
      raise exception 'Approved timesheet is locked; reopen it first';
    end if;
    if coalesce(trim(_note),'')='' then raise exception 'A correction reason is required'; end if;
    if coalesce(_clock_out,_e.clock_out) is not null
       and coalesce(_clock_out,_e.clock_out) <= coalesce(_clock_in,_e.clock_in) then
      raise exception 'Clock-out must be after clock-in';
    end if;
    if coalesce(_break_minutes,_e.break_minutes,0) < 0 then
      raise exception 'Break minutes cannot be negative';
    end if;

    update public.staff_time_entries
    set clock_in=coalesce(_clock_in,clock_in),
        clock_out=coalesce(_clock_out,clock_out),
        break_minutes=coalesce(_break_minutes,break_minutes),
        review_status='pending',
        reviewed_by_staff_id=null,
        reviewed_at=null,
        review_note=_note
    where id=_entry_id;

  elsif _action in ('approve','reject') then
    if _e.clock_out is null then raise exception 'Entry is still open'; end if;
    update public.staff_time_entries
    set review_status=case when _action='approve' then 'approved' else 'rejected' end,
        reviewed_by_staff_id=_actor,
        reviewed_at=now(),
        review_note=_note
    where id=_entry_id;

  elsif _action='reopen' then
    if not app.has_capability(_e.restaurant_id,'manage_staff') then
      raise exception 'Only admins can reopen timesheets';
    end if;
    update public.staff_time_entries
    set review_status='pending',
        reviewed_by_staff_id=null,
        reviewed_at=null,
        review_note=_note
    where id=_entry_id;

  else
    raise exception 'Unknown action';
  end if;

  insert into public.staff_time_entry_corrections(
    restaurant_id,entry_id,actor_staff_id,action,previous,next,reason
  )
  select
    _e.restaurant_id,_entry_id,_actor,_action,
    jsonb_build_object(
      'clock_in',_e.clock_in,
      'clock_out',_e.clock_out,
      'break_minutes',_e.break_minutes,
      'review_status',_e.review_status
    ),
    to_jsonb(n),
    coalesce(_note,'')
  from (
    select clock_in,clock_out,break_minutes,review_status
    from public.staff_time_entries
    where id=_entry_id
  ) n;
end;
$$;

revoke all on function public.review_time_entry(uuid,text,text,timestamptz,timestamptz,integer)
from public,anon;
grant execute on function public.review_time_entry(uuid,text,text,timestamptz,timestamptz,integer)
to authenticated,service_role;

create or replace function public.create_missing_time_entry(
  _restaurant_id uuid,
  _staff_id uuid,
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
  _entry_id uuid;
  _actor uuid;
  _duration_minutes integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not (
    app.can_manage_restaurant(_restaurant_id)
    or app.has_capability(_restaurant_id,'manage_shifts')
    or app.is_super_admin()
  ) then
    raise exception 'Shift management access is required' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.staff s
    where s.id=_staff_id
      and s.restaurant_id=_restaurant_id
      and s.is_active
  ) then
    raise exception 'Active staff member not found' using errcode='22023';
  end if;

  if _clock_in is null or _clock_out is null or _clock_out <= _clock_in then
    raise exception 'Clock-out must be after clock-in' using errcode='22023';
  end if;

  if _clock_in > now()+interval '5 minutes'
     or _clock_out > now()+interval '5 minutes' then
    raise exception 'Missing punches cannot be created in the future' using errcode='22023';
  end if;

  _duration_minutes := floor(extract(epoch from (_clock_out-_clock_in))/60)::integer;
  if _duration_minutes > 2160 then
    raise exception 'Time entry cannot exceed 36 hours' using errcode='22023';
  end if;

  if coalesce(_break_minutes,0) < 0
     or coalesce(_break_minutes,0) >= _duration_minutes then
    raise exception 'Break minutes must be shorter than the worked time' using errcode='22023';
  end if;

  if nullif(btrim(coalesce(_reason,'')),'') is null then
    raise exception 'A reason is required' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(_staff_id::text, 9102));

  if exists (
    select 1
    from public.staff_time_entries e
    where e.restaurant_id=_restaurant_id
      and e.staff_id=_staff_id
      and _clock_in < coalesce(e.clock_out,'infinity'::timestamptz)
      and _clock_out > e.clock_in
  ) then
    raise exception 'This missing punch overlaps an existing time entry' using errcode='23P01';
  end if;

  select s.id into _actor
  from public.staff s
  where s.restaurant_id=_restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  limit 1;

  insert into public.staff_time_entries(
    restaurant_id,staff_id,clock_in,clock_out,break_minutes,notes,review_status,review_note
  )
  values(
    _restaurant_id,_staff_id,_clock_in,_clock_out,coalesce(_break_minutes,0),
    btrim(_reason),'pending',btrim(_reason)
  )
  returning id into _entry_id;

  insert into public.staff_time_entry_corrections(
    restaurant_id,entry_id,actor_staff_id,action,previous,next,reason
  )
  values(
    _restaurant_id,_entry_id,_actor,'create_missing','{}'::jsonb,
    jsonb_build_object(
      'staff_id',_staff_id,
      'clock_in',_clock_in,
      'clock_out',_clock_out,
      'break_minutes',coalesce(_break_minutes,0),
      'review_status','pending'
    ),
    btrim(_reason)
  );

  insert into public.audit_logs(
    restaurant_id,actor_user_id,action,entity,entity_id,metadata
  )
  values(
    _restaurant_id,auth.uid(),'missing_punch_created','staff_time_entry',_entry_id,
    jsonb_build_object(
      'staff_id',_staff_id,
      'clock_in',_clock_in,
      'clock_out',_clock_out,
      'break_minutes',coalesce(_break_minutes,0),
      'reason',btrim(_reason)
    )
  );

  return _entry_id;
end;
$$;

revoke all on function public.create_missing_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text)
from public,anon;
grant execute on function public.create_missing_time_entry(uuid,uuid,timestamptz,timestamptz,integer,text)
to authenticated,service_role;

notify pgrst,'reload schema';
commit;
