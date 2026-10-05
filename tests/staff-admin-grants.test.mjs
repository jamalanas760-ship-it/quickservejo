import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const raw=await readFile(new URL('../supabase/functions/staff-admin/index.ts',import.meta.url),'utf8');
const js=ts.transpileModule(raw.replace(/^import .*\n/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const rid='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const callerId='20000000-0000-4000-8000-000000000001',targetId='30000000-0000-4000-8000-000000000001';
async function run({role='restaurant_admin',scope=rid,grant={},body={},validAuth=true}={}) {
  let handler;const writes=[],authWrites=[];
  const caller={id:'caller',auth_user_id:callerId,restaurant_id:rid,role,is_active:true,permission_overrides:grant};
  const target={id:targetId,auth_user_id:'target-user',restaurant_id:scope,role:'waiter',is_active:true,name:'Waiter',email:'waiter@example.test',permission_overrides:{}};
  const rows=[caller,target];
  const admin={from:()=>{let filters=[];let pending=null;const chain={select:()=>chain,eq:(k,v)=>{filters.push([k,v]);return chain},limit:()=>chain,update:data=>{pending=data;return chain},single:async()=>({data:rows.find(r=>filters.every(([k,v])=>r[k]===v)),error:null}),then:resolve=>{if(pending){writes.push(pending);return Promise.resolve({data:null,error:null}).then(resolve)}return Promise.resolve({data:rows.filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}).then(resolve)}};return chain},auth:{admin:{updateUserById:async(uid,data)=>{authWrites.push({uid,data});return {data:{user:{}},error:null}}}}};
  const auth={auth:{getUser:async()=>({data:{user:validAuth?{id:callerId}:null},error:null})}};
  const context={Request,Response,crypto,console:{error(){}},createClient:(_url,key)=>key==='service'?admin:auth,Deno:{env:{get:k=>({SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service'}[k])},serve:fn=>handler=fn}};
  vm.runInNewContext(js,context);
  const response=await handler(new Request('https://example.test/staff-admin',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'update',staffId:targetId,...body})}));
  return {status:response.status,json:await response.json(),writes,authWrites};
}
test('Restaurant Manager persists an extra grant without changing the job role', async()=>{
  const r=await run({body:{permissionOverrides:{manage_payments:true,manage_finance:true,view_erp:true,manage_platform:true}}});
  assert.equal(r.status,200);assert.deepEqual(JSON.parse(JSON.stringify(r.writes)),[{permission_overrides:{manage_payments:true,manage_finance:true,view_erp:true}}]);
});
test('delegated staff manager can edit a profile but cannot delegate permissions or promote roles', async()=>{
  const opts={role:'waiter',grant:{manage_staff:true}};
  assert.equal((await run({...opts,body:{name:'Updated waiter',role:'waiter'}})).status,200);
  for(const body of [{name:'Must not update auth',permissionOverrides:{manage_restaurant:true}},{role:'manager'},{password:'new-password-123'},{email:'new@example.test'},{action:'reset'},{action:'invite',restaurantId:rid,name:'New',email:'new@example.test',role:'waiter'}]){
    const r=await run({...opts,body});assert.equal(r.status,403);assert.equal(r.writes.length,0);assert.equal(r.authWrites.length,0);
  }
});
test('ungranted, revoked, other restaurant, and invalid-auth callers cannot write staff', async()=>{
  for(const opts of [{role:'waiter'},{grant:{manage_staff:false}},{scope:other},{validAuth:false}]){
    const r=await run({...opts,body:{permissionOverrides:{manage_menu:true}}});assert.ok([401,403].includes(r.status));assert.equal(r.writes.length,0);assert.equal(r.authWrites.length,0);
  }
});
