import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStaffCredentialScope, findStaffAuthUser } from '../src/lib/staff-security.ts';

function client(count, error=null) {
  const calls=[];
  const query={select(...args){calls.push(['select',...args]);return this;},eq(...args){calls.push(['eq',...args]);return this;},or(filter){calls.push(['or',filter]);return Promise.resolve({count,error});}};
  return { from(table){calls.push(['from',table]);return query;}, calls };
}
test('tenant Admin checks all higher-role and cross-restaurant memberships',async()=>{
  const db=client(0); await assertStaffCredentialScope(db,'person','restaurant-a',false);
  assert.deepEqual(db.calls.at(-1),['or','role.in.(super_admin,restaurant_admin),restaurant_id.is.null,restaurant_id.neq.restaurant-a']);
  assert.deepEqual(db.calls[2],['eq','auth_user_id','person']);
});
test('protected or shared credentials are denied',async()=>{
  await assert.rejects(assertStaffCredentialScope(client(1),'person','restaurant-a',false),/protected or shared/);
});
test('Super Admin can reset shared regular users, never platform owners',async()=>{
  const db=client(0); await assertStaffCredentialScope(db,'person','restaurant-a',true);
  assert.deepEqual(db.calls.at(-1),['or','role.eq.super_admin']);
  await assert.rejects(assertStaffCredentialScope(client(1),'owner','restaurant-a',true));
});
test('restaurant PINs stay restaurant-bound even when issued by Super Admin',async()=>{
  const db=client(0); await assertStaffCredentialScope(db,'person','restaurant-a',true,true);
  assert.deepEqual(db.calls.at(-1),['or','role.eq.super_admin,restaurant_id.is.null,restaurant_id.neq.restaurant-a']);
  await assert.rejects(assertStaffCredentialScope(client(1),'person','restaurant-a',true,true));
});
test('permission query errors fail closed',async()=>{
  await assert.rejects(assertStaffCredentialScope(client(null),'person','restaurant-a',false));
  await assert.rejects(assertStaffCredentialScope(client(0,new Error('offline')),'person','restaurant-a',false));
});
test('existing Auth account on second page is found',async()=>{
  const pages=[];
  const id=await findStaffAuthUser({listUsers:async({page})=>{pages.push(page);return {error:null,data:{users:page===1?Array.from({length:1000},(_,i)=>({id:String(i),email:`test${i}@example.com`})):[{id:'found',email:'PERSON@example.com'}]}}}},'person@example.com');
  assert.equal(id,'found');assert.deepEqual(pages,[1,2]);
});
test('missing account stops on final page',async()=>{
  let calls=0;const id=await findStaffAuthUser({listUsers:async()=>{calls++;return {error:null,data:{users:[]}}}},'none@example.com');
  assert.equal(id,undefined);assert.equal(calls,1);
});
test('directory errors cannot be mistaken for a new user',async()=>{
  await assert.rejects(findStaffAuthUser({listUsers:async()=>({error:new Error('Unauthorized'),data:{users:[]}})},'none@example.com'));
});
