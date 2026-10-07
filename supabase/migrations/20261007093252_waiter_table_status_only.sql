-- Waiter workspaces may update table service, but never the floor design.
create or replace function app.guard_waiter_table_structure()
returns trigger language plpgsql security definer set search_path=''
as $$
declare _rid uuid;
begin
  _rid:=case when tg_op='INSERT' then new.restaurant_id else old.restaurant_id end;
  if auth.uid() is not null and not app.is_super_admin() and exists(
    select 1 from public.staff where auth_user_id=auth.uid() and restaurant_id=_rid and is_active and role='waiter'
  ) then
    if tg_op <> 'UPDATE' then raise exception 'Waiters can update table status only' using errcode='42501'; end if;
    if (to_jsonb(new) - array['service_status','activated_at','status_updated_at','status_updated_by','updated_at','service_group_id'])
       is distinct from
       (to_jsonb(old) - array['service_status','activated_at','status_updated_at','status_updated_by','updated_at','service_group_id']) then
      raise exception 'Waiters cannot edit the table layout' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function app.guard_waiter_table_structure() from public,anon,authenticated;
create trigger guard_waiter_table_structure before insert or update or delete on public.restaurant_tables
for each row execute function app.guard_waiter_table_structure();
