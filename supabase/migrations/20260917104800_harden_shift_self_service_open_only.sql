create or replace function public.update_own_shift_assignment_status(_assignment_id uuid, _status text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if _status not in ('present', 'released') then
    raise exception 'Only present or released are valid self-service statuses' using errcode = '22023';
  end if;

  update public.shift_assignments sa
     set status = _status
   where sa.id = _assignment_id
     and exists (
       select 1
         from public.staff s
         join public.shifts sh on sh.id = sa.shift_id and sh.restaurant_id = sa.restaurant_id
        where s.id = sa.staff_id
          and s.auth_user_id = _uid
          and s.is_active
          and s.restaurant_id = sa.restaurant_id
          and sh.status = 'open'
     );

  if not found then
    raise exception 'You can only update your own assignment while the shift is open' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.update_own_shift_assignment_status(uuid, text) from public;
grant execute on function public.update_own_shift_assignment_status(uuid, text) to authenticated;
