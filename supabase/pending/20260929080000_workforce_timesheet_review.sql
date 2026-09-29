-- STAGED: apply after the Workforce foundation migrations (staff_time_entries) exist on the live backend.
-- Additive timesheet review + correction audit trail.
alter table public.staff_time_entries
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_by_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;
do $$ begin
  alter table public.staff_time_entries add constraint staff_time_entries_review_status_chk check (review_status in ('pending','approved','rejected'));
exception when duplicate_object then null; end $$;

create table if not exists public.staff_time_entry_corrections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  entry_id uuid not null references public.staff_time_entries(id) on delete cascade,
  actor_staff_id uuid references public.staff(id) on delete set null,
  action text not null check (action in ('correct','approve','reject','reopen')),
  previous jsonb not null default '{}'::jsonb,
  next jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists staff_time_entry_corrections_entry_idx on public.staff_time_entry_corrections(entry_id, created_at desc);
grant select on public.staff_time_entry_corrections to authenticated;
grant all on public.staff_time_entry_corrections to service_role;
alter table public.staff_time_entry_corrections enable row level security;
create policy staff_time_entry_corrections_select on public.staff_time_entry_corrections for select to authenticated using (
  app.has_capability(restaurant_id,'manage_shifts')
  or exists (select 1 from public.staff_time_entries e join public.staff s on s.id=e.staff_id where e.id=entry_id and s.auth_user_id=(select auth.uid()))
);

create or replace function public.review_time_entry(_entry_id uuid, _action text, _note text default null,
  _clock_in timestamptz default null, _clock_out timestamptz default null, _break_minutes integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  _e public.staff_time_entries%rowtype;
  _actor uuid;
begin
  select * into _e from public.staff_time_entries where id=_entry_id for update;
  if not found then raise exception 'Time entry not found'; end if;
  if not app.has_capability(_e.restaurant_id,'manage_shifts') then raise exception 'Not allowed'; end if;
  select id into _actor from public.staff where auth_user_id=auth.uid() and restaurant_id=_e.restaurant_id limit 1;
  if _action = 'correct' then
    if _e.review_status='approved' then raise exception 'Approved timesheet is locked; reopen it first'; end if;
    if coalesce(trim(_note),'')='' then raise exception 'A correction reason is required'; end if;
    if coalesce(_clock_out,_e.clock_out) is not null and coalesce(_clock_out,_e.clock_out) <= coalesce(_clock_in,_e.clock_in) then raise exception 'Clock-out must be after clock-in'; end if;
    if coalesce(_break_minutes,0) < 0 then raise exception 'Break minutes cannot be negative'; end if;
    update public.staff_time_entries set clock_in=coalesce(_clock_in,clock_in), clock_out=coalesce(_clock_out,clock_out),
      break_minutes=coalesce(_break_minutes,break_minutes) where id=_entry_id;
  elsif _action in ('approve','reject') then
    if _e.clock_out is null then raise exception 'Entry is still open'; end if;
    update public.staff_time_entries set review_status=case when _action='approve' then 'approved' else 'rejected' end,
      reviewed_by_staff_id=_actor, reviewed_at=now(), review_note=_note where id=_entry_id;
  elsif _action = 'reopen' then
    if not app.has_capability(_e.restaurant_id,'manage_staff') then raise exception 'Only admins can reopen timesheets'; end if;
    update public.staff_time_entries set review_status='pending', reviewed_by_staff_id=null, reviewed_at=null where id=_entry_id;
  else
    raise exception 'Unknown action';
  end if;
  insert into public.staff_time_entry_corrections(restaurant_id,entry_id,actor_staff_id,action,previous,next,reason)
  select _e.restaurant_id,_entry_id,_actor,_action,
    jsonb_build_object('clock_in',_e.clock_in,'clock_out',_e.clock_out,'break_minutes',_e.break_minutes,'review_status',_e.review_status),
    to_jsonb(n), coalesce(_note,'')
  from (select clock_in,clock_out,break_minutes,review_status from public.staff_time_entries where id=_entry_id) n;
end $$;
revoke all on function public.review_time_entry(uuid,text,text,timestamptz,timestamptz,integer) from public, anon;
grant execute on function public.review_time_entry(uuid,text,text,timestamptz,timestamptz,integer) to authenticated;
