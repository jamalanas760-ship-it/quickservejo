begin;
do $$
declare r uuid; other uuid; hr uuid:=gen_random_uuid(); worker uuid; shift uuid; assignment uuid; uid uuid; n int; starts timestamptz; ends timestamptz; tz text:='Asia/Amman';
begin
  insert into public.restaurants(name,slug,seat_limit,timezone) values('QA reminders','qa-remind-'||gen_random_uuid(),30,tz) returning id into r;
  insert into public.restaurants(name,slug) values('QA other','qa-remind-other-'||gen_random_uuid()) returning id into other;
  insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,hr,'QA HR','hr');
  for n in 1..13 loop
    uid:=gen_random_uuid();
    insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,uid,'QA worker '||n,'waiter') returning id into worker;
    if n=4 then continue; end if; -- off day: no assignment
    starts:=now()-interval '6 minutes'; ends:=now()+interval '7 hours';
    if n=2 then starts:=now()-interval '4 minutes'; end if;
    if n in (6,7,8,12) then starts:=now()-interval '8 hours'; ends:=now()-interval '6 minutes'; end if;
    if n=7 then ends:=now()-interval '4 minutes'; end if;
    insert into public.shifts(restaurant_id,name,shift_date,planned_start,planned_end) values(r,'QA shift '||n,(starts at time zone tz)::date,starts,ends) returning id into shift;
    insert into public.shift_assignments(restaurant_id,staff_id,shift_id,starts_at,ends_at,status)
      values(r,worker,shift,starts,ends,case when n=9 then 'released' else 'scheduled' end) returning id into assignment;
    if n in (5,6,7,8,12) then
      insert into public.staff_time_entries(restaurant_id,staff_id,clock_in,clock_out)
        values(r,worker,starts,case when n=12 then ends else null end);
    end if;
    if n in (3,13) then
      insert into public.staff_leave_requests(restaurant_id,staff_id,start_date,end_date,start_time,end_time,reason,status,leave_type)
        values(r,worker,(now() at time zone tz)::date-1,(now() at time zone tz)::date+1,
          case when n=13 then '23:00'::time else null end,case when n=13 then '05:00'::time else null end,'Approved vacation','approved','annual');
    end if;
    if n=8 then
      insert into public.shifts(restaurant_id,name,shift_date,planned_start,planned_end) values(r,'QA consecutive',(now() at time zone tz)::date,ends,now()+interval '3 hours') returning id into shift;
      insert into public.shift_assignments(restaurant_id,staff_id,shift_id,starts_at,ends_at) values(r,worker,shift,ends,now()+interval '3 hours');
    end if;
    if n=10 then
      insert into public.staff_permission_requests(restaurant_id,staff_id,permission_type,request_date,expected_arrival_time,reason,status)
        values(r,worker,'lateness',(now() at time zone tz)::date,((now()+interval '30 minutes') at time zone tz)::time,'Approved later arrival','approved');
    end if;
    if n=11 then
      insert into public.staff_permission_requests(restaurant_id,staff_id,permission_type,request_date,start_time,end_time,reason,status)
        values(r,worker,'personal',(now() at time zone tz)::date,((now()-interval '1 hour') at time zone tz)::time,((now()+interval '1 hour') at time zone tz)::time,'Approved personal time','approved');
    end if;
  end loop;
  n:=app.send_attendance_reminders(r);
  if n<>2 then raise exception 'Expected only two reminders, got %',n; end if;
  if app.send_attendance_reminders(r)<>0 then raise exception 'Duplicate reminder'; end if;
  if not exists(select 1 from public.in_app_notifications x join public.staff s on s.id=x.staff_id where x.restaurant_id=r and s.name='QA worker 1' and x.title='Time to clock in') then raise exception 'Missing clock-in reminder'; end if;
  if not exists(select 1 from public.in_app_notifications x join public.staff s on s.id=x.staff_id where x.restaurant_id=r and s.name='QA worker 6' and x.title='Remember to clock out') then raise exception 'Missing clock-out reminder'; end if;
  perform set_config('request.jwt.claim.sub',hr::text,true);
  if not app.has_capability(r,'manage_shifts') then raise exception 'HR cannot manage workforce'; end if;
  if app.has_capability(r,'manage_staff') or app.has_capability(r,'manage_payments') or app.has_capability(r,'manage_restaurant') or app.has_capability(r,'update_order_status') or app.has_capability(other,'manage_shifts') then raise exception 'HR permission escalation'; end if;
  perform set_config('qa.restaurant',r::text,true);
  perform set_config('qa.other',other::text,true);
  if has_function_privilege('authenticated','app.send_attendance_reminders(uuid)','EXECUTE') or has_function_privilege('anon','app.send_attendance_reminders(uuid)','EXECUTE') then raise exception 'Public scheduler access'; end if;
  if not exists(select 1 from cron.job where jobname='quickserve-attendance-reminders' and active) then raise exception 'Scheduler inactive'; end if;
end; $$;
set local role authenticated;
do $$
begin
  if (select count(*) from public.staff where restaurant_id=current_setting('qa.restaurant')::uuid)<>14 then raise exception 'HR cannot read team roster'; end if;
  if exists(select 1 from public.staff where restaurant_id=current_setting('qa.other')::uuid) then raise exception 'HR read another branch'; end if;
end; $$;
reset role;
select 'PASS: 5-minute reminders, grace, off days, approved full/partial vacation, lateness, permission, completed punches, cancelled shifts, continuous shifts, dedupe, HR capability ceilings and tenant-scoped RLS' as result;
rollback;
