-- Allow a restaurant admin to update their own non-role staff profile fields (avatar, name, etc.)
-- without weakening protection around granting/removing the restaurant_admin role.
create or replace function app.guard_admin_role_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or app.is_super_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' and new.role = 'restaurant_admin' then
    raise exception 'Only the Super Admin can grant Admin access' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and (old.role = 'restaurant_admin' or new.role = 'restaurant_admin') then
    raise exception 'Only the Super Admin can change Admin access' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' and old.role = 'restaurant_admin' then
    raise exception 'Only the Super Admin can remove Admin access' using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
