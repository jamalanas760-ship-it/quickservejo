import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("password policy RLS isolates tenants, limits writes to admins and validates bounds", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon nologin;create role authenticated nologin;create schema auth;create schema app;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table restaurants(id uuid primary key);create table staff(id uuid primary key,restaurant_id uuid references restaurants(id),auth_user_id uuid,role text,is_active boolean);alter table staff enable row level security;create policy self_read on staff for select to authenticated using(auth_user_id=auth.uid());create function app.is_super_admin() returns boolean language sql stable as $$select false$$;create function app.has_restaurant_access(r uuid) returns boolean language sql stable as $$select exists(select 1 from staff where restaurant_id=r and auth_user_id=auth.uid() and is_active)$$;grant usage on schema public,auth,app to authenticated;grant select on staff to authenticated;insert into restaurants values('${id(1)}'),('${id(2)}');insert into staff values('${id(11)}','${id(1)}','${id(21)}','restaurant_admin',true),('${id(12)}','${id(1)}','${id(22)}','waiter',true),('${id(13)}','${id(2)}','${id(23)}','restaurant_admin',true);`,
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261029122424_workspace_password_policy.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261029123204_restrict_password_policy_grants.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${id(21)}',false);insert into workspace_password_policies(restaurant_id) values('${id(1)}');`,
    );
    assert.equal(
      (
        await db.query(
          "select has_table_privilege('authenticated','workspace_password_policies','TRUNCATE') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      db.exec(`insert into workspace_password_policies(restaurant_id) values('${id(2)}')`),
      /row-level security/,
    );
    await assert.rejects(
      db.exec(`update workspace_password_policies set min_length=7 where restaurant_id='${id(1)}'`),
      /check constraint/,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${id(22)}',false)`);
    assert.equal((await db.query("select * from workspace_password_policies")).rows.length, 1);
    assert.equal(
      (await db.query(`update workspace_password_policies set min_length=20 returning *`)).rows
        .length,
      0,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${id(23)}',false)`);
    assert.equal((await db.query("select * from workspace_password_policies")).rows.length, 0);
    await db.exec(`insert into workspace_password_policies(restaurant_id) values('${id(2)}')`);
    assert.equal(
      (await db.query("select restaurant_id from workspace_password_policies")).rows[0]
        .restaurant_id,
      id(2),
    );
  } finally {
    await db.close();
  }
});
