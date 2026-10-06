import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
async function module(path) { const source=await readFile(new URL(path,import.meta.url),'utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`); }
const {pickFloorObject}=await module('../src/lib/floor-picking.ts');
const {rotateFloorObject}=await module('../src/lib/floor-plan-elements.ts');
const hit=(kind,id,extra={})=>({object:{userData:{kind,id,...extra}}});
test('visible furniture wins over an intersecting zone or overlapping touch proxy',()=>{
 assert.deepEqual(pickFloorObject([hit('zone','z'),hit('element','other',{pickProxy:true}),hit('element','chair')]),{kind:'element',id:'chair'});
 assert.deepEqual(pickFloorObject([hit('zone','z'),hit('table','table')]),{kind:'table',id:'table'});
});
test('generous furniture touch areas beat zones while nearest furniture retains priority',()=>{
 assert.deepEqual(pickFloorObject([hit('zone','z'),hit('element','small',{pickProxy:true})]),{kind:'element',id:'small'});
 assert.deepEqual(pickFloorObject([hit('element','near'),hit('element','far')]),{kind:'element',id:'near'});
});
test('mesh ancestry selects its furniture, and selection rings never intercept it',()=>{
 const mesh={object:{userData:{},parent:{userData:{kind:'element',id:'sofa'}}}};
 assert.deepEqual(pickFloorObject([hit('element','ring',{selectionRing:true}),mesh]),{kind:'element',id:'sofa'});
 assert.equal(pickFloorObject([{object:{userData:{selectionRing:true},parent:{userData:{kind:'element',id:'sofa'}}}}]),null);
});
test('zone and entrance selection remains available away from furniture',()=>{
 assert.deepEqual(pickFloorObject([hit('zone','z')]),{kind:'zone',id:'z'});
 assert.deepEqual(pickFloorObject([hit('zone','z'),hit('entrance','door')]),{kind:'entrance',id:'door'});
 assert.equal(pickFloorObject([hit('unrelated','floor')]),null);
 assert.equal(pickFloorObject([]),null);
});
test('rotation crosses both angle boundaries without losing the requested turn',()=>{
 assert.equal(rotateFloorObject(179,45),-136);
 assert.equal(rotateFloorObject(-179,-45),136);
 for(const start of [-180,-135,0,135,179]) {let angle=start;for(let i=0;i<8;i++)angle=rotateFloorObject(angle,45);assert.equal(angle,start);assert.equal(rotateFloorObject(rotateFloorObject(start,45),-45),start);}
});
