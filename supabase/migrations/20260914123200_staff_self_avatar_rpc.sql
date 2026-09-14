create or replace function public.update_own_avatar(_avatar_url text default null, _avatar_preset text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if _avatar_url is not null and length(_avatar_url) > 2048 then
    raise exception 'Avatar URL is too long';
  end if;
  if _avatar_preset is not null and length(_avatar_preset) > 64 then
    raise exception 'Avatar preset is too long';
  end if;

  update public.staff
  set avatar_url = nullif(trim(_avatar_url), ''),
      avatar_preset = nullif(trim(_avatar_preset), ''),
      updated_at = now()
  where auth_user_id = auth.uid()
    and is_active = true;
end;
$$;

revoke all on function public.update_own_avatar(text, text) from public;
grant execute on function public.update_own_avatar(text, text) to authenticated;