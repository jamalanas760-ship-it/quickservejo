import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveIntegrationBinding,postIntegrationJson,mapConcurrent,approvedEndpoint} from '../supabase/functions/_shared/integration-transport.ts';
import {finishLeasedJob,ambiguousDelivery} from '../supabase/functions/_shared/notification-lease.ts';
import {createCoalescedRefresh} from '../src/lib/coalesced-refresh.ts';
import {safeTelemetryRoute} from '../src/lib/telemetry-scope.ts';
const job={restaurant_id:'restaurant-a',connection_id:'connection-a',category:'delivery'};
const connection={provider:'aggregator',config:{endpoint_url:'https://provider.example/ingest'}};
const binding={restaurantId:job.restaurant_id,connectionId:job.connection_id,category:'delivery',provider:'aggregator',endpoint:connection.config.endpoint_url,token:'private-tenant-token'};
test('integration credentials are bound to the exact tenant, connection, provider and endpoint',()=>{
 const raw=JSON.stringify([binding]);assert.equal(resolveIntegrationBinding(raw,job,connection).token,binding.token);
 for(const patch of [{restaurant_id:'other'},{connection_id:'other'},{category:'accounting'}])assert.throws(()=>resolveIntegrationBinding(raw,{...job,...patch},connection));
 assert.throws(()=>resolveIntegrationBinding(raw,job,{...connection,provider:'other'}));
 assert.throws(()=>resolveIntegrationBinding(raw,job,{...connection,config:{endpoint_url:'https://attacker.example/steal'}}));
 assert.throws(()=>resolveIntegrationBinding(JSON.stringify([binding,binding]),job,connection));
 assert.throws(()=>resolveIntegrationBinding(undefined,job,connection));
});
test('integration transport rejects unsafe endpoints and will not follow credential-bearing redirects',async()=>{
 for(const url of ['http://provider.example/','https://localhost/','https://127.0.0.1/','https://2130706433/','https://[::1]/','https://meta.internal/','https://user:pass@provider.example/','https://provider.example:444/'])assert.throws(()=>approvedEndpoint(url));
 let requests=0;
 const response=await postIntegrationJson(binding,'stable-key',{order:'synthetic'},async(url,init)=>{
  requests++;assert.equal(url,binding.endpoint);assert.equal(init.redirect,'error');assert.ok(init.signal);assert.equal(init.headers['Idempotency-Key'],'stable-key');
  return new Response('{"reference":"provider-ref"}');
 });
 assert.equal(response.data.reference,'provider-ref');assert.equal(requests,1);
 await assert.rejects(postIntegrationJson(binding,'key',{},async()=>new Response('PRIVATE_PROVIDER_SECRET',{status:503})),error=>!error.message.includes('PRIVATE_PROVIDER_SECRET'));
 await assert.rejects(postIntegrationJson(binding,'key',{},async()=>new Response(new Uint8Array(65537))),/exceeds/);
});
test('worker concurrency is bounded while processing every claimed job',async()=>{
 let active=0,max=0;
 const values=await mapConcurrent(Array.from({length:20},(_,i)=>i),4,async i=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,1));active--;return i*2;});
 assert.equal(max,4);assert.deepEqual(values,Array.from({length:20},(_,i)=>i*2));
});
test('a stale notification lease cannot be acknowledged',async()=>{
 const query={update(){return this},eq(){return this},gt(){return this},select(){return this},async maybeSingle(){return{data:null,error:null}}};
 await assert.rejects(finishLeasedJob({from:()=>query},'booking_messages',{id:'one',lease_token:'old'},{provider_status:'sent'}),/lease was lost/);
 assert.equal(ambiguousDelivery(new DOMException('deadline','TimeoutError')),true);
 assert.equal(ambiguousDelivery(new TypeError('network')),true);
 assert.equal(ambiguousDelivery(new Error('HTTP 400')),false);
});
test('event bursts coalesce and cleanup cancels pending refreshes',t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;const refresh=createCoalescedRefresh(()=>calls++,750);
 for(let i=0;i<100;i++)refresh.schedule();t.mock.timers.tick(749);assert.equal(calls,0);t.mock.timers.tick(1);assert.equal(calls,1);
 refresh.schedule();refresh.cancel();t.mock.timers.tick(1000);assert.equal(calls,1);
});
test('diagnostic routes do not retain bearer links, UUIDs or query secrets',()=>{
 assert.equal(safeTelemetryRoute('/booking/private-link?token=secret'),'/booking/:id');
 assert.equal(safeTelemetryRoute('/manage/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/orders'),'/manage/:id/orders');
 assert.equal(safeTelemetryRoute('https://example.com/o/secret-token?password=x'),'/o/:id');
});

test('batched reads bound IN filters and reject incomplete later pages',async()=>{
 const {batchedPages}=await import('../src/lib/batched-pages.ts');
 const ids=Array.from({length:120},(_,i)=>String(i));let largest=0;
 const rows=await batchedPages(ids,batch=>({range:async()=>{largest=Math.max(largest,batch.length);return{data:batch,error:null}}}));
 assert.equal(largest,50);assert.deepEqual(rows,ids);
 await assert.rejects(batchedPages(['one'],()=>({range:async offset=>offset===0?{data:Array(500).fill('row'),error:null}:{data:null,error:Error('later page failed')}})),/later page/);
});
