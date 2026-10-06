import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/latest-save-queue.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createLatestSaveQueue} = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const deferred = () => { let resolve, reject;const promise = new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}; };
test('slow saves serialize writes and coalesce rapid full-layout edits without losing the final angle', async()=>{
 const gate=deferred(), writes=[], states=[];let active=0, peak=0;
 const queue=createLatestSaveQueue({save:async value=>{peak=Math.max(peak,++active);writes.push(value);if(writes.length===1)await gate.promise;active--;},onError:()=>assert.fail('unexpected error'),onPendingChange:value=>states.push(value)});
 queue.enqueue({a:45,b:0});queue.enqueue({a:90,b:0});queue.enqueue({a:135,b:0});queue.enqueue({a:135,b:270});
 assert.equal(queue.isPending,true);let flushed=false;const flush=queue.flush().then(()=>{flushed=true});await Promise.resolve();assert.equal(flushed,false);
 gate.resolve();await flush;assert.deepEqual(writes,[{a:45,b:0},{a:135,b:270}]);assert.equal(peak,1);assert.deepEqual(states,[true,false]);assert.equal(queue.isPending,false);
});
test('an earlier failed save cannot roll back a newer edit that succeeds',async()=>{
 const gate=deferred(),errors=[],writes=[];const queue=createLatestSaveQueue({save:async value=>{writes.push(value);if(value===45)await gate.promise},onError:error=>errors.push(error),onPendingChange:()=>{}});
 queue.enqueue(45);queue.enqueue(180);gate.reject(new Error('offline'));await queue.flush();assert.deepEqual(writes,[45,180]);assert.deepEqual(errors,[]);
});
test('final failure is reported and later interactions can save again',async()=>{
 const errors=[];let fail=true;const queue=createLatestSaveQueue({save:async()=>{if(fail)throw new Error('offline')},onError:(error,value)=>errors.push({error:error.message,value}),onPendingChange:()=>{}});
 queue.enqueue(359);await queue.flush();assert.deepEqual(errors,[{error:'offline',value:359}]);assert.equal(queue.isPending,false);fail=false;queue.enqueue(0);await queue.flush();assert.equal(errors.length,1);
});
