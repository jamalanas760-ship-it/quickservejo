begin;
create function app.guard_hr_staff_accounts() returns trigger language plpgsql security invoker set search_path='' as $$
declare uid uuid := (select auth.uid());
begin
 if uid is null or app.is_super_admin() then
   if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if exists(select 1 from public.staff actor where actor.auth_user_id=uid and actor.restaurant_id=old.restaurant_id and actor.role::text='hr' and actor.is_active) then
   if (old.role::text not in ('kitchen','waiter','cashier','host','inventory','procurement','accountant') and old.auth_user_id<>uid)
      or (tg_op='DELETE' and old.auth_user_id=uid) then
     raise exception 'HR can manage employee accounts only' using errcode='42501';
   end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function app.guard_hr_staff_accounts() from public, anon;
grant execute on function app.guard_hr_staff_accounts() to authenticated;
create trigger guard_hr_staff_accounts before update or delete on public.staff
 for each row execute function app.guard_hr_staff_accounts();
commit;
