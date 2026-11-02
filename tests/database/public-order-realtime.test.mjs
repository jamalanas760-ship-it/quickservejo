import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261102123348_public_order_realtime_hints.sql",
    import.meta.url,
  ),
  "utf8",
);
const topic = (token) =>
  "order-status:" +
  createHash("sha256")
    .update("quickserve:order:" + token)
    .digest("hex");
test("order broadcasts are isolated refresh hints and cannot expose rows or block kitchen writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema app;create schema realtime;
 create table realtime.messages(payload jsonb,event text,topic text,private boolean);
 create function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language sql as $$insert into realtime.messages values(payload,event,topic,private)$$;
 create table public.orders(id int primary key,public_token text not null unique,order_number text,status text,payment_status text,subtotal numeric,tax_amount numeric,service_amount numeric,discount_amount numeric,total numeric,currency text,created_at timestamptz,updated_at timestamptz,guest_phone text);
 alter table public.orders enable row level security;
 insert into public.orders values(1,'aabbccddeeff001122334455','Q1','new','unpaid',5,0,0,0,5,'JOD',now(),now(),'PRIVATE-PHONE'),(2,'11223344556677889900aabb','Q2','new','unpaid',7,0,0,0,7,'JOD',now(),now(),'OTHER-PRIVATE');`);
    await db.exec(migration);
    await db.exec(`update public.orders set updated_at=now() where id=1`);
    assert.equal((await db.query("select * from realtime.messages")).rows.length, 0);
    await db.exec(`update public.orders set status='accepted' where id=1`);
    let rows = (await db.query("select * from realtime.messages")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].topic, topic("aabbccddeeff001122334455"));
    assert.equal(rows[0].event, "order_changed");
    assert.deepEqual(rows[0].payload, { refresh: true });
    assert.equal(rows[0].private, false);
    assert.ok(!JSON.stringify(rows).includes("PRIVATE"));
    assert.ok(!JSON.stringify(rows).includes("aabbccddeeff001122334455"));
    await db.exec(`update public.orders set total=8 where id=2`);
    rows = (await db.query("select * from realtime.messages")).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[1].topic, topic("11223344556677889900aabb"));
    assert.notEqual(rows[0].topic, rows[1].topic);
    await db.exec(`update public.orders set public_token='ffeeddccbbaa998877665544' where id=1`);
    rows = (await db.query("select * from realtime.messages")).rows;
    assert.equal(rows.length, 4);
    assert.equal(rows[2].topic, topic("aabbccddeeff001122334455"));
    assert.equal(rows[3].topic, topic("ffeeddccbbaa998877665544"));
    const permissions = (
      await db.query(
        `select has_function_privilege('anon','app.notify_public_order_change()','execute') anon_execute,has_function_privilege('authenticated','app.notify_public_order_change()','execute') authenticated_execute,has_table_privilege('anon','public.orders','select') anon_select`,
      )
    ).rows[0];
    assert.deepEqual(permissions, {
      anon_execute: false,
      authenticated_execute: false,
      anon_select: false,
    });
    await db.exec(
      `create or replace function realtime.send(payload jsonb,event text,topic text,private boolean) returns void language plpgsql as $$begin raise exception 'simulated realtime outage';end$$;update public.orders set status='ready' where id=1;`,
    );
    assert.equal(
      (await db.query("select status from public.orders where id=1")).rows[0].status,
      "ready",
    );
  } finally {
    await db.close();
  }
});
