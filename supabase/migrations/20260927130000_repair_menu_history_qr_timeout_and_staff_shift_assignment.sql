begin;

-- Keep the live version, but make history deletion available in the production schema.
create or replace function public.delete_menu_design_version(_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare _v public.menu_design_versions;
begin
  select * into _v from public.menu_design_versions where id = _version_id for update;
  if _v.id is null then raise exception 'Menu design version not found'; end if;
  if not (app.can_manage_restaurant(_v.restaurant_id) or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if _v.status = 'published' then
    raise exception 'The live published version cannot be deleted';
  end if;
  insert into public.audit_logs(restaurant_id, actor_user_id, action, entity, entity_id, metadata)
  values (_v.restaurant_id, auth.uid(), 'menu_design_version_deleted', 'menu_design_version', _v.id,
    jsonb_build_object('version_number', _v.version_number, 'status', _v.status, 'source', _v.source));
  delete from public.menu_design_versions where id = _v.id;
end;
$$;

create or replace function public.delete_all_menu_design_versions(_restaurant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _deleted integer;
begin
  if not (app.can_manage_restaurant(_restaurant_id) or app.is_super_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.audit_logs(restaurant_id, actor_user_id, action, entity, metadata)
  values (_restaurant_id, auth.uid(), 'menu_design_history_deleted', 'menu_design_version',
    jsonb_build_object('kept_live_version', true));
  delete from public.menu_design_versions
  where restaurant_id = _restaurant_id and status <> 'published';
  get diagnostics _deleted = row_count;
  return _deleted;
end;
$$;

revoke all on function public.delete_menu_design_version(uuid) from public, anon;
grant execute on function public.delete_menu_design_version(uuid) to authenticated, service_role;
revoke all on function public.delete_all_menu_design_versions(uuid) from public, anon;
grant execute on function public.delete_all_menu_design_versions(uuid) to authenticated, service_role;

-- Assigning a team member is one authorized transaction: create the shift when needed,
-- then create its assignment. This prevents a shift from being created without its staff link.
create or replace function public.assign_staff_shift(
  _restaurant_id uuid,
  _staff_id uuid,
  _shift_id uuid default null,
  _name text default null,
  _shift_date date default null,
  _planned_start timestamptz default null,
  _planned_end timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare _resolved_shift uuid := _shift_id; _role text;
begin
  if not (app.can_manage_restaurant(_restaurant_id) or app.has_capability(_restaurant_id, 'manage_shifts') or app.is_super_admin()) then
    raise exception 'Shift management access is required' using errcode = '42501';
  end if;
  select s.role::text into _role
  from public.staff s
  where s.id = _staff_id and s.restaurant_id = _restaurant_id and s.is_active;
  if _role is null then raise exception 'Active staff member not found'; end if;

  if _resolved_shift is null then
    if nullif(btrim(coalesce(_name, '')), '') is null or _shift_date is null
       or _planned_start is null or _planned_end is null then
      raise exception 'Shift name, date and time are required';
    end if;
    insert into public.shifts(restaurant_id, name, shift_date, planned_start, planned_end, status)
    values (_restaurant_id, left(btrim(_name), 80), _shift_date, _planned_start, _planned_end, 'planned')
    returning id into _resolved_shift;
  else
    if not exists (
      select 1 from public.shifts sh
      where sh.id = _resolved_shift and sh.restaurant_id = _restaurant_id
        and sh.deleted_at is null and sh.status <> 'closed'
    ) then raise exception 'Shift not found or already closed'; end if;
  end if;

  if exists (select 1 from public.shift_assignments where shift_id = _resolved_shift and staff_id = _staff_id) then
    raise exception 'This staff member is already assigned to the selected shift';
  end if;
  insert into public.shift_assignments(restaurant_id, shift_id, staff_id, role_snapshot, starts_at, ends_at, status)
  select _restaurant_id, _resolved_shift, _staff_id, _role, sh.planned_start, sh.planned_end, 'scheduled'
  from public.shifts sh where sh.id = _resolved_shift;
  return _resolved_shift;
end;
$$;

revoke all on function public.assign_staff_shift(uuid, uuid, uuid, text, date, timestamptz, timestamptz) from public, anon;
grant execute on function public.assign_staff_shift(uuid, uuid, uuid, text, date, timestamptz, timestamptz) to authenticated, service_role;

-- A QR scan activates a table immediately. Release only scan-only sessions after 20 minutes;
-- any order placed against the table keeps the service session active.
create or replace function app.release_unordered_qr_tables()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _released integer;
begin
  update public.restaurant_tables t
  set service_status = 'free', activated_at = null, status_updated_at = now(), status_updated_by = null
  where t.is_active
    and t.service_status = 'active'
    and t.status_updated_by is null
    and t.activated_at is not null
    and t.activated_at <= now() - interval '20 minutes'
    and not exists (
      select 1 from public.orders o
      where o.table_id = t.id
        and o.created_at >= t.activated_at
        and o.status not in ('cancelled', 'void')
    );
  get diagnostics _released = row_count;
  return _released;
end;
$$;

revoke all on function app.release_unordered_qr_tables() from public, anon, authenticated;
do $$
begin
  perform cron.unschedule('quickserve-release-unordered-qr-tables')
  where exists (select 1 from cron.job where jobname = 'quickserve-release-unordered-qr-tables');
exception when others then null;
end $$;
select cron.schedule('quickserve-release-unordered-qr-tables', '* * * * *', 'select app.release_unordered_qr_tables();');

notify pgrst, 'reload schema';
commit;
