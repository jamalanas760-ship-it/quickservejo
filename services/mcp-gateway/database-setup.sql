-- Reviewed setup for the separate gateway. Does not change Supabase OAuth settings.
-- Run as a database administrator only after OAuth/hosting configuration is ready.
-- NOLOGIN until a deployment operator assigns a strong password securely and enables LOGIN.
begin;
do $$begin
 if not exists(select 1 from pg_roles where rolname='quickserve_mcp_gateway') then
  create role quickserve_mcp_gateway nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
end$$;
grant authenticated to quickserve_mcp_gateway;
create schema if not exists mcp_gateway;
revoke all on schema mcp_gateway from public,anon,authenticated;
grant usage on schema mcp_gateway to quickserve_mcp_gateway;
-- Internal lookup only: authenticated cannot query auth.users directly.
-- No application-record reads or writes occur under SECURITY DEFINER.
create or replace function mcp_gateway.user_enabled(_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select _user_id=auth.uid() and exists(select 1 from auth.users u where u.id=_user_id
   and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()));
$$;
revoke all on function mcp_gateway.user_enabled(uuid) from public,anon,authenticated,service_role;
grant execute on function mcp_gateway.user_enabled(uuid) to quickserve_mcp_gateway;
commit;
