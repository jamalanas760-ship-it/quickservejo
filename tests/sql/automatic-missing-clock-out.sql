-- Privileged QA session. Fixtures, notifications and decisions all roll back.
begin;
do $$
declare r uuid; r2 uuid; reviewer uuid:=gen_random_uuid(); reviewer_staff uuid; member uuid; user_id uuid;
  shift uuid; entry uuid; entries uuid[]:='{}'; requests uuid[]:='{}'; ids uuid[]:='{}'; c integer; n integer;
  starts timestamptz; ends timestamptz; req uuid; actual timestamptz; before_count integer;
begin
  insert into public.restaurants(name,slug,seat_limit) values('QA automatic clockout','qa-clockout-'||gen_random_uuid(),20) returning id into r;
  insert into public.restaurants(name,slug) values('QA unrelated branch','qa-clockout-other-'||gen_random_uuid()) returning id into r2;
  insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,reviewer,'QA HR reviewer','restaurant_admin') returning id into reviewer_staff;
  for c in 1..9 loop
    user_id:=gen_random_uuid();
    insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,user_id,'QA worker '||c,'waiter') returning id into member;
    ids:=array_append(ids,member);
    starts:=now()-interval '8 hours'; ends:=now()-interval '1 hour';
    if c=2 then ends:=now()-interval '10 minutes'; end if;
    if c=6 then starts:=now()-interval '12 hours'; end if;
    insert into public.staff_time_entries(restaurant_id,staff_id,clock_in,clock_out)
      values(r,member,starts,case when c=4 then ends else null end) returning id into entry;
    entries:=array_append(entries,entry);
    if c=7 then continue; end if;
    insert into public.shifts(restaurant_id,name,shift_date,planned_start,planned_end)
      values(r,'QA shift',starts::date,starts,ends) returning id into shift;
    insert into public.shift_assignments(restaurant_id,shift_id,staff_id,starts_at,ends_at,status)
      values(r,shift,member,starts,ends,case when c=5 then 'released' else 'scheduled' end);
    if c=3 then
      insert into public.shifts(restaurant_id,name,shift_date,planned_start,planned_end)
        values(r,'QA continuous second shift',ends::date,ends,now()+interval '1 hour') returning id into shift;
      insert into public.shift_assignments(restaurant_id,shift_id,staff_id,starts_at,ends_at)
        values(r,shift,member,ends,now()+interval '1 hour');
    end if;
  end loop;
  n:=app.detect_missing_clock_outs(r);
  if n<>4 then raise exception 'Expected four overdue cases, got %',n; end if;
  if app.detect_missing_clock_outs(r)<>0 then raise exception 'Detection duplicated cases'; end if;
  if exists(select 1 from public.staff_time_entries where id=any(entries) and id<>entries[4] and clock_out is not null) then raise exception 'Detection changed attendance'; end if;
  if (select count(*) from public.in_app_notifications where restaurant_id=r and kind='approval' and staff_id=reviewer_staff)<>4 then raise exception 'HR did not receive four alerts'; end if;
  if exists(select 1 from public.staff_missing_punch_requests where restaurant_id=r2) then raise exception 'Cross-branch detection'; end if;
  perform set_config('request.jwt.claim.sub',reviewer::text,true);
  select id into req from public.staff_missing_punch_requests where time_entry_id=entries[1];
  begin perform public.review_missing_punch_request(req,'approved','wrong workflow'); raise exception 'Legacy approval bypassed automatic workflow'; exception when sqlstate '22023' then null; end;
  begin perform public.review_automatic_clock_out(req,'corrected_clock_out',now()-interval '1 hour',''); raise exception 'Reason not required'; exception when sqlstate '22023' then null; end;
  begin perform public.review_automatic_clock_out(req,'corrected_clock_out',now()+interval '1 hour','Verified departure'); raise exception 'Future clockout accepted'; exception when sqlstate '22023' then null; end;
  perform public.review_automatic_clock_out(req,'corrected_clock_out',now()-interval '1 hour','Supervisor confirmed departure');
  if (select clock_out from public.staff_time_entries where id=entries[1]) is distinct from now()-interval '1 hour' then raise exception 'Correction did not close original entry'; end if;
  if (select count(*) from public.staff_time_entries where staff_id=ids[1])<>1 then raise exception 'Correction duplicated attendance'; end if;
  begin perform public.review_automatic_clock_out(req,'corrected_clock_out',now()-interval '1 hour','Duplicate review'); raise exception 'Duplicate review accepted'; exception when sqlstate '22023' then null; end;
  select id into req from public.staff_missing_punch_requests where time_entry_id=entries[6];
  actual:=now()-interval '15 minutes';
  update public.staff_time_entries set clock_out=actual where id=entries[6];
  if (select recorded_clock_out from public.staff_missing_punch_requests where id=req) is distinct from actual then raise exception 'Late clock-out evidence lost'; end if;
  begin perform public.review_automatic_clock_out(req,'overtime_approved',actual,'Confirmed overtime',null); raise exception 'Concurrent employee clockout was overwritten'; exception when sqlstate '40001' then null; end;
  perform public.review_automatic_clock_out(req,'overtime_approved',actual,'Supervisor verified extra work',actual);
  if (select approved_overtime_minutes from public.staff_time_entries where id=entries[6])<>45 then raise exception 'Expected 45 approved overtime minutes'; end if;
  select id into req from public.staff_missing_punch_requests where time_entry_id=entries[8];
  perform public.review_automatic_clock_out(req,'rejected',null,'Not accepted; original punch retained');
  if (select clock_out from public.staff_time_entries where id=entries[8]) is not null then raise exception 'Reject changed attendance'; end if;
  if app.detect_missing_clock_outs(r)<>0 then raise exception 'Reject caused repeated alerts'; end if;
  select id into req from public.staff_missing_punch_requests where time_entry_id=entries[9];
  update public.staff set role='manager' where id=ids[9];
  select auth_user_id into user_id from public.staff where id=ids[9];
  perform set_config('request.jwt.claim.sub',user_id::text,true);
  begin perform public.review_automatic_clock_out(req,'rejected',null,'Self review'); raise exception 'Self review accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.review_automatic_clock_out(req,'rejected',null,'Unauthenticated'); raise exception 'Unauthenticated accepted'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin perform public.review_automatic_clock_out(req,'rejected',null,'Outside tenant'); raise exception 'Unrelated user accepted'; exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.review_automatic_clock_out(uuid,text,timestamptz,text,timestamptz)','execute') or has_function_privilege('authenticated','app.detect_missing_clock_outs(uuid)','execute') then raise exception 'Privileged function exposed'; end if;
  if not exists(select 1 from cron.job where jobname='quickserve-missing-clock-out-review' and active) then raise exception 'Automatic job not active'; end if;
end $$;
select 'PASS: detection, grace, continuous shifts, overnight, already clocked out, cancelled/unscheduled skips, deduped HR notifications, original-entry correction, overtime, rejection, race protection, self-review/auth/tenant guards, scheduler' as result;
rollback;
