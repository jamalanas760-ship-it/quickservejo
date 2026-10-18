begin;
do $$ declare r uuid;other uuid;mgr uuid:=gen_random_uuid();emp uuid:=gen_random_uuid();a uuid;b uuid;begin
 insert into auth.users(id) values(mgr),(emp);
 insert into public.restaurants(name,slug,seat_limit,timezone) values('QA recurring HR','qa-hr-auto-'||gen_random_uuid(),30,'Asia/Amman') returning id into r;
 insert into public.restaurants(name,slug) values('QA other','qa-hr-auto-other-'||gen_random_uuid()) returning id into other;
 insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,mgr,'QA Manager','hr');
 insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,emp,'QA Employee','waiter') returning id into a;
 insert into public.staff(restaurant_id,auth_user_id,name,role) values(r,gen_random_uuid(),'QA Partial','waiter') returning id into b;
 perform set_config('qa.r',r::text,true);perform set_config('qa.other',other::text,true);perform set_config('qa.mgr',mgr::text,true);perform set_config('qa.emp',emp::text,true);perform set_config('qa.a',a::text,true);perform set_config('qa.b',b::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('qa.mgr'),true);
do $$ declare h jsonb;result jsonb;this_month date:=date_trunc('month',now() at time zone 'Asia/Amman')::date;this_year int:=extract(year from this_month);begin
 h:=jsonb_build_object('currency','JOD','income','[{"label":"Basic","amount":800},{"label":"Allowance","amount":150}]'::jsonb,'deductions','[{"label":"Deduction","amount":70}]'::jsonb,'payroll_enabled',true,'payroll_start',make_date(this_year-1,1,1),'generate_day',1,'salary_proration','full_month','leave_enabled',true,'leave_start_year',this_year-1,'annual_days',24,'sick_days',12,'annual_opening',2,'sick_opening',1,'annual_accrual','daily','sick_accrual','upfront','day_basis','workdays','workweek','[0,1,2,3,4]'::jsonb,'hours_per_day',8);
 result:=public.save_staff_hr_setup(current_setting('qa.a')::uuid,jsonb_build_object('hired_on',make_date(this_year-2,6,6),'department','Service'),h);
 if (result->>'drafts_created')::int<>1 or (result->>'accounts_created')::int<>2 then raise exception 'Save did not generate due records: %',result;end if;
 if (select net_pay from public.staff_payslips where staff_id=current_setting('qa.a')::uuid)<>880 then raise exception 'Wrong recurring salary';end if;
 if exists(select 1 from public.staff_payslips where staff_id=current_setting('qa.a')::uuid and (status<>'draft' or published_at is not null or payment_date is not null)) then raise exception 'Automatic publication or payment';end if;
 if exists(select 1 from public.staff_leave_accounts where staff_id=current_setting('qa.a')::uuid and opening_days<>0) then raise exception 'Opening repeated into later year';end if;
 update public.staff_payslips set status='published',payment_date=this_month where staff_id=current_setting('qa.a')::uuid and period=this_month;
 result:=public.generate_hr_drafts(current_setting('qa.r')::uuid,this_month);
 if result<>jsonb_build_object('drafts_created',0,'accounts_created',0) then raise exception 'Duplicate generation: %',result;end if;
 perform public.generate_hr_drafts(current_setting('qa.r')::uuid,make_date(this_year-1,1,1));
 if (select opening_days from public.staff_leave_accounts where staff_id=current_setting('qa.a')::uuid and year=this_year-1 and leave_type='annual')<>2 then raise exception 'Initial opening missing';end if;
 h:=h||jsonb_build_object('income','[{"label":"Changed","amount":1000}]'::jsonb,'annual_days',30);
 perform public.save_staff_hr_setup(current_setting('qa.a')::uuid,jsonb_build_object('hired_on',make_date(this_year-2,6,6)),h);
 if (select net_pay from public.staff_payslips where staff_id=current_setting('qa.a')::uuid and period=this_month)<>880 then raise exception 'Existing draft overwritten';end if;
 if (select entitlement_days from public.staff_leave_accounts where staff_id=current_setting('qa.a')::uuid and year=this_year and leave_type='annual')<>24 then raise exception 'Existing policy overwritten';end if;
 h:=h||jsonb_build_object('salary_proration','calendar_days','annual_days',24,'leave_start_year',this_year,'generate_day',1);
 perform public.save_staff_hr_setup(current_setting('qa.b')::uuid,jsonb_build_object('hired_on',this_month+14),h);
 if (select net_pay from public.staff_payslips where staff_id=current_setting('qa.b')::uuid and period=this_month)<>round(1000*((this_month+interval '1 month - 1 day')::date-(this_month+14)+1)::numeric/((this_month+interval '1 month - 1 day')::date-this_month+1),3)-round(70*((this_month+interval '1 month - 1 day')::date-(this_month+14)+1)::numeric/((this_month+interval '1 month - 1 day')::date-this_month+1),3) then raise exception 'Partial employment month salary wrong';end if;
 if (select entitlement_days from public.staff_leave_accounts where staff_id=current_setting('qa.b')::uuid and year=this_year and leave_type='annual')<>round(24*(make_date(this_year,12,31)-(this_month+14)+1)::numeric/(make_date(this_year+1,1,1)-make_date(this_year,1,1)),4) then raise exception 'Partial employment annual accrual wrong';end if;
 if app.hr_pay_total(app.hr_scaled_pay_items('[{"label":"A","amount":0.001},{"label":"B","amount":0.001}]',0.5))<>0.001 then raise exception 'Proration rounding drifts';end if;
 -- A later invalid row must roll back the earlier import update and generated records.
 begin
  perform public.import_staff_hr_setups(current_setting('qa.r')::uuid,jsonb_build_array(
   jsonb_build_object('staff_id',current_setting('qa.a'),'employment',jsonb_build_object('hired_on',make_date(this_year-2,6,6),'department','Must roll back'),'setup',h),
   jsonb_build_object('staff_id',current_setting('qa.b'),'employment',jsonb_build_object('hired_on',this_month+14),'setup',h||jsonb_build_object('currency','INVALID'))));
  raise exception 'Invalid batch accepted';
 exception when check_violation then null;end;
 if exists(select 1 from public.staff_employment_profiles where department='Must roll back') then raise exception 'Partial import committed';end if;
 result:=public.import_staff_hr_setups(current_setting('qa.r')::uuid,jsonb_build_array(jsonb_build_object('staff_id',current_setting('qa.a'),'employment',jsonb_build_object('hired_on',make_date(this_year-2,6,6),'department','Imported'),'setup',h)));
 if (result->>'imported')::int<>1 or not exists(select 1 from public.staff_employment_profiles where staff_id=current_setting('qa.a')::uuid and department='Imported') then raise exception 'Valid import failed';end if;
 begin perform public.generate_hr_drafts(current_setting('qa.other')::uuid,this_month);raise exception 'Cross-tenant generation allowed';exception when raise_exception then if SQLERRM not like 'Not authorized%' then raise;end if;end;
 begin perform public.save_staff_hr_setup(current_setting('qa.a')::uuid,'{}',h);raise exception 'Unknown joining date accepted';exception when raise_exception then if SQLERRM not like 'Set the real joining date%' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.emp'),true);
do $$ begin
 if exists(select 1 from public.staff_hr_setups) then raise exception 'Employee read private recurring setup';end if;
 if exists(select 1 from public.staff_payslips where status<>'published' or staff_id<>current_setting('qa.a')::uuid) then raise exception 'Employee read generated drafts or colleague records';end if;
 if has_function_privilege('authenticated','app.run_hr_automation()','execute') or has_function_privilege('anon','public.generate_hr_drafts(uuid,date)','execute') then raise exception 'Scheduler or anonymous execution exposed';end if;
 begin perform public.generate_hr_drafts(current_setting('qa.r')::uuid,date_trunc('month',now())::date);raise exception 'Employee generation allowed';exception when raise_exception then if SQLERRM not like 'Not authorized%' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select app.run_hr_automation();
select 'PASS: atomic setup, monthly drafts, daily leave proration, rollover, no duplicate records, no overwritten drafts/accounts, salary precision, employee privacy and tenant-scoped execution' as result;
rollback;
