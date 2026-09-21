begin;

create table if not exists public.restaurant_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  device_type text not null check (device_type in ('cashier','kds','waiter','manager','kiosk','tablet','printer','other')),
  kitchen_station_id uuid references public.kitchen_stations(id) on delete set null,
  token_prefix text not null,
  token_hash bytea not null unique,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  last_route text,
  last_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_devices_restaurant_idx
  on public.restaurant_devices(restaurant_id,is_active,last_seen_at desc);

alter table public.restaurant_devices enable row level security;

drop policy if exists restaurant_devices_read on public.restaurant_devices;
create policy restaurant_devices_read
on public.restaurant_devices
for select to authenticated
using (
  app.has_capability(restaurant_id,'manage_restaurant')
  or app.has_capability(restaurant_id,'manage_tables')
  or app.is_super_admin()
);

revoke all on public.restaurant_devices from public,anon,authenticated;
grant select on public.restaurant_devices to authenticated;
grant all on public.restaurant_devices to service_role;

drop trigger if exists trg_restaurant_devices_updated on public.restaurant_devices;
create trigger trg_restaurant_devices_updated
before update on public.restaurant_devices
for each row execute function public.set_updated_at();

create or replace function public.register_restaurant_device(
  _restaurant_id uuid,_name text,_device_type text,_kitchen_station_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare _id uuid:=gen_random_uuid(); _token text:='qs_dev_'||encode(extensions.gen_random_bytes(24),'hex'); _prefix text;
begin
  if not (app.has_capability(_restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Restaurant admin access is required' using errcode='42501'; end if;
  if _device_type not in ('cashier','kds','waiter','manager','kiosk','tablet','printer','other') then raise exception 'Unsupported device type'; end if;
  if length(trim(coalesce(_name,'')))<1 then raise exception 'Device name is required'; end if;
  if _kitchen_station_id is not null and not exists(select 1 from public.kitchen_stations where id=_kitchen_station_id and restaurant_id=_restaurant_id)
    then raise exception 'Kitchen station does not belong to this restaurant'; end if;

  _prefix:=left(_token,15);
  insert into public.restaurant_devices(id,restaurant_id,name,device_type,kitchen_station_id,token_prefix,token_hash,created_by)
  values(_id,_restaurant_id,left(trim(_name),120),_device_type,_kitchen_station_id,_prefix,extensions.digest(convert_to(_token,'UTF8'),'sha256'),auth.uid());

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'restaurant_device_registered','restaurant_device',_id,jsonb_build_object('name',left(trim(_name),120),'device_type',_device_type));

  return jsonb_build_object('id',_id,'device_token',_token,'token_prefix',_prefix);
end;
$$;
revoke all on function public.register_restaurant_device(uuid,text,text,uuid) from public,anon;
grant execute on function public.register_restaurant_device(uuid,text,text,uuid) to authenticated;

create or replace function public.heartbeat_restaurant_device(
  _device_token text,_route text default null,_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare _device public.restaurant_devices;
begin
  select * into _device from public.restaurant_devices
  where token_hash=extensions.digest(convert_to(coalesce(_device_token,''),'UTF8'),'sha256') and is_active limit 1;
  if _device.id is null then return null; end if;

  update public.restaurant_devices
  set last_seen_at=now(),
      last_route=nullif(left(coalesce(_route,''),300),''),
      last_metadata=case when jsonb_typeof(coalesce(_metadata,'{}'::jsonb))='object' then coalesce(_metadata,'{}'::jsonb) else '{}'::jsonb end,
      updated_at=now()
  where id=_device.id;

  return jsonb_build_object('id',_device.id,'restaurant_id',_device.restaurant_id,'device_type',_device.device_type);
end;
$$;
revoke all on function public.heartbeat_restaurant_device(text,text,jsonb) from public;
grant execute on function public.heartbeat_restaurant_device(text,text,jsonb) to anon,authenticated;

create or replace function public.revoke_restaurant_device(_device_id uuid)
returns void
language plpgsql security definer set search_path=''
as $$
declare _device public.restaurant_devices;
begin
  select * into _device from public.restaurant_devices where id=_device_id for update;
  if _device.id is null then raise exception 'Device not found'; end if;
  if not (app.has_capability(_device.restaurant_id,'manage_restaurant') or app.is_super_admin())
    then raise exception 'Restaurant admin access is required' using errcode='42501'; end if;
  update public.restaurant_devices set is_active=false,updated_at=now() where id=_device_id;
  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_device.restaurant_id,auth.uid(),'restaurant_device_revoked','restaurant_device',_device.id,jsonb_build_object('name',_device.name,'device_type',_device.device_type));
end;
$$;
revoke all on function public.revoke_restaurant_device(uuid) from public,anon;
grant execute on function public.revoke_restaurant_device(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
