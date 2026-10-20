import test from 'node:test';
import assert from 'node:assert/strict';
import { workforcePages } from '../src/lib/workforce-pages.ts';
test('workforce totals and approval queues include rows beyond the API page limit', async () => {
  const all = Array.from({length: 1201}, (_, id) => ({id}));
  const ranges = [];
  const rows = await workforcePages(() => ({range: async (start,end) => {ranges.push([start,end]);return {data:all.slice(start,end+1),error:null};}}));
  assert.deepEqual(rows, all);
  assert.deepEqual(ranges, [[0,499],[500,999],[1000,1499]]);
});
test('a failed later page cannot present incomplete payroll or leave totals as complete', async () => {
  await assert.rejects(workforcePages(() => ({range: async (start) => start ? {data:null,error:Error('Unavailable')} : {data:Array(500).fill({id:1}),error:null}})), /Unavailable/);
});
