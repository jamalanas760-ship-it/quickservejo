begin;
do $$
declare r uuid; other uuid; manager uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid(); colleague uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); a uuid; b uuid; c uuid;
begin
 insert into auth.users(id) values(manager),(employee),(colleague),(outsider);
 insert into public.restaurants(name,slug,seat_limit) values('QA HR workspace','qa-hr-'||gen_random_uuid(),30) returning id into r;
 insert into public.restaurants(name,slug,seat_limit) values('QA other workspace','qa-hr-other-'||gen_random_uuid(),30) returning id into other;
 insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,manager,'QA Manager','hr');
 insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,employee,'QA Employee','waiter') returning id into a;
 insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,colleague,'QA Colleague','waiter') returning id into b;
 insert into public.staff(restaurant_id,auth_user_id,name,role) values(other,outsider,'QA Outsider','hr') returning id into c;
 perform set_config('qa.r',r::text,true);perform set_config('qa.other',other::text,true);perform set_config('qa.manager',manager::text,true);perform set_config('qa.employee',employee::text,true);perform set_config('qa.outsider',outsider::text,true);perform set_config('qa.a',a::text,true);perform set_config('qa.b',b::text,true);perform set_config('qa.c',c::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
do $$
begin
 insert into public.staff_employment_profiles(staff_id,restaurant_id,hired_on,department) values(current_setting('qa.a')::uuid,current_setting('qa.r')::uuid,'2024-06-06','Service'),(current_setting('qa.b')::uuid,current_setting('qa.r')::uuid,'2025-01-01','Kitchen');
 insert into public.staff_leave_accounts(staff_id,restaurant_id,year,leave_type,opening_days,entitlement_days,accrual_method,accrual_start,accrual_end,day_basis,workweek,hours_per_day) values(current_setting('qa.a')::uuid,current_setting('qa.r')::uuid,2026,'annual',2,24,'upfront','2026-01-01','2026-12-31','calendar',array[0,1,2,3,4],8);
 insert into public.staff_payslips(staff_id,restaurant_id,period,payment_date,currency,employee_name,income,deductions,status) values(current_setting('qa.a')::uuid,current_setting('qa.r')::uuid,'2026-09-01','2026-09-30','JOD','QA Employee','[{"label":"Basic","amount":800},{"label":"Allowance","amount":200}]','[{"label":"Deduction","amount":120}]','published'),(current_setting('qa.a')::uuid,current_setting('qa.r')::uuid,'2026-10-01',null,'JOD','QA Employee','[{"label":"Basic","amount":900}]','[]','draft'),(current_setting('qa.b')::uuid,current_setting('qa.r')::uuid,'2026-09-01','2026-09-30','JOD','QA Colleague','[{"label":"Basic","amount":700}]','[]','published');
 if (select net_pay from public.staff_payslips where staff_id=current_setting('qa.a')::uuid and status='published')<>880 then raise exception 'Incorrect database salary total';end if;
 if (select count(*) from public.staff_payslips)<>3 then raise exception 'Manager cannot read drafts or team slips';end if;
 begin update public.staff_payslips set income='[{"label":"Tampered","amount":1}]' where staff_id=current_setting('qa.a')::uuid and status='published';raise exception 'Published slip was mutable';exception when raise_exception then if SQLERRM not like 'Published salary slips are immutable%' then raise;end if;end;
 begin insert into public.staff_payslips(staff_id,restaurant_id,period,currency,employee_name,income) values(current_setting('qa.a')::uuid,current_setting('qa.r')::uuid,'2026-11-01','JOD','QA','[{"label":"Bad","amount":-1}]');raise exception 'Negative pay accepted';exception when check_violation then null;end;
 begin insert into public.staff_employment_profiles(staff_id,restaurant_id) values(current_setting('qa.c')::uuid,current_setting('qa.r')::uuid);raise exception 'Cross-tenant employee association accepted';exception when foreign_key_violation then null;end;
 begin insert into public.staff_employment_profiles(staff_id,restaurant_id) values(current_setting('qa.c')::uuid,current_setting('qa.other')::uuid);raise exception 'Cross-tenant manager write accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.employee'),true);
do $$ declare n integer;begin
 if (select count(*) from public.staff_employment_profiles)<>1 then raise exception 'Employee profile leak';end if;
 if (select count(*) from public.staff_leave_accounts)<>1 then raise exception 'Employee account missing';end if;
 if (select count(*) from public.staff_payslips)<>1 then raise exception 'Employee draft or colleague salary leak';end if;
 if exists(select 1 from public.staff_payslips where staff_id<>current_setting('qa.a')::uuid or status<>'published') then raise exception 'Employee scope bypass';end if;
 update public.staff_leave_accounts set entitlement_days=366 where staff_id=current_setting('qa.a')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Employee changed entitlement';end if;
 begin insert into public.staff_payslips(staff_id,restaurant_id,period,currency,employee_name,income) values(current_setting('qa.a')::uuid,current_setting('qa.r')::uuid,'2026-12-01','JOD','QA','[{"label":"Bad","amount":10}]');raise exception 'Employee published payroll';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.outsider'),true);
do $$ begin
 if exists(select 1 from public.staff_employment_profiles) or exists(select 1 from public.staff_leave_accounts) or exists(select 1 from public.staff_payslips) then raise exception 'Cross-tenant read leak';end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if exists(select 1 from public.staff_payslips) or exists(select 1 from public.staff_employment_profiles) then raise exception 'Unauthenticated claim read';end if;
 if has_table_privilege('anon','public.staff_payslips','select') or has_table_privilege('authenticated','public.staff_payslips','delete') then raise exception 'Excess table grants';end if;
end $$;
reset role;
select 'PASS: manager read/write, own published-only employee read, draft privacy, cross-tenant read/write denial, composite employee FK, salary totals, invalid amounts, immutable publication, no employee edits and no anonymous grants' as result;
rollback;
