import test from 'node:test';
import assert from 'node:assert/strict';
import { workforceDayStart, workforceHours, workforceLocalTimestamp, workforceLocalInput, workforceInputTimestamp } from '../src/lib/workforce-hours.ts';
import { matchingShiftPunch, preferTeamShift } from '../src/lib/team-attendance.ts';
import { normalizeHomeLayout, moveHomeSection } from '../src/lib/home-layout.ts';
import { normalizeCanvasSize } from '../src/lib/floor-canvas.ts';
const day='2026-10-01', now=Date.parse('2026-10-01T12:00:00Z');
const assignment={staff_id:'s',starts_at:'2026-10-01T06:00:00Z',ends_at:'2026-10-01T14:00:00Z',status:'scheduled'};
test('calendar boundaries use restaurant zone and respect DST',()=>{
 assert.equal(new Date(workforceDayStart(day)).toISOString(),'2026-09-30T21:00:00.000Z');
 assert.equal((workforceDayStart('2026-03-09','America/New_York')-workforceDayStart('2026-03-08','America/New_York'))/3600000,23);
});
test('live actual hours subtract breaks, ignore future/rejected/stale punches and preserve planned hours',()=>{
 const entries=[{staff_id:'s',clock_in:assignment.starts_at,clock_out:null,break_minutes:30},{staff_id:'s',clock_in:'2026-10-01T13:00:00Z',clock_out:null},{staff_id:'s',clock_in:'2026-09-28T06:00:00Z',clock_out:null},{staff_id:'s',clock_in:'2026-10-01T07:00:00Z',clock_out:'2026-10-01T08:00:00Z',review_status:'rejected'}];
 const result=workforceHours('s',day,[assignment],entries,now);
 assert.equal(result.plannedH,8);assert.equal(result.actualH,5.5);assert.equal(result.live,true);
});
test('overnight punches split across calendar days without double counting overlapping records',()=>{
 const p={staff_id:'s',clock_in:'2026-09-30T20:00:00Z',clock_out:'2026-09-30T23:00:00Z',break_minutes:0};
 assert.equal(workforceHours('s','2026-09-30',[],[p],now).actualH,1);
 assert.equal(workforceHours('s',day,[],[p,p],now).actualH,2);
});
test('a later closed session supersedes an old unclosed live record',()=>{
 const entries=[{staff_id:'s',clock_in:assignment.starts_at,clock_out:null},{staff_id:'s',clock_in:'2026-10-01T08:00:00Z',clock_out:'2026-10-01T10:00:00Z'}];
 assert.equal(workforceHours('s',day,[assignment],entries,now).actualH,2);
 assert.equal(matchingShiftPunch(entries,'s',Date.parse(assignment.starts_at),Date.parse(assignment.ends_at),now),entries[1]);
});
test('home preferences recover incomplete/duplicate sections and keep reorder bounded',()=>{
 const layout=normalizeHomeLayout({order:['bookings','bookings','old'],hidden:['orders','orders','old']});
 assert.deepEqual(layout.order,['bookings','summary','orders','glance','shortcuts']);assert.deepEqual(layout.hidden,['orders']);assert.equal(moveHomeSection(layout,'bookings',-1),layout);
});
test('canvas settings normalize invalid values and enforce finite size bounds',()=>{
 assert.deepEqual(normalizeCanvasSize({width:Infinity,height:'bad'}),{width:1000,height:700});
 assert.deepEqual(normalizeCanvasSize({width:5000,height:50}),{width:2400,height:400});
});

test('calendar and clock controls round-trip restaurant time independently of the device',()=>{
 const iso=new Date(workforceLocalTimestamp('2026-10-01','09:15','Asia/Amman')).toISOString();
 assert.equal(iso,'2026-10-01T06:15:00.000Z');assert.equal(workforceLocalInput(iso,'Asia/Amman'),'2026-10-01T09:15');
});

test('current late or active shifts take priority regardless of assignment ordering',()=>{
 assert.equal(preferTeamShift({phase:'late',distance:0},{phase:'upcoming',distance:1}),true);
 assert.equal(preferTeamShift({phase:'completed',distance:1},{phase:'active',distance:10}),false);
 assert.throws(()=>workforceLocalTimestamp('2026-03-08','02:30','America/New_York'),/does not exist/);
});

test('correction values reject invalid times and rejected punches never become live',()=>{
 assert.equal(workforceInputTimestamp('2026-10-01T09:15','Asia/Amman'),Date.parse('2026-10-01T06:15:00Z'));
 assert.ok(Number.isNaN(workforceInputTimestamp('','Asia/Amman')));
 assert.equal(workforceHours('s',day,[],[{staff_id:'s',clock_in:assignment.starts_at,clock_out:null,review_status:'rejected'}],now).live,false);
});
test('a four-day session closed today cannot inflate today worked hours',()=>{
 const stale={staff_id:'s',clock_in:'2026-09-27T06:00:00Z',clock_out:'2026-10-01T08:00:00Z'};
 assert.equal(workforceHours('s',day,[assignment],[stale],now).actualH,0);
 const valid={staff_id:'s',clock_in:'2026-10-01T09:00:00Z',clock_out:'2026-10-01T10:00:00Z'};
 assert.equal(workforceHours('s',day,[assignment],[stale,valid],now).actualH,1);
});
