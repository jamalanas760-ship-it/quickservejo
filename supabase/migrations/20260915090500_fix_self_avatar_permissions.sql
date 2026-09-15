create or replace function public.update_own_avatar(_avatar_url text default null, _avatar_preset text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _uid uuid := auth.uid();
  _metadata jsonb;
begin
  if _uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if _avatar_url is not null and length(_avatar_url) > 4096 then
    raise exception 'Avatar URL is too long';
  end if;
  if _avatar_preset is not null and length(_avatar_preset) > 64 then
    raise exception 'Avatar preset is too long';
  end if;

  update public.staff
  set avatar_url = nullif(trim(_avatar_url), ''),
      avatar_preset = nullif(trim(_avatar_preset), ''),
      updated_at = now()
  where auth_user_id = _uid;

  select coalesce(raw_user_meta_data, '{}'::jsonb)
  into _metadata
  from auth.users
  where id = _uid;

  _metadata := _metadata || jsonb_build_object(
    'avatar_url', nullif(trim(_avatar_url), ''),
    'avatar_preset', nullif(trim(_avatar_preset), '')
  );

  update auth.users
  set raw_user_meta_data = _metadata,
      updated_at = now()
  where id = _uid;
end;
$$;

revoke all on function public.update_own_avatar(text, text) from public;
revoke all on function public.update_own_avatar(text, text) from anon;
grant execute on function public.update_own_avatar(text, text) to authenticated;
