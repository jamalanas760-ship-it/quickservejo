import postgres from "postgres";
import { AccessError } from "./auth.mjs";
export function createDatabase(config, connect = postgres) {
  const sql = connect(config.databaseUrl, {
    ssl: { rejectUnauthorized: true },
    max: 5,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 20,
    onnotice: () => {},
  });
  return {
    async assertRole() {
      const [role] =
        await sql`select rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication, rolinherit,
        pg_has_role(current_user, 'authenticated', 'MEMBER') member,
        exists(select 1 from pg_roles elevated where (elevated.rolsuper or elevated.rolbypassrls or elevated.rolcreaterole)
          and pg_has_role(current_user,elevated.oid,'MEMBER')) elevated_member from pg_roles where rolname = current_user`;
      if (
        !role ||
        role.rolname !== "quickserve_mcp_gateway" ||
        !role.member ||
        role.rolsuper ||
        role.rolbypassrls ||
        role.rolcreaterole ||
        role.rolcreatedb ||
        role.rolreplication ||
        role.rolinherit ||
        role.elevated_member
      )
        throw new Error("Gateway database role is not least privilege");
      const [owner] =
        await sql`select exists(select 1 from pg_class c join pg_roles r on r.oid = c.relowner
        join pg_namespace n on n.oid = c.relnamespace where r.rolname in (current_user, 'authenticated')
        and n.nspname = 'public' and c.relkind in ('r','p')) owns_tables`;
      if (owner.owns_tables)
        throw new Error("Gateway/authenticated roles must not own application tables");
    },
    async run(identity, write, operation) {
      if (write && !identity.scopes.has("quickserve:write"))
        throw new AccessError(403, "insufficient_scope");
      // One transaction per call: role and claims cannot leak across pooled connections.
      return sql.begin(async (tx) => {
        if (!write) await tx`set transaction read only`;
        await tx`set local statement_timeout = '8s'`;
        await tx`set local lock_timeout = '2s'`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({
          sub: identity.userId,
          role: "authenticated",
          aud: config.audience,
          iss: identity.issuer,
          aal: "aal1",
          client_id: identity.clientId,
        })}, true)`;
        const [enabled] =
          await tx`select mcp_gateway.user_enabled(${identity.userId}::uuid) enabled`;
        if (!enabled.enabled) throw new AccessError(403, "account_unavailable");
        await tx`set local role authenticated`;
        return operation(tx);
      });
    },
    close: () => sql.end({ timeout: 5 }),
  };
}
