begin;

alter table public.staff_leave_requests
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists leave_type text not null default 'annual',
  add column if not exists family_degree text,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists review_note text;

do $$ begin
  alter table public.staff_leave_requests
    add constraint staff_leave_requests_type_chk
    check (leave_type in ('annual','sick','hajj','bereavement'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.staff_leave_requests
    add constraint staff_leave_requests_family_degree_chk
    check (family_degree is null or family_degree in ('first_degree','second_degree'));
exception when duplicate_object then null; end $$;

create table if not exists public.staff_permission_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  permission_type text not null,
  request_date date not null,
  start_time time,
  end_time time,
  expected_arrival_time time,
  reason text not null,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  status text not null default 'pending',
  reviewed_by uuid references public.staff(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_permission_requests_type_chk check (permission_type in ('personal','lateness','work')),
  constraint staff_permission_requests_status_chk check (status in ('pending','approved','rejected','cancelled')),
  constraint staff_permission_requests_reason_chk check (char_length(btrim(reason)) between 3 and 1000)
);

create index if not exists staff_permission_requests_restaurant_idx
  on public.staff_permission_requests(restaurant_id,status,created_at desc);
create index if not exists staff_permission_requests_staff_idx
  on public.staff_permission_requests(staff_id,status,created_at desc);

alter table public.staff_permission_requests enable row level security;
grant select on public.staff_permission_requests to authenticated;
grant all on public.staff_permission_requests to service_role;

drop policy if exists staff_permission_requests_select on public.staff_permission_requests;
create policy staff_permission_requests_select
on public.staff_permission_requests
for select
to authenticated
using (
  app.has_capability(restaurant_id,'manage_shifts')
  or app.can_manage_restaurant(restaurant_id)
  or app.is_super_admin()
  or exists (
    select 1
    from public.staff s
    where s.id=staff_permission_requests.staff_id
      and s.auth_user_id=(select auth.uid())
      and s.is_active
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'workforce-documents',
  'workforce-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists workforce_documents_read on storage.objects;
create policy workforce_documents_read
on storage.objects
for select
to authenticated
using (
  bucket_id='workforce-documents'
  and app.has_restaurant_access((nullif(split_part(name,'/',1),''))::uuid)
);

drop policy if exists workforce_documents_insert on storage.objects;
create policy workforce_documents_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='workforce-documents'
  and app.has_restaurant_access((nullif(split_part(name,'/',1),''))::uuid)
);

drop policy if exists workforce_documents_update on storage.objects;
create policy workforce_documents_update
on storage.objects
for update
to authenticated
using (
  bucket_id='workforce-documents'
  and app.has_restaurant_access((nullif(split_part(name,'/',1),''))::uuid)
)
with check (
  bucket_id='workforce-documents'
  and app.has_restaurant_access((nullif(split_part(name,'/',1),''))::uuid)
);

drop policy if exists workforce_documents_delete on storage.objects;
create policy workforce_documents_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='workforce-documents'
  and app.has_restaurant_access((nullif(split_part(name,'/',1),''))::uuid)
);

create or replace function public.submit_workforce_permission_request(
  _restaurant_id uuid,
  _permission_type text,
  _request_date date,
  _start_time time default null,
  _end_time time default null,
  _expected_arrival_time time default null,
  _reason text default null,
  _attachment_path text default null,
  _attachment_name text default null,
  _attachment_mime text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _staff_id uuid;
  _staff_name text;
  _request_id uuid;
  _role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if not app.has_restaurant_access(_restaurant_id) then
    raise exception 'Restaurant access is required' using errcode='42501';
  end if;

  select s.id,s.name into _staff_id,_staff_name
  from public.staff s
  where s.restaurant_id=_restaurant_id
    and s.auth_user_id=auth.uid()
    and s.is_active
  limit 1;

  if _staff_id is null then
    raise exception 'Active staff member not found' using errcode='22023';
  end if;
  if _permission_type not in ('personal','lateness','work') then
    raise exception 'Invalid permission type' using errcode='22023';
  end if;
  if _request_date is null then
    raise exception 'Permission date is required' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then
    raise exception 'A reason is required' using errcode='22023';
  end if;

  if _permission_type='lateness' then
    if _expected_arrival_time is null then
      raise exception 'Expected arrival time is required' using errcode='22023';
    end if;
  else
    if _start_time is null or _end_time is null or _end_time <= _start_time then
      raise exception 'A valid start and end time is required' using errcode='22023';
    end if;
  end if;

  insert into public.staff_permission_requests(
    restaurant_id,staff_id,permission_type,request_date,start_time,end_time,
    expected_arrival_time,reason,attachment_path,attachment_name,attachment_mime,status
  )
  values(
    _restaurant_id,_staff_id,_permission_type,_request_date,_start_time,_end_time,
    _expected_arrival_time,btrim(_reason),nullif(_attachment_path,''),nullif(_attachment_name,''),nullif(_attachment_mime,''),'pending'
  )
  returning id into _request_id;

  foreach _role in array array['restaurant_admin','operations_manager','manager']::text[]
  loop
    insert into public.in_app_notifications(
      restaurant_id,target_role,kind,title,body,source_type,source_id,dedupe_key
    )
    values(
      _restaurant_id,_role,'shift','Permission request',
      coalesce(_staff_name,'Team member')||' submitted a '||_permission_type||' permission request.',
      'workforce_permission_request',_request_id,
      'workforce-permission:'||_request_id::text||':'||_role
    )
    on conflict (restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(
    _restaurant_id,auth.uid(),'workforce_permission_requested','staff_permission_request',_request_id,
    jsonb_build_object('staff_id',_staff_id,'permission_type',_permission_type,'request_date',_request_date)
  );

  return _request_id;
end;
$$;

revoke all on function public.submit_workforce_permission_request(uuid,text,date,time,time,time,text,text,text,text)
from public,anon;
grant execute on function public.submit_workforce_permission_request(uuid,text,date,time,time,time,text,text,text,text)
to authenticated,service_role;

create or replace function public.review_workforce_permission_request(
  _request_id uuid,
  _status text,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _r public.staff_permission_requests%rowtype;
  _reviewer uuid;
begin
  select * into _r
  from public.staff_permission_requests
  where id=_request_id
  for update;

  if _r.id is null then raise exception 'Permission request not found' using errcode='22023'; end if;
  if not (app.can_manage_restaurant(_r.restaurant_id) or app.has_capability(_r.restaurant_id,'manage_shifts') or app.is_super_admin()) then
    raise exception 'Shift management access is required' using errcode='42501';
  end if;
  if _r.status <> 'pending' then raise exception 'Request has already been reviewed' using errcode='22023'; end if;
  if _status not in ('approved','rejected') then raise exception 'Invalid review status' using errcode='22023'; end if;

  select s.id into _reviewer
  from public.staff s
  where s.restaurant_id=_r.restaurant_id and s.auth_user_id=auth.uid() and s.is_active
  limit 1;

  update public.staff_permission_requests
  set status=_status,reviewed_by=_reviewer,reviewed_at=now(),review_note=nullif(btrim(coalesce(_note,'')),''),updated_at=now()
  where id=_request_id;

  insert into public.in_app_notifications(
    restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key
  )
  values(
    _r.restaurant_id,_r.staff_id,'shift',
    case when _status='approved' then 'Permission approved' else 'Permission rejected' end,
    case when _status='approved' then 'Your workforce permission request was approved.' else 'Your workforce permission request was rejected.' end,
    'workforce_permission_request',_request_id,'workforce-permission-result:'||_request_id::text
  )
  on conflict (restaurant_id,dedupe_key) where dedupe_key is not null
  do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now();

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_r.restaurant_id,auth.uid(),'workforce_permission_'||_status,'staff_permission_request',_request_id,jsonb_build_object('staff_id',_r.staff_id,'note',_note));
end;
$$;

revoke all on function public.review_workforce_permission_request(uuid,text,text) from public,anon;
grant execute on function public.review_workforce_permission_request(uuid,text,text) to authenticated,service_role;

create or replace function public.submit_workforce_leave_request(
  _restaurant_id uuid,
  _leave_type text,
  _family_degree text,
  _start date,
  _end date,
  _reason text,
  _attachment_path text default null,
  _attachment_name text default null,
  _attachment_mime text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _staff_id uuid;
  _staff_name text;
  _request_id uuid;
  _role text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not app.has_restaurant_access(_restaurant_id) then raise exception 'Restaurant access is required' using errcode='42501'; end if;

  select s.id,s.name into _staff_id,_staff_name
  from public.staff s
  where s.restaurant_id=_restaurant_id and s.auth_user_id=auth.uid() and s.is_active
  limit 1;

  if _staff_id is null then raise exception 'Active staff member not found' using errcode='22023'; end if;
  if _leave_type not in ('annual','sick','hajj','bereavement') then raise exception 'Invalid leave type' using errcode='22023'; end if;
  if _start is null or _end is null or _end < _start then raise exception 'Invalid leave date range' using errcode='22023'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'A reason is required' using errcode='22023'; end if;
  if _leave_type='bereavement' and _family_degree not in ('first_degree','second_degree') then
    raise exception 'Family degree is required for bereavement leave' using errcode='22023';
  end if;
  if _leave_type<>'bereavement' then _family_degree := null; end if;
  if _leave_type='sick' and nullif(coalesce(_attachment_path,''),'') is null then
    raise exception 'A medical attachment is required for sick leave' using errcode='22023';
  end if;

  insert into public.staff_leave_requests(
    restaurant_id,staff_id,start_date,end_date,reason,status,leave_type,family_degree,
    attachment_path,attachment_name,attachment_mime,start_time,end_time
  )
  values(
    _restaurant_id,_staff_id,_start,_end,btrim(_reason),'pending',_leave_type,_family_degree,
    nullif(_attachment_path,''),nullif(_attachment_name,''),nullif(_attachment_mime,''),null,null
  )
  returning id into _request_id;

  foreach _role in array array['restaurant_admin','operations_manager','manager']::text[]
  loop
    insert into public.in_app_notifications(
      restaurant_id,target_role,kind,title,body,source_type,source_id,dedupe_key
    )
    values(
      _restaurant_id,_role,'shift','Leave request',
      coalesce(_staff_name,'Team member')||' submitted a '||_leave_type||' leave request.',
      'staff_leave_request',_request_id,'workforce-leave:'||_request_id::text||':'||_role
    )
    on conflict (restaurant_id,dedupe_key) where dedupe_key is not null do nothing;
  end loop;

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(
    _restaurant_id,auth.uid(),'workforce_leave_requested','staff_leave_request',_request_id,
    jsonb_build_object('staff_id',_staff_id,'leave_type',_leave_type,'family_degree',_family_degree,'start_date',_start,'end_date',_end)
  );

  return _request_id;
end;
$$;

revoke all on function public.submit_workforce_leave_request(uuid,text,text,date,date,text,text,text,text)
from public,anon;
grant execute on function public.submit_workforce_leave_request(uuid,text,text,date,date,text,text,text,text)
to authenticated,service_role;

create or replace function public.review_workforce_leave_request(
  _request_id uuid,
  _status text,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  _r public.staff_leave_requests%rowtype;
  _reviewer uuid;
begin
  select * into _r
  from public.staff_leave_requests
  where id=_request_id
  for update;

  if _r.id is null then raise exception 'Leave request not found' using errcode='22023'; end if;
  if not (app.can_manage_restaurant(_r.restaurant_id) or app.has_capability(_r.restaurant_id,'manage_shifts') or app.is_super_admin()) then
    raise exception 'Shift management access is required' using errcode='42501';
  end if;
  if _r.status <> 'pending' then raise exception 'Request has already been reviewed' using errcode='22023'; end if;
  if _status not in ('approved','rejected') then raise exception 'Invalid review status' using errcode='22023'; end if;

  select s.id into _reviewer
  from public.staff s
  where s.restaurant_id=_r.restaurant_id and s.auth_user_id=auth.uid() and s.is_active
  limit 1;

  update public.staff_leave_requests
  set status=_status,reviewed_by=_reviewer,reviewed_at=now(),review_note=nullif(btrim(coalesce(_note,'')),'')
  where id=_request_id;

  insert into public.in_app_notifications(
    restaurant_id,staff_id,kind,title,body,source_type,source_id,dedupe_key
  )
  values(
    _r.restaurant_id,_r.staff_id,'shift',
    case when _status='approved' then 'Leave approved' else 'Leave rejected' end,
    case when _status='approved' then 'Your leave request was approved.' else 'Your leave request was rejected.' end,
    'staff_leave_request',_request_id,'workforce-leave-result:'||_request_id::text
  )
  on conflict (restaurant_id,dedupe_key) where dedupe_key is not null
  do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now();

  insert into public.audit_logs(restaurant_id,actor_user_id,action,entity,entity_id,metadata)
  values(_r.restaurant_id,auth.uid(),'workforce_leave_'||_status,'staff_leave_request',_request_id,jsonb_build_object('staff_id',_r.staff_id,'note',_note));
end;
$$;

revoke all on function public.review_workforce_leave_request(uuid,text,text) from public,anon;
grant execute on function public.review_workforce_leave_request(uuid,text,text) to authenticated,service_role;

create or replace function public.submit_leave_request(
  _restaurant_id uuid,
  _start date,
  _end date,
  _start_time time,
  _end_time time,
  _reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  _staff_id uuid;
  _request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not app.has_restaurant_access(_restaurant_id) then raise exception 'Restaurant access is required' using errcode='42501'; end if;
  select s.id into _staff_id from public.staff s where s.restaurant_id=_restaurant_id and s.auth_user_id=auth.uid() and s.is_active limit 1;
  if _staff_id is null then raise exception 'Active staff member not found' using errcode='22023'; end if;
  if _end < _start or (_end=_start and _end_time<=_start_time) then raise exception 'Invalid leave window' using errcode='22023'; end if;
  if nullif(btrim(coalesce(_reason,'')),'') is null then raise exception 'A reason is required' using errcode='22023'; end if;
  insert into public.staff_leave_requests(restaurant_id,staff_id,start_date,end_date,start_time,end_time,reason,status,leave_type)
  values(_restaurant_id,_staff_id,_start,_end,_start_time,_end_time,btrim(_reason),'pending','annual')
  returning id into _request_id;
  return _request_id;
end;
$$;

revoke all on function public.submit_leave_request(uuid,date,date,time,time,text) from public,anon;
grant execute on function public.submit_leave_request(uuid,date,date,time,time,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
