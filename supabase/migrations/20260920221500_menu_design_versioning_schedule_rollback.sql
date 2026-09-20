begin;

create table if not exists public.menu_design_versions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  version_number integer not null,
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived','cancelled')),
  snapshot jsonb not null,
  note text,
  scheduled_for timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  source text not null default 'studio' check (source in ('studio','rollback','migration','schedule')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, version_number),
  check (octet_length(snapshot::text) <= 1048576)
);

create index if not exists menu_design_versions_restaurant_idx on public.menu_design_versions(restaurant_id, version_number desc);
create index if not exists menu_design_versions_due_idx on public.menu_design_versions(status, scheduled_for) where status='scheduled';

alter table public.menu_design_versions enable row level security;
drop policy if exists menu_design_versions_read on public.menu_design_versions;
create policy menu_design_versions_read on public.menu_design_versions
for select to authenticated
using (app.can_manage_restaurant(restaurant_id) or app.is_super_admin());

revoke all on public.menu_design_versions from public, anon, authenticated;
grant select on public.menu_design_versions to authenticated;
grant all on public.menu_design_versions to service_role;

drop trigger if exists trg_menu_design_versions_updated on public.menu_design_versions;
create trigger trg_menu_design_versions_updated
before update on public.menu_design_versions
for each row execute function public.set_updated_at();

create or replace function app.apply_menu_design_version(_version_id uuid,_actor uuid default null,_source text default 'studio')
returns uuid language plpgsql security definer set search_path=''
as $$
declare _v public.menu_design_versions; _s jsonb;
begin
  select * into _v from public.menu_design_versions where id=_version_id for update;
  if _v.id is null then raise exception 'Menu design version not found'; end if;
  if _v.status not in ('draft','scheduled','archived') then raise exception 'Menu design version cannot be published from status %',_v.status; end if;
  _s:=_v.snapshot;

  update public.menu_design_versions set status='archived',updated_at=now()
  where restaurant_id=_v.restaurant_id and status='published' and id<>_v.id;

  update public.restaurants set
    logo_url=nullif(_s->>'logo_url',''),
    cover_image_url=nullif(_s->>'cover_image_url',''),
    primary_color=coalesce(nullif(_s->>'primary_color',''),primary_color),
    accent_color=coalesce(nullif(_s->>'accent_color',''),accent_color),
    background_color=coalesce(nullif(_s->>'background_color',''),background_color),
    text_color=coalesce(nullif(_s->>'text_color',''),text_color),
    tax_rate=coalesce(nullif(_s->>'tax_rate','')::numeric,tax_rate),
    service_charge=coalesce(nullif(_s->>'service_charge','')::numeric,service_charge),
    menu_theme=coalesce(_s->'menu_theme',menu_theme),
    updated_at=now()
  where id=_v.restaurant_id;

  update public.menu_design_versions set
    status='published',scheduled_for=null,published_at=now(),published_by=_actor,
    source=case when _source in ('studio','rollback','schedule','migration') then _source else source end,updated_at=now()
  where id=_v.id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_v.restaurant_id,_actor,'menu_design_published','menu_design_version',_v.id,jsonb_build_object('version_number',_v.version_number,'source',_source));

  return _v.id;
