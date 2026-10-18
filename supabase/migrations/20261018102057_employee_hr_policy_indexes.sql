do $$ declare t text; begin foreach t in array array['staff_employment_profiles','staff_leave_accounts','staff_payslips'] loop
 execute format('create index %I on public.%I(staff_id,restaurant_id)',t||'_staff_tenant_idx',t);
 execute format('create index %I on public.%I(updated_by)',t||'_updated_by_idx',t);
 execute format('drop policy hr_employee_read on public.%I',t);
 execute format('drop policy hr_manager_read on public.%I',t);
 execute format('create policy hr_scoped_read on public.%I for select to authenticated using ((app.has_restaurant_access(restaurant_id) and app.has_capability(restaurant_id,''manage_shifts'')) or (%s exists(select 1 from public.staff s where s.id=staff_id and s.restaurant_id=%I.restaurant_id and s.auth_user_id=(select auth.uid()) and s.is_active)))',t,case when t='staff_payslips' then 'status=''published'' and ' else '' end,t);
end loop; end $$;
