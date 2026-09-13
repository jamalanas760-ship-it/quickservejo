import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessTokenResolver, resolveSessionUser, safeSessionRedirect } from '../src/lib/session-token.ts';
import { fetchWithSafeRetry } from '../src/lib/safe-fetch.ts';

const now = () => 100_000;
const result = (token, expiry, error = null) => ({ data: { session: token ? { access_token: token, expires_at: expiry } : null }, error });
test('revoked cached user stays on sign-in instead of redirecting in a loop',async()=>{
  const user=await resolveSessionUser({getSession:async()=>({data:{session:{user:{id:'cached'}}},error:null}),getUser:async()=>({data:{user:null},error:{status:401}})});
  assert.equal(user,null);
});
test('transient user validation preserves the local session for display only',async()=>{
  const user=await resolveSessionUser({getSession:async()=>({data:{session:{user:{id:'cached'}}},error:null}),getUser:async()=>({data:{user:null},error:{status:503}})});
  assert.deepEqual(user,{id:'cached'});
});
test('session transport failure does not masquerade as signed-out',async()=>{
  await assert.rejects(resolveSessionUser({getSession:async()=>{throw Object.assign(Error('Unavailable'),{status:503});},getUser:async()=>{throw Error('unexpected');}}));
});
test('return screen keeps its query and fragment',()=>assert.equal(safeSessionRedirect('/manage/123/staff?view=active#team'),'/manage/123/staff?view=active#team'));
test('external and sign-in-loop redirect targets are rejected',()=>{
  for(const path of ['//evil.test','/\\evil.test','https://evil.test','/auth','/auth?redirect=/auth','/\nevil.test']) assert.equal(safeSessionRedirect(path),'/dashboard');
});
test('valid sessions do not refresh', async () => {
  const token = createAccessTokenResolver({ getSession: async () => result('valid',200), refreshSession: async () => { throw Error('unexpected refresh'); } },now);
  assert.equal(await token(),'valid');
});
test('concurrent protected calls share one refresh', async () => {
  let calls=0;
  const token=createAccessTokenResolver({getSession:async()=>result('old',110),refreshSession:async()=>{calls++;return result('new',200);}},now);
  assert.deepEqual(await Promise.all([token(),token(),token()]),['new','new','new']); assert.equal(calls,1);
});
test('temporary refresh outage preserves a still-valid token', async () => {
  const token=createAccessTokenResolver({getSession:async()=>result('old',110),refreshSession:async()=>result(null,0,{status:503})},now);
  assert.equal(await token(),'old');
});
test('expired token is not sent during an outage', async () => {
  const token=createAccessTokenResolver({getSession:async()=>result('old',90),refreshSession:async()=>result(null,0,{status:503})},now);
  await assert.rejects(token(),/temporarily unavailable/);
});
test('revoked refresh does not fall back to the old token', async () => {
  const token=createAccessTokenResolver({getSession:async()=>result('old',110),refreshSession:async()=>result(null,0,{status:401})},now);
  await assert.rejects(token(),/session expired/);
});
test('failed refresh does not poison later attempts', async () => {
  let calls=0;
  const token=createAccessTokenResolver({getSession:async()=>result('old',90),refreshSession:async()=>++calls===1?result(null,0,{status:503}):result('new',200)},now);
  await assert.rejects(token()); assert.equal(await token(),'new'); assert.equal(calls,2);
});
test('signed-out public server functions remain usable', async () => {
  const token=createAccessTokenResolver({getSession:async()=>result(null,0),refreshSession:async()=>{throw Error('unexpected');}},now);
  assert.equal(await token(),null);
});
test('read retry is bounded', async () => {
  let calls=0; const waits=[];
  const response=await fetchWithSafeRetry('https://example.test',{},async()=>{calls++;return new Response('',{status:503});},async n=>{waits.push(n);});
  assert.equal(response.status,503); assert.equal(calls,3); assert.deepEqual(waits,[250,500]);
});
for (const method of ['POST','PATCH','PUT','DELETE']) test(`${method} is never replayed`,async()=>{
  let calls=0;
  await fetchWithSafeRetry('https://example.test',{method},async()=>{calls++;return new Response('',{status:503});});
  assert.equal(calls,1);
});
test('Request method is honored when init has no method',async()=>{
  let calls=0; const request=new Request('https://example.test',{method:'POST'});
  await assert.rejects(fetchWithSafeRetry(request,{},async()=>{calls++;throw TypeError('Failed to fetch');}));
  assert.equal(calls,1);
});
test('authentication failures are not retried',async()=>{
  let calls=0;
  await fetchWithSafeRetry('https://example.test',{},async()=>{calls++;return new Response('',{status:401});});
  assert.equal(calls,1);
});
test('aborted reads are not retried',async()=>{
  let calls=0;
  await assert.rejects(fetchWithSafeRetry('https://example.test',{},async()=>{calls++;throw new DOMException('aborted','AbortError');}));
  assert.equal(calls,1);
});
