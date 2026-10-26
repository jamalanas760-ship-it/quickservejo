import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url),'utf8');
const root = '../../supabase/migrations/';
const boundary = await read(root+'20261026072332_reliability_tenant_boundaries.sql');
const dispatch = await read(root+'20261026072339_reliable_integration_dispatch.sql');
const counters = await read(root+'20261026072346_operational_counter_snapshot.sql');
const platform = await read(root+'20261026075951_platform_reliability_snapshot.sql');
const notices = await read(root+'20261026073544_notification_job_leases.sql');
let db, native;
if (process.env.TEST_DATABASE_URL) {
  const url = new URL(process.env.TEST_DATABASE_URL);
  if (!['localhost','127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw Error('Use only an isolated local test database');
  const {default:postgres} = await import('postgres');
  native = postgres(url.href,{max:1});
  db = {exec:sql=>native.unsafe(sql).simple(),query:async(sql,args=[])=>({rows:await native.unsafe(sql,args)}),close:()=>native.end()};
} else {
  const {PGlite} = await import('@electric-sql/pglite'); db = new PGlite();
}
const id = n => `${String(n).padStart(8,'0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
const A=id(1), B=id(2), UA=id(3), UB=id(4), SA=id(5), SB=id(6), CA=id(7), CB=id(8), OA=id(9), OB=id(10);
await db.exec(await read('./fixture.sql'));
for (const sql of [boundary,dispatch,counters,notices,platform]) await db.exec(sql);
await db.exec(`insert into auth.users(id) values('${UA}'),('${UB}');
 insert into restaurants(id) values('${A}'),('${B}');
 insert into staff(id,restaurant_id,auth_user_id) values('${SA}','${A}','${UA}'),('${SB}','${B}','${UB}');
 insert into integration_connections(id,restaurant_id) values('${CA}','${A}'),('${CB}','${B}');
 insert into orders(id,restaurant_id,assigned_staff_id) values('${OA}','${A}','${SA}'),('${OB}','${B}','${SB}');`);
const reject = async sql => assert.rejects(db.query(sql),error=>error.code==='23503');

test('tenant-aware FKs reject cross-restaurant references even for privileged callers', async()=>{
 await reject(`insert into order_items(id,restaurant_id,order_id) values('${id(11)}','${A}','${OB}')`);
 await reject(`update orders set assigned_staff_id='${SB}' where id='${OA}'`);
 await db.exec(`insert into order_items(id,restaurant_id,order_id) values('${id(12)}','${A}','${OA}')`);
 await reject(`update orders set restaurant_id='${B}',assigned_staff_id=null where id='${OA}'`);
 const {rows} = await db.query("select count(*)::int n from pg_constraint where conname='order_items_order_id_fkey'");
 assert.equal(rows[0].n,1); // No duplicate embedded-join relationship.
});

test('SET NULL clears only the optional record ID; cascade remains intact',async()=>{
 await db.exec(`delete from staff where id='${SA}'`);
 const {rows}=await db.query(`select restaurant_id,assigned_staff_id from orders where id='${OA}'`);
 assert.equal(rows[0].restaurant_id,A);assert.equal(rows[0].assigned_staff_id,null);
 await db.exec(`insert into staff(id,restaurant_id,auth_user_id) values('${SA}','${A}','${UA}'); delete from orders where id='${OA}'`);
 assert.equal((await db.query(`select count(*)::int n from order_items where id='${id(12)}'`)).rows[0].n,0);
 await db.exec(`insert into orders(id,restaurant_id) values('${OA}','${A}')`);
});

test('dirty tenant data aborts a migration without silently repairing records',async()=>{
 await db.exec(`create table dirty_parent(id uuid primary key,restaurant_id uuid);create table dirty_child(id uuid primary key,restaurant_id uuid,parent_id uuid references dirty_parent(id));insert into dirty_parent values('${id(30)}','${A}');insert into dirty_child values('${id(31)}','${B}','${id(30)}');`);
 await assert.rejects(db.exec(boundary),/Tenant mismatch/);await db.exec('rollback');
 assert.equal((await db.query('select restaurant_id from dirty_child')).rows[0].restaurant_id,B);
 await db.exec('drop table dirty_child; drop table dirty_parent');
});

test('counter snapshot uses caller RLS and rejects another tenant',async()=>{
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${UA}',false)`);
 try {
  const {rows}=await db.query('select get_operational_counters($1::uuid) value',[A]);assert.equal(rows[0].value.orders,1);
  await assert.rejects(db.query('select get_operational_counters($1::uuid)',[B]),error=>error.code==='42501');
  assert.equal((await db.query('select id from orders where restaurant_id=$1',[B])).rows.length,0);
  await assert.rejects(db.query('select * from claim_integration_jobs()'),error=>error.code==='42501');
 } finally {await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");}
});

