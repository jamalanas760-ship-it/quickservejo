-- Employee HR data is separate from broadly used staff identity records.
-- No entitlements, employment dates, or payroll amounts are seeded.
alter table public.staff add constraint staff_id_restaurant_hr_unique unique (id, restaurant_id);
create table public.staff_employment_profiles (
 staff_id uuid primary key, restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 employee_number text not null default '' check(length(employee_number)<=80), department text not null default '' check(length(department)<=120),
 job_title text not null default '' check(length(job_title)<=120), hired_on date, ended_on date,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 foreign key(staff_id,restaurant_id) references public.staff(id,restaurant_id) on delete cascade,
 check(ended_on is null or (hired_on is not null and ended_on>=hired_on))
);
create table public.staff_leave_accounts (
 id uuid primary key default gen_random_uuid(), staff_id uuid not null, restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 year integer not null check(year between 2000 and 2200), leave_type text not null check(leave_type in ('annual','sick')),
 opening_days numeric(9,4) not null check(opening_days between -10000 and 10000), entitlement_days numeric(9,4) not null check(entitlement_days between 0 and 366),
 accrual_method text not null check(accrual_method in ('upfront','daily')), accrual_start date not null, accrual_end date not null,
 day_basis text not null check(day_basis in ('calendar','workdays')), workweek smallint[] not null,
 hours_per_day numeric(5,2) not null check(hours_per_day>0 and hours_per_day<=24),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 unique(staff_id,year,leave_type), foreign key(staff_id,restaurant_id) references public.staff(id,restaurant_id) on delete cascade,
 check(accrual_end>=accrual_start and extract(year from accrual_start)=year and extract(year from accrual_end)=year),
 check(workweek <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(workweek) between 1 and 7)
);
create function app.hr_pay_items_valid(items jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb; begin
 if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items)>100 then return false; end if;
 for item in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'label') is distinct from 'string' or length(btrim(item->>'label')) not between 1 and 120 or jsonb_typeof(item->'amount') is distinct from 'number' then return false; end if;
  if (item->>'amount')::numeric <0 or (item->>'amount')::numeric >100000000 or (item->>'amount')::numeric <> round((item->>'amount')::numeric,3) then return false; end if;
 end loop; return true;
end $$;
create function app.hr_pay_total(items jsonb) returns numeric language sql immutable security invoker set search_path='' as $$
 select coalesce(sum((value->>'amount')::numeric),0) from jsonb_array_elements(items);
$$;
create table public.staff_payslips (
 id uuid primary key default gen_random_uuid(), staff_id uuid not null, restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 period date not null check(extract(day from period)=1), payment_date date, currency text not null check(currency ~ '^[A-Z]{3}$'),
 employee_name text not null check(length(btrim(employee_name)) between 1 and 200), employee_number text not null default '', department text not null default '', job_title text not null default '',
 payment_method text not null default '' check(length(payment_method)<=80), account_last_four text not null default '' check(account_last_four ~ '^([0-9]{4})?$'),
 income jsonb not null check(app.hr_pay_items_valid(income) and jsonb_array_length(income)>0), deductions jsonb not null default '[]' check(app.hr_pay_items_valid(deductions)),
 total_income numeric generated always as (app.hr_pay_total(income)) stored, total_deductions numeric generated always as (app.hr_pay_total(deductions)) stored,
 net_pay numeric generated always as (app.hr_pay_total(income)-app.hr_pay_total(deductions)) stored,
 status text not null default 'draft' check(status in ('draft','published')), published_at timestamptz, notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null,
 foreign key(staff_id,restaurant_id) references public.staff(id,restaurant_id) on delete cascade,
 unique(staff_id,period), check(app.hr_pay_total(income)>=app.hr_pay_total(deductions)),
 check(status<>'published' or (payment_date is not null and published_at is not null))
);
create function app.hr_record_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.staff_id<>old.staff_id or new.restaurant_id<>old.restaurant_id) then raise exception 'Employee and workspace cannot be changed'; end if;
 if TG_TABLE_NAME='staff_payslips' then
  if TG_OP='UPDATE' and old.status='published' then raise exception 'Published salary slips are immutable'; end if;
  if new.status='published' then new.published_at:=now(); else new.published_at:=null; end if;
 end if;
 new.updated_at:=now(); new.updated_by:=auth.uid(); return new;
end $$;
create trigger hr_profile_guard before insert or update on public.staff_employment_profiles for each row execute function app.hr_record_guard();
create trigger hr_account_guard before insert or update on public.staff_leave_accounts for each row execute function app.hr_record_guard();
create trigger hr_payslip_guard before insert or update on public.staff_payslips for each row execute function app.hr_record_guard();
-- Authorized workforce managers may manage their tenant; employees read only their own records.
do $$ declare t text; begin foreach t in array array['staff_employment_profiles','staff_leave_accounts','staff_payslips'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
 execute format('create policy hr_manager_read on public.%I for select to authenticated using (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,''manage_shifts''))',t);
 execute format('create policy hr_manager_insert on public.%I for insert to authenticated with check (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,''manage_shifts''))',t);
 execute format('create policy hr_manager_update on public.%I for update to authenticated using (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,''manage_shifts'')) with check (app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,''manage_shifts''))',t);
 execute format('create policy hr_employee_read on public.%I for select to authenticated using (%s exists(select 1 from public.staff s where s.id=staff_id and s.restaurant_id=%I.restaurant_id and s.auth_user_id=(select auth.uid()) and s.is_active))',t,case when t='staff_payslips' then 'status=''published'' and ' else '' end,t);
 execute format('create index %I on public.%I(restaurant_id,staff_id)',t||'_tenant_staff_idx',t);
end loop; end $$;
revoke all on function app.hr_pay_items_valid(jsonb), app.hr_pay_total(jsonb), app.hr_record_guard() from public,anon;
grant execute on function app.hr_pay_items_valid(jsonb),app.hr_pay_total(jsonb) to authenticated;
comment on table public.staff_leave_accounts is 'Explicit per employee/year policy. Opening excludes current-year requests; approved requests are derived, never copied into seeded ledger rows. Year-end assumes no additional requests.';
