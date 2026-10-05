import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/team-attendance.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { teamPunchesByStaff, isLiveTeamPunch, MAX_LIVE_PUNCH_MS } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const now = Date.parse('2026-10-01T06:40:00Z');
const punch = (age, fields = {}) => ({ staff_id:'waiter', clock_in:new Date(now-age).toISOString(), clock_out:null, ...fields });
test('two-day forgotten clock-out does not count as live attendance', () => {
  const entry = punch(48*3600000);
  const result = teamPunchesByStaff([entry],now);
  assert.equal(result.live.size,0);
  assert.equal(result.missingClockOut.get('waiter'),entry);
  assert.equal(entry.clock_out,null);
});
test('overnight session stays live until review threshold', () => {
  assert.equal(isLiveTeamPunch(punch(9*3600000),now),true);
  assert.equal(isLiveTeamPunch(punch(MAX_LIVE_PUNCH_MS-1),now),true);
  assert.equal(isLiveTeamPunch(punch(MAX_LIVE_PUNCH_MS),now),false);
});
test('latest session wins regardless of server ordering, completed sessions supersede old open punches', () => {
  const old=punch(48*3600000), current=punch(3600000);
  for(const entries of [[old,current],[current,old]]) assert.equal(teamPunchesByStaff(entries,now).live.get('waiter'),current);
  const closed=punch(3600000,{clock_out:new Date(now).toISOString()});
  const result=teamPunchesByStaff([closed,old],now);
  assert.equal(result.live.size,0);assert.equal(result.missingClockOut.size,0);
});
test('clock progression expires stale status without a new fetch, invalid and future dates are excluded', () => {
  const entry=punch(MAX_LIVE_PUNCH_MS-1000);
  assert.equal(teamPunchesByStaff([entry],now).live.size,1);
  assert.equal(teamPunchesByStaff([entry],now+1000).live.size,0);
  assert.equal(teamPunchesByStaff([punch(-1000),punch(0,{clock_in:'invalid'})],now).live.size,0);
});

test('a forgotten four-day session closed today never proves attendance for today', async () => {
  const { matchingShiftPunch, isUsableTeamPunch } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const current = Date.parse('2026-10-05T10:00:00Z');
  const stale = {staff_id:'waiter',clock_in:'2026-10-01T06:55:33Z',clock_out:'2026-10-05T06:23:06Z',review_status:'pending'};
  assert.equal(isUsableTeamPunch(stale,current),false);
  assert.equal(matchingShiftPunch([stale],'waiter',Date.parse('2026-10-05T06:00:00Z'),Date.parse('2026-10-05T14:00:00Z'),current),undefined);
  assert.equal(teamPunchesByStaff([stale],current).reviewRequired.get('waiter'),stale);
  assert.equal(teamPunchesByStaff([stale],current).live.size,0);
});
test('valid same-shift clock-out is evidence, invalid/future/rejected records are not', async () => {
  const { matchingShiftPunch } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const start=now-2*3600000,end=now+6*3600000;
  const valid=punch(3600000,{clock_out:new Date(now-600000).toISOString()});
  const invalid=[{...valid,clock_out:new Date(now+1000).toISOString()},{...valid,clock_out:valid.clock_in},{...valid,clock_out:'invalid'},{...valid,review_status:'rejected'},punch(25*3600000,{clock_out:new Date(now).toISOString()})];
  assert.equal(matchingShiftPunch(invalid,'waiter',start,end,now),undefined);
  assert.equal(matchingShiftPunch([...invalid,valid],'waiter',start,end,now),valid);
});
test('valid overnight and early clock-in sessions stay matched to their shift', async () => {
  const { matchingShiftPunch } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const entry=punch(9*3600000);
  assert.equal(matchingShiftPunch([entry],'waiter',now-8*3600000,now+3600000,now),entry);
  assert.equal(matchingShiftPunch([entry],'waiter',now-3*3600000,now+3600000,now),undefined);
});