test('atomic job claims increment once, limit each tenant, and recover expired leases',async()=>{
 for (const [r,c] of [[A,CA],[B,CB]]) await db.query('insert into integration_jobs(restaurant_id,connection_id) select $1::uuid,$2::uuid from generate_series(1,6)',[r,c]);
 const first=(await db.query('select * from claim_integration_jobs()')).rows;
 assert.equal(first.length,4);assert.equal(first.filter(j=>j.restaurant_id===A).length,2);
 assert.ok(first.every(j=>j.attempt_count===1 && j.lease_token));
 const second=(await db.query('select * from claim_integration_jobs()')).rows;
 assert.ok(second.every(j=>!first.some(f=>f.id===j.id)));
 await db.query("update integration_jobs set lease_expires_at=now()-interval '1 second',attempt_count=5 where id=$1",[first[0].id]);
 await db.query('select * from claim_integration_jobs()');
 const expired=(await db.query('select status,lease_token from integration_jobs where id=$1',[first[0].id])).rows[0];
 assert.equal(expired.status,'failed');assert.equal(expired.lease_token,null);
});

test('uncertain notification attempts are quarantined, not silently replayed',async()=>{
 await db.query('insert into booking_notification_jobs(restaurant_id) values($1),($2)',[A,B]);
 const claimed=(await db.query("select * from claim_notification_jobs('booking_notification_jobs')")).rows;
 assert.equal(claimed.length,2);
 await db.exec("update booking_notification_jobs set lease_expires_at=now()-interval '1 second'");
 assert.equal((await db.query("select * from claim_notification_jobs('booking_notification_jobs')")).rows.length,0);
 const {rows}=await db.query('select status,attempt_count,last_error from booking_notification_jobs');
 assert.ok(rows.every(j=>j.status==='failed'&&j.attempt_count===3&&j.last_error.includes('unknown')));
 await assert.rejects(db.query("select * from claim_notification_jobs('orders')"),/Unsupported/);
});

test('campaign aggregate counts include in-flight recipients and rows beyond API limits',async()=>{
 const campaign=id(45);
 await db.query("insert into crm_campaign_recipients(restaurant_id,campaign_id,status) select $1,$2,'sent' from generate_series(1,1201)",[A,campaign]);
 await db.query("insert into crm_campaign_recipients(restaurant_id,campaign_id,status) values($1,$2,'sending')",[A,campaign]);
 const value=(await db.query('select campaign_delivery_counts($1) value',[campaign])).rows[0].value;
 assert.equal(value.sent,1201);assert.equal(value.remaining,1);
});

test('native PostgreSQL overlapping claims skip locked rows instead of double processing',{skip:!native},async()=>{
 const {default:postgres}=await import('postgres');const other=postgres(process.env.TEST_DATABASE_URL,{max:1});
 await db.exec('delete from integration_jobs');
 for(const [r,c]of[[A,CA],[B,CB]])await db.query('insert into integration_jobs(restaurant_id,connection_id) select $1::uuid,$2::uuid from generate_series(1,6)',[r,c]);
 let release,locked;const lockReady=new Promise(r=>{locked=r});const hold=new Promise(r=>{release=r});let first;
 const pending=native.begin(async tx=>{first=await tx`select * from claim_integration_jobs()`;locked();await hold;});
 await lockReady;
 try{const second=await other.begin(async tx=>{await tx`set local statement_timeout='1s'`;return tx`select * from claim_integration_jobs()`;});assert.ok(second.every(s=>!first.some(f=>f.id===s.id)));}
 finally{release();await pending;await other.end();}
});

test('platform queue metrics are restricted to the authenticated platform owner',async()=>{
 await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${UB}',false)`);
 try{await assert.rejects(db.query('select platform_reliability_snapshot()'),error=>error.code==='42501');}
 finally{await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");}
 await db.exec(`create or replace function public.is_platform_owner() returns boolean language sql stable as $$select auth.uid()='${UA}'::uuid$$;set role authenticated;select set_config('request.jwt.claim.sub','${UA}',false)`);
 try{const value=(await db.query('select platform_reliability_snapshot() value')).rows[0].value;assert.ok(Array.isArray(value.queues));assert.ok(value.queues.some(q=>q.queue==='booking_notification_jobs'&&Number(q.failed)>0));}
 finally{await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");}
});

test('gateway quota is database-backed and shared across requests',async()=>{
 await db.exec(await read('../../services/mcp-gateway/database-setup.sql'));
 await db.exec('set role quickserve_mcp_gateway');
 try{
  const {rows}=await db.query('select count(*) filter(where mcp_gateway.consume_request_budget($1::uuid))::int allowed from generate_series(1,121)',[UA]);
  assert.equal(rows[0].allowed,120);
  assert.equal((await db.query('select mcp_gateway.consume_request_budget($1::uuid) allowed',[UA])).rows[0].allowed,false);
  assert.equal((await db.query('select mcp_gateway.consume_request_budget($1::uuid) allowed',[UB])).rows[0].allowed,true);
 }finally{await db.exec('reset role');}
});

test.after(()=>db.close());