end;
$$;
revoke all on function app.apply_menu_design_version(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.save_menu_design_draft(_restaurant_id uuid,_snapshot jsonb,_note text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare _id uuid; _next integer; _clean jsonb;
begin
  if not (app.can_manage_restaurant(_restaurant_id) or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
  if _snapshot is null or jsonb_typeof(_snapshot)<>'object' then raise exception 'Invalid design snapshot'; end if;
  if octet_length(_snapshot::text)>1048576 then raise exception 'Design snapshot is too large'; end if;

  perform pg_advisory_xact_lock(hashtext(_restaurant_id::text));
  select coalesce(max(version_number),0)+1 into _next from public.menu_design_versions where restaurant_id=_restaurant_id;

  _clean:=jsonb_build_object(
    'logo_url',nullif(_snapshot->>'logo_url',''),
    'cover_image_url',nullif(_snapshot->>'cover_image_url',''),
    'primary_color',nullif(_snapshot->>'primary_color',''),
    'accent_color',nullif(_snapshot->>'accent_color',''),
    'background_color',nullif(_snapshot->>'background_color',''),
    'text_color',nullif(_snapshot->>'text_color',''),
    'tax_rate',nullif(_snapshot->>'tax_rate',''),
    'service_charge',nullif(_snapshot->>'service_charge',''),
    'menu_theme',coalesce(_snapshot->'menu_theme','{}'::jsonb)
  );

  insert into public.menu_design_versions(restaurant_id,version_number,status,snapshot,note,created_by,source)
  values(_restaurant_id,_next,'draft',_clean,nullif(left(trim(coalesce(_note,'')),500),''),auth.uid(),'studio')
  returning id into _id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_restaurant_id,auth.uid(),'menu_design_draft_saved','menu_design_version',_id,jsonb_build_object('version_number',_next));

  return _id;
end;
$$;
revoke all on function public.save_menu_design_draft(uuid,jsonb,text) from public,anon;
grant execute on function public.save_menu_design_draft(uuid,jsonb,text) to authenticated;

create or replace function public.publish_menu_design_version(_version_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare _restaurant_id uuid;
begin
  select restaurant_id into _restaurant_id from public.menu_design_versions where id=_version_id;
  if _restaurant_id is null then raise exception 'Menu design version not found'; end if;
  if not (app.can_manage_restaurant(_restaurant_id) or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
  return app.apply_menu_design_version(_version_id,auth.uid(),'studio');
end;
$$;
revoke all on function public.publish_menu_design_version(uuid) from public,anon;
grant execute on function public.publish_menu_design_version(uuid) to authenticated;

create or replace function public.schedule_menu_design_version(_version_id uuid,_scheduled_for timestamptz)
returns void language plpgsql security definer set search_path=''
as $$
declare _v public.menu_design_versions;
begin
  select * into _v from public.menu_design_versions where id=_version_id for update;
  if _v.id is null then raise exception 'Menu design version not found'; end if;
  if not (app.can_manage_restaurant(_v.restaurant_id) or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
  if _v.status<>'draft' then raise exception 'Only draft designs can be scheduled'; end if;
  if _scheduled_for<=now() then raise exception 'Scheduled publish time must be in the future'; end if;

  update public.menu_design_versions set status='scheduled',scheduled_for=_scheduled_for,updated_at=now() where id=_version_id;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_v.restaurant_id,auth.uid(),'menu_design_scheduled','menu_design_version',_v.id,jsonb_build_object('scheduled_for',_scheduled_for,'version_number',_v.version_number));
end;
$$;
revoke all on function public.schedule_menu_design_version(uuid,timestamptz) from public,anon;
grant execute on function public.schedule_menu_design_version(uuid,timestamptz) to authenticated;

create or replace function public.cancel_scheduled_menu_design(_version_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare _v public.menu_design_versions;
begin
  select * into _v from public.menu_design_versions where id=_version_id for update;
  if _v.id is null then raise exception 'Menu design version not found'; end if;
  if not (app.can_manage_restaurant(_v.restaurant_id) or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
  if _v.status<>'scheduled' then raise exception 'Design is not scheduled'; end if;
  update public.menu_design_versions set status='draft',scheduled_for=null,updated_at=now() where id=_version_id;
end;
$$;
revoke all on function public.cancel_scheduled_menu_design(uuid) from public,anon;
grant execute on function public.cancel_scheduled_menu_design(uuid) to authenticated;

create or replace function public.rollback_menu_design_version(_version_id uuid,_note text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare _source public.menu_design_versions; _new_id uuid; _next integer;
begin
  select * into _source from public.menu_design_versions where id=_version_id;
  if _source.id is null then raise exception 'Menu design version not found'; end if;
  if not (app.can_manage_restaurant(_source.restaurant_id) or app.is_super_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;

  perform pg_advisory_xact_lock(hashtext(_source.restaurant_id::text));
  select coalesce(max(version_number),0)+1 into _next from public.menu_design_versions where restaurant_id=_source.restaurant_id;

  insert into public.menu_design_versions(restaurant_id,version_number,status,snapshot,note,created_by,source)
  values(_source.restaurant_id,_next,'draft',_source.snapshot,coalesce(nullif(left(trim(coalesce(_note,'')),500),''),'Rollback from version '||_source.version_number::text),auth.uid(),'rollback')
  returning id into _new_id;

  perform app.apply_menu_design_version(_new_id,auth.uid(),'rollback');

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_source.restaurant_id,auth.uid(),'menu_design_rolled_back','menu_design_version',_new_id,jsonb_build_object('from_version',_source.version_number,'new_version',_next));

  return _new_id;
end;
$$;
revoke all on function public.rollback_menu_design_version(uuid,text) from public,anon;
grant execute on function public.rollback_menu_design_version(uuid,text) to authenticated;

create or replace function app.publish_due_menu_design_versions()
returns integer language plpgsql security definer set search_path=''
as $$
declare _row record; _count integer:=0;
begin
  for _row in
    select id from public.menu_design_versions
    where status='scheduled' and scheduled_for<=now()
    order by scheduled_for
    for update skip locked
  loop
    perform app.apply_menu_design_version(_row.id,null,'schedule');
    _count:=_count+1;
  end loop;
  return _count;
end;
$$;
revoke all on function app.publish_due_menu_design_versions() from public,anon,authenticated;

do $$
begin
  perform cron.unschedule('quickserve-menu-design-publisher') where exists(select 1 from cron.job where jobname='quickserve-menu-design-publisher');
exception when others then null;
end $$;
select cron.schedule('quickserve-menu-design-publisher','* * * * *','select app.publish_due_menu_design_versions();');

insert into public.menu_design_versions(restaurant_id,version_number,status,snapshot,note,created_by,published_by,source,published_at)
select r.id,1,'published',
  jsonb_build_object(
    'logo_url',r.logo_url,'cover_image_url',r.cover_image_url,'primary_color',r.primary_color,'accent_color',r.accent_color,
    'background_color',r.background_color,'text_color',r.text_color,'tax_rate',r.tax_rate::text,'service_charge',r.service_charge::text,
    'menu_theme',coalesce(r.menu_theme,'{}'::jsonb)
  ),
  'Initial version captured from current live design',null,null,'migration',now()
from public.restaurants r
where not exists(select 1 from public.menu_design_versions v where v.restaurant_id=r.id);

notify pgrst,'reload schema';
commit;
