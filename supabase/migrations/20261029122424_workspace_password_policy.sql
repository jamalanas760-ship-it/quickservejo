create table public.workspace_password_policies (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  block_username boolean not null default true,
  block_sequences boolean not null default true,
  min_length integer not null default 12 check (min_length between 8 and 64),
  lowercase integer not null default 1 check (lowercase between 0 and 16),
  uppercase integer not null default 1 check (uppercase between 0 and 16),
  numbers integer not null default 1 check (numbers between 0 and 16),
  special integer not null default 1 check (special between 0 and 16),
  check (lowercase + uppercase + numbers + special <= 64)
);
alter table public.workspace_password_policies enable row level security;
grant select, insert, update on public.workspace_password_policies to authenticated;
revoke all on public.workspace_password_policies from anon;
create policy workspace_policy_read on public.workspace_password_policies for select to authenticated
using (app.is_super_admin() or app.has_restaurant_access(restaurant_id));
create policy workspace_policy_insert on public.workspace_password_policies for insert to authenticated
with check (app.is_super_admin() or exists(select 1 from public.staff s where s.restaurant_id=workspace_password_policies.restaurant_id and s.auth_user_id=(select auth.uid()) and s.is_active and s.role='restaurant_admin'));
create policy workspace_policy_update on public.workspace_password_policies for update to authenticated
using (app.is_super_admin() or exists(select 1 from public.staff s where s.restaurant_id=workspace_password_policies.restaurant_id and s.auth_user_id=(select auth.uid()) and s.is_active and s.role='restaurant_admin'))
with check (app.is_super_admin() or exists(select 1 from public.staff s where s.restaurant_id=workspace_password_policies.restaurant_id and s.auth_user_id=(select auth.uid()) and s.is_active and s.role='restaurant_admin'));
