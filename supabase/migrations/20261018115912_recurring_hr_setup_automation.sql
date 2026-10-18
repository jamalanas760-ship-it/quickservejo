-- One-time recurring setup. No employee salary or policy values are seeded.
create table public.staff_hr_setups (
 staff_id uuid primary key, restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 currency text not null check(currency ~ '^[A-Z]{3}$'), income jsonb not null default '[]' check(app.hr_pay_items_valid(income)), deductions jsonb not null default '[]' check(app.hr_pay_items_valid(deductions)),
 payroll_enabled boolean not null default false, payroll_start date not null check(extract(day from payroll_start)=1), generate_day smallint not null check(generate_day between 1 and 28),
 salary_proration text not null check(salary_proration in ('full_month','calendar_days')),
 leave_enabled boolean not null default false, leave_start_year int not null check(leave_start_year between 2000 and 2200),
 annual_days numeric(9,4) not null check(annual_days between 0 and 366), sick_days numeric(9,4) not null check(sick_days between 0 and 366),
 annual_opening numeric(9,4) not null check(annual_opening between -10000 and 10000), sick_opening numeric(9,4) not null check(sick_opening between -10000 and 10000),
 annual_accrual text not null check(annual_accrual in ('upfront','daily')), sick_accrual text not null check(sick_accrual in ('upfront','daily')),
 day_basis text not null check(day_basis in ('calendar','workdays')), workweek smallint[] not null check(workweek <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(workweek) between 1 and 7),
 hours_per_day numeric(5,2) not null check(hours_per_day>0 and hours_per_day<=24),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 foreign key(staff_id,restaurant_id) references public.staff(id,restaurant_id) on delete cascade,
 check(not payroll_enabled or (jsonb_array_length(income)>0 and app.hr_pay_total(income)>=app.hr_pay_total(deductions)))
);
alter table public.staff_hr_setups enable row level security;
revoke all on public.staff_hr_setups from anon,authenticated;
grant select on public.staff_hr_setups to authenticated;
create policy hr_setup_manager_read on public.staff_hr_setups for select to authenticated using (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts'));
create index staff_hr_setups_tenant_staff_idx on public.staff_hr_setups(restaurant_id,staff_id);
create index staff_hr_setups_staff_tenant_idx on public.staff_hr_setups(staff_id,restaurant_id);
create index staff_hr_setups_actor_idx on public.staff_hr_setups(updated_by);
create trigger hr_setup_guard before insert or update on public.staff_hr_setups for each row execute function app.hr_record_guard();
-- Writes go through an invoker RPC for atomic employment + recurring setup. RLS stays the boundary.
grant insert,update on public.staff_hr_setups to authenticated;
create policy hr_setup_manager_insert on public.staff_hr_setups for insert to authenticated with check(app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts'));
create policy hr_setup_manager_update on public.staff_hr_setups for update to authenticated using(app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts')) with check(app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,'manage_shifts'));

create function app.hr_scaled_pay_items(items jsonb,fraction numeric) returns jsonb language sql immutable security invoker set search_path='' as $$
 with amounts as (select i,ord,(i->>'amount')::numeric amount from jsonb_array_elements(items) with ordinality a(i,ord)), running as (select *,sum(amount) over(order by ord) cumulative from amounts)
 select coalesce(jsonb_agg(jsonb_build_object('label',i->>'label','amount',round(cumulative*fraction,3)-round((cumulative-amount)*fraction,3)) order by ord),'[]'::jsonb) from running;
$$;
revoke all on function app.hr_scaled_pay_items(jsonb,numeric) from public,anon;
grant execute on function app.hr_scaled_pay_items(jsonb,numeric) to authenticated;
create function app.generate_hr_records(_restaurant uuid,_period date,_automatic boolean default false,_staff uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare x record; y int:=extract(year from _period); last_day date; first_day date; a_start date; a_end date; fraction numeric; quota numeric; k text; method text; result_count int:=0; account_count int:=0; n int; local_today date;
begin
 if current_user not in ('postgres','supabase_admin') and not (app.has_restaurant_access(_restaurant) and app.has_capability(_restaurant,'manage_shifts')) then raise exception 'Not authorized';end if;
 select (now() at time zone coalesce((select name from pg_timezone_names where name=r.timezone),'UTC'))::date into local_today from public.restaurants r where r.id=_restaurant;
 if _period is null or extract(day from _period)<>1 or _period>local_today or y not between 2000 and 2200 then raise exception 'Choose a current or past payroll month';end if;
 first_day:=_period; last_day:=(_period+interval '1 month - 1 day')::date;
 for x in select h.*,s.name,p.employee_number,p.department,p.job_title,p.hired_on,p.ended_on from public.staff_hr_setups h join public.staff s on s.id=h.staff_id and s.restaurant_id=h.restaurant_id join public.staff_employment_profiles p on p.staff_id=s.id and p.restaurant_id=s.restaurant_id where h.restaurant_id=_restaurant and s.is_active and p.hired_on is not null and (_staff is null or s.id=_staff) loop
  a_start:=greatest(make_date(y,1,1),x.hired_on);a_end:=least(make_date(y,12,31),coalesce(x.ended_on,make_date(y,12,31)));
  if x.leave_enabled and y>=x.leave_start_year and a_start<=a_end then
   foreach k in array array['annual','sick'] loop
    method:=case when k='annual' then x.annual_accrual else x.sick_accrual end;
    quota:=case when k='annual' then x.annual_days else x.sick_days end;
    if method='daily' then quota:=round(quota*(a_end-a_start+1)::numeric/(make_date(y+1,1,1)-make_date(y,1,1)),4);end if;
    insert into public.staff_leave_accounts(staff_id,restaurant_id,year,leave_type,opening_days,entitlement_days,accrual_method,accrual_start,accrual_end,day_basis,workweek,hours_per_day)
     values(x.staff_id,_restaurant,y,k,case when y=x.leave_start_year then case when k='annual' then x.annual_opening else x.sick_opening end else 0 end,quota,method,a_start,a_end,x.day_basis,x.workweek,x.hours_per_day)
     on conflict(staff_id,year,leave_type) do nothing;
    get diagnostics n=row_count;account_count:=account_count+n;
   end loop;
  end if;
  if x.payroll_enabled and _period>=x.payroll_start and x.hired_on<=last_day and (x.ended_on is null or x.ended_on>=first_day) and (not _automatic or extract(day from local_today)>=x.generate_day) then
   fraction:=case when x.salary_proration='calendar_days' then (least(last_day,coalesce(x.ended_on,last_day))-greatest(first_day,x.hired_on)+1)::numeric/(last_day-first_day+1) else 1 end;
   insert into public.staff_payslips(staff_id,restaurant_id,period,currency,employee_name,employee_number,department,job_title,income,deductions,status,notes)
    values(x.staff_id,_restaurant,_period,x.currency,x.name,x.employee_number,x.department,x.job_title,
     app.hr_scaled_pay_items(x.income,fraction),app.hr_scaled_pay_items(x.deductions,fraction),'draft',
     'Generated from recurring setup. '||case when x.salary_proration='calendar_days' then 'All recurring items prorated by calendar employment days.' else 'Full monthly recurring amounts; no attendance-based deductions.' end)
    on conflict(staff_id,period) do nothing;
   get diagnostics n=row_count;result_count:=result_count+n;
  end if;
 end loop;
 return jsonb_build_object('drafts_created',result_count,'accounts_created',account_count);
end $$;
revoke all on function app.generate_hr_records(uuid,date,boolean,uuid) from public,anon;
grant execute on function app.generate_hr_records(uuid,date,boolean,uuid) to authenticated;

create function public.save_staff_hr_setup(_staff_id uuid,_employment jsonb,_setup jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r uuid; h public.staff_hr_setups; today date;
begin
 select restaurant_id into r from public.staff where id=_staff_id;
 if r is null or not(app.has_restaurant_access(r) and app.has_capability(r,'manage_shifts')) then raise exception 'Not authorized';end if;
 h:=jsonb_populate_record(null::public.staff_hr_setups,_setup);
 if (h.payroll_enabled or h.leave_enabled) and nullif(_employment->>'hired_on','') is null then raise exception 'Set the real joining date before enabling automation';end if;
 insert into public.staff_employment_profiles(staff_id,restaurant_id,employee_number,department,job_title,hired_on,ended_on)
 values(_staff_id,r,coalesce(_employment->>'employee_number',''),coalesce(_employment->>'department',''),coalesce(_employment->>'job_title',''),nullif(_employment->>'hired_on','')::date,nullif(_employment->>'ended_on','')::date)
 on conflict(staff_id) do update set employee_number=excluded.employee_number,department=excluded.department,job_title=excluded.job_title,hired_on=excluded.hired_on,ended_on=excluded.ended_on;
 insert into public.staff_hr_setups(staff_id,restaurant_id,currency,income,deductions,payroll_enabled,payroll_start,generate_day,salary_proration,leave_enabled,leave_start_year,annual_days,sick_days,annual_opening,sick_opening,annual_accrual,sick_accrual,day_basis,workweek,hours_per_day)
 values(_staff_id,r,h.currency,h.income,h.deductions,h.payroll_enabled,h.payroll_start,h.generate_day,h.salary_proration,h.leave_enabled,h.leave_start_year,h.annual_days,h.sick_days,h.annual_opening,h.sick_opening,h.annual_accrual,h.sick_accrual,h.day_basis,h.workweek,h.hours_per_day)
 on conflict(staff_id) do update set currency=excluded.currency,income=excluded.income,deductions=excluded.deductions,payroll_enabled=excluded.payroll_enabled,payroll_start=excluded.payroll_start,generate_day=excluded.generate_day,salary_proration=excluded.salary_proration,leave_enabled=excluded.leave_enabled,leave_start_year=excluded.leave_start_year,annual_days=excluded.annual_days,sick_days=excluded.sick_days,annual_opening=excluded.annual_opening,sick_opening=excluded.sick_opening,annual_accrual=excluded.annual_accrual,sick_accrual=excluded.sick_accrual,day_basis=excluded.day_basis,workweek=excluded.workweek,hours_per_day=excluded.hours_per_day;
 select (now() at time zone coalesce((select name from pg_timezone_names where name=t.timezone),'UTC'))::date into today from public.restaurants t where t.id=r;
 return app.generate_hr_records(r,date_trunc('month',today)::date,true,_staff_id);
end $$;
revoke all on function public.save_staff_hr_setup(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_staff_hr_setup(uuid,jsonb,jsonb) to authenticated;
create function public.generate_hr_drafts(_restaurant_id uuid,_period date) returns jsonb language sql security invoker set search_path='' as $$ select app.generate_hr_records(_restaurant_id,_period,false,null); $$;
revoke all on function public.generate_hr_drafts(uuid,date) from public,anon;
grant execute on function public.generate_hr_drafts(uuid,date) to authenticated;
-- The scheduler runs as its database owner. It has no client-callable elevated function.
create function app.run_hr_automation() returns void language plpgsql security invoker set search_path='' as $$
declare r record; month date;begin
 for r in select distinct h.restaurant_id,coalesce((select name from pg_timezone_names where name=t.timezone),'UTC') tz from public.staff_hr_setups h join public.restaurants t on t.id=h.restaurant_id where h.payroll_enabled or h.leave_enabled loop
  month:=date_trunc('month',now() at time zone r.tz)::date;
  perform app.generate_hr_records(r.restaurant_id,month,true,null);
 end loop;
end $$;
revoke all on function app.run_hr_automation() from public,anon,authenticated,service_role;
select cron.schedule('quickserve-hr-recurring-setup','17 * * * *','select app.run_hr_automation()');
