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

-- Shared per-account quota survives restarts and scales across gateway replicas.
CREATE TABLE IF NOT EXISTS mcp_gateway.request_budgets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  requests integer NOT NULL
);
ALTER TABLE mcp_gateway.request_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mcp_gateway.request_budgets FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON mcp_gateway.request_budgets TO quickserve_mcp_gateway;
DROP POLICY IF EXISTS gateway_budget_access ON mcp_gateway.request_budgets;
CREATE POLICY gateway_budget_access ON mcp_gateway.request_budgets
  TO quickserve_mcp_gateway USING (true) WITH CHECK (true);
CREATE OR REPLACE FUNCTION mcp_gateway.consume_request_budget(_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  INSERT INTO mcp_gateway.request_budgets(user_id,window_start,requests)
  VALUES(_user_id,now(),1)
  ON CONFLICT(user_id) DO UPDATE SET
    window_start=CASE WHEN mcp_gateway.request_budgets.window_start<=now()-interval '1 minute' THEN now() ELSE mcp_gateway.request_budgets.window_start END,
    requests=CASE WHEN mcp_gateway.request_budgets.window_start<=now()-interval '1 minute' THEN 1 ELSE mcp_gateway.request_budgets.requests+1 END
  RETURNING requests<=120;
$$;
REVOKE ALL ON FUNCTION mcp_gateway.consume_request_budget(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION mcp_gateway.consume_request_budget(uuid) TO quickserve_mcp_gateway;
