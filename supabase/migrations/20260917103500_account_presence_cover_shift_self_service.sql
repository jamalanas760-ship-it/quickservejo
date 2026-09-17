alter table public.staff
  add column if not exists last_seen_at timestamptz,
  add column if not exists cover_image_url text,
  add column if not exists cover_position_x numeric not null default 50 check (cover_position_x between 0 and 100),
  add column if not exists cover_position_y numeric not null default 50 check (cover_position_y between 0 and 100),
  add column if not exists cover_zoom numeric not null default 100 check (cover_zoom between 100 and 220);

create index if not exists staff_restaurant_last_seen_idx
  on public.staff (restaurant_id, last_seen_at desc)
  where is_active;

drop policy if exists staff_read_self_or_admin_team on public.staff;
create policy staff_read_self_or_admin_team
  on public.staff
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (
      restaurant_id is not null
      and (
        app.has_capability(restaurant_id, 'manage_staff')
        or app.has_capability(restaurant_id, 'manage_shifts')
      )
    )
  );

create or replace function public.touch_my_presence(_restaurant_id uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  _uid uuid := auth.uid();
  _now timestamptz := now();
begin
  if _uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.staff
     set last_seen_at = _now
   where auth_user_id = _uid
     and is_active
     and (_restaurant_id is null or restaurant_id = _restaurant_id);

  return _now;
end;
$$;

create or replace function public.update_own_display_name(_staff_id uuid, _name text)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  _uid uuid := auth.uid();
  _clean text := regexp_replace(trim(coalesce(_name, '')), '\s+', ' ', 'g');
begin
  if _uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(_clean) < 1 or length(_clean) > 80 then
    raise exception 'Name must be between 1 and 80 characters' using errcode = '22023';
  end if;

  update public.staff
     set name = _clean,
         updated_at = now()
   where id = _staff_id
     and auth_user_id = _uid
     and is_active;

  if not found then
    raise exception 'You can only update your own active account' using errcode = '42501';
  end if;

  return _clean;
end;
$$;

create or replace function public.update_own_cover(
  _staff_id uuid,
  _cover_image_url text default null,
  _position_x numeric default 50,
  _position_y numeric default 50,
  _zoom numeric default 100
)
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
  if _cover_image_url is not null and length(_cover_image_url) > 4096 then
    raise exception 'Cover URL is too long' using errcode = '22023';
  end if;
  if _position_x < 0 or _position_x > 100 or _position_y < 0 or _position_y > 100 then
    raise exception 'Cover position is out of range' using errcode = '22023';
  end if;
  if _zoom < 100 or _zoom > 220 then
    raise exception 'Cover zoom is out of range' using errcode = '22023';
  end if;

  update public.staff
     set cover_image_url = nullif(trim(_cover_image_url), ''),
         cover_position_x = _position_x,
         cover_position_y = _position_y,
         cover_zoom = _zoom,
         updated_at = now()
   where id = _staff_id
     and auth_user_id = _uid
     and is_active;

  if not found then
    raise exception 'You can only update your own active account' using errcode = '42501';
  end if;
end;
$$;

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
        where s.id = sa.staff_id
          and s.auth_user_id = _uid
          and s.is_active
          and s.restaurant_id = sa.restaurant_id
     );

  if not found then
    raise exception 'You can only update your own shift assignment' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.touch_my_presence(uuid) from public;
revoke all on function public.update_own_display_name(uuid, text) from public;
revoke all on function public.update_own_cover(uuid, text, numeric, numeric, numeric) from public;
revoke all on function public.update_own_shift_assignment_status(uuid, text) from public;

grant execute on function public.touch_my_presence(uuid) to authenticated;
grant execute on function public.update_own_display_name(uuid, text) to authenticated;
grant execute on function public.update_own_cover(uuid, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.update_own_shift_assignment_status(uuid, text) to authenticated;
