import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261102083928_remove_verified_duplicate_indexes.sql",
    import.meta.url,
  ),
  "utf8",
);
const retained = [
  "order_status_events_order_idx",
  "order_status_events_restaurant_idx",
  "orders_restaurant_created_idx",
  "staff_time_entries_one_open_per_staff_idx",
];
const removed = [
  "order_status_events_order_created_idx",
  "order_status_events_restaurant_created_idx",
  "idx_orders_created_at",
  "staff_time_entries_one_open_idx",
];
async function fixture() {
  const db = new PGlite();
  await db.exec(`
 create table orders(id int primary key,restaurant_id int not null,created_at timestamptz not null);
 create table order_status_events(id int primary key,order_id int references orders,restaurant_id int,created_at timestamptz);
 create table staff_time_entries(id int primary key,staff_id int not null,clock_out timestamptz);
 alter table orders enable row level security;
 create policy restaurant_filter on orders using(restaurant_id=1);
 insert into orders values(1,1,now()),(2,2,now());
 insert into order_status_events values(1,1,1,now()),(2,2,2,now());
 insert into staff_time_entries values(1,11,null),(2,22,null);
 create index order_status_events_order_idx on order_status_events(order_id,created_at);
 create index order_status_events_order_created_idx on order_status_events(order_id,created_at);
 create index order_status_events_restaurant_idx on order_status_events(restaurant_id,created_at desc);
 create index order_status_events_restaurant_created_idx on order_status_events(restaurant_id,created_at desc);
 create index idx_orders_created_at on orders(restaurant_id,created_at desc);
 create index orders_restaurant_created_idx on orders(restaurant_id,created_at desc);
 create unique index staff_time_entries_one_open_idx on staff_time_entries(staff_id) where clock_out is null;
 create unique index staff_time_entries_one_open_per_staff_idx on staff_time_entries(staff_id) where clock_out is null;
 `);
  return db;
}
async function snapshot(db) {
  const tables = ["orders", "order_status_events", "staff_time_entries"];
  const rows = await Promise.all(
    tables.map(async (t) => (await db.query(`select * from ${t} order by id`)).rows),
  );
  const constraints = (
    await db.query(
      "select conname,pg_get_constraintdef(oid) definition from pg_constraint where connamespace='public'::regnamespace order by conname",
    )
  ).rows;
  const policies = (await db.query("select * from pg_policies order by policyname")).rows;
  return { rows, constraints, policies };
}
async function exists(db, name) {
  return (await db.query("select to_regclass($1) is not null present", [`public.${name}`])).rows[0]
    .present;
}
test("cleanup preserves rows, policies, constraints, indexed lookups and one-open-clock-in rule", async () => {
  const db = await fixture();
  try {
    const before = await snapshot(db);
    await db.exec(migration);
    assert.deepEqual(await snapshot(db), before);
    for (const name of retained) assert.equal(await exists(db, name), true);
    for (const name of removed) assert.equal(await exists(db, name), false);
    await assert.rejects(
      db.exec("insert into staff_time_entries values(3,11,null)"),
      (e) => e.code === "23505",
    );
    await db.exec(
      "update staff_time_entries set clock_out=now() where id=1;insert into staff_time_entries values(3,11,null)",
    );
    await db.exec("set enable_seqscan=off");
    for (const [query, index] of [
      [
        "select * from orders where restaurant_id=1 order by created_at desc",
        "orders_restaurant_created_idx",
      ],
      [
        "select * from order_status_events where order_id=1 order by created_at",
        "order_status_events_order_idx",
      ],
      [
        "select * from order_status_events where restaurant_id=1 order by created_at desc",
        "order_status_events_restaurant_idx",
      ],
      [
        "select * from staff_time_entries where staff_id=11 and clock_out is null",
        "staff_time_entries_one_open_per_staff_idx",
      ],
    ])
      assert.ok(JSON.stringify((await db.query(`explain ${query}`)).rows).includes(index));
    await db.exec(migration); // Idempotent replay with healthy equivalents.
  } finally {
    await db.close();
  }
});
for (const [label, alteration, expected] of [
  [
    "column-order drift",
    "drop index idx_orders_created_at;create index idx_orders_created_at on orders(created_at desc,restaurant_id)",
    "Index definitions differ",
  ],
  [
    "uniqueness drift",
    "drop index idx_orders_created_at;create unique index idx_orders_created_at on orders(restaurant_id,created_at desc)",
    "Index definitions differ",
  ],
  [
    "partial-predicate drift",
    "drop index staff_time_entries_one_open_idx;create unique index staff_time_entries_one_open_idx on staff_time_entries(staff_id) where clock_out is not null",
    "Index definitions differ",
  ],
  [
    "missing retained index",
    "drop index orders_restaurant_created_idx",
    "Required retained index missing",
  ],
  [
    "clustered index",
    "alter table order_status_events cluster on order_status_events_order_created_idx",
    "protected or invalid state",
  ],
  [
    "constraint-backed index",
    "drop index idx_orders_created_at;drop index orders_restaurant_created_idx;create unique index idx_orders_created_at on orders(restaurant_id,created_at);create unique index orders_restaurant_created_idx on orders(restaurant_id,created_at);alter table orders add constraint idx_orders_created_at unique using index idx_orders_created_at",
    "constraint, extension or dependent",
  ],
  [
    "extension dependency",
    "alter index idx_orders_created_at depends on extension plpgsql",
    "constraint, extension or dependent",
  ],
])
  test(`cleanup aborts without partial drops for ${label}`, async () => {
    const db = await fixture();
    try {
      await db.exec(alteration);
      const before = await snapshot(db);
      await assert.rejects(db.exec(migration), new RegExp(expected));
      await db.exec("rollback");
      assert.deepEqual(await snapshot(db), before);
      for (const name of removed) assert.equal(await exists(db, name), true);
    } finally {
      await db.close();
    }
  });
