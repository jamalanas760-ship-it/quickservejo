begin;

create or replace function public.delete_menu_design_version(_version_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _v public.menu_design_versions;
begin
  select * into _v from public.menu_design_versions where id=_version_id for update;
  if _v.id is null then raise exception 'Menu design version not found'; end if;
  if not (app.can_manage_restaurant(_v.restaurant_id) or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if _v.status='published' then
    raise exception 'The live published version cannot be deleted';
  end if;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(
    _v.restaurant_id,
    auth.uid(),
    'menu_design_version_deleted',
    'menu_design_version',
    _v.id,
    jsonb_build_object('version_number',_v.version_number,'status',_v.status,'source',_v.source)
  );

  delete from public.menu_design_versions where id=_v.id;
end;
$$;

revoke all on function public.delete_menu_design_version(uuid) from public,anon;
grant execute on function public.delete_menu_design_version(uuid) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
