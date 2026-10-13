import test from 'node:test';
import assert from 'node:assert/strict';
import { restaurantScheduleWindows } from '../src/lib/restaurant-schedule.ts';
const defaults={first:'2026-10-12',last:'2026-10-18',start:'09:00',end:'17:00',weekdays:[0,1,2,3,4,5,6],timeZone:'Asia/Amman'};
test('weekly restaurant schedule is timezone-correct and duplicate weekdays cannot duplicate shifts',()=>{
 const result=restaurantScheduleWindows({...defaults,weekdays:[1,1,3,5]});
 assert.equal(result.length,3);assert.equal(result[0].start,'2026-10-12T06:00:00.000Z');assert.equal(result[2].day,'2026-10-16');
});
test('closing shifts continue into the next local day',()=>{
 const [shift]=restaurantScheduleWindows({...defaults,last:defaults.first,start:'22:00',end:'02:00'});
 assert.equal(shift.end,'2026-10-12T23:00:00.000Z');assert.equal((Date.parse(shift.end)-Date.parse(shift.start))/3600000,4);
});
test('recurrence rejects invalid dates and unbounded schedules before any save',()=>{
 for(const change of [{first:'2026-02-30'},{last:'2027-11-01'},{start:'25:00'},{end:'09:00'},{weekdays:[]},{weekdays:[7]}]) assert.throws(()=>restaurantScheduleWindows({...defaults,...change}));
});
test('spring DST day uses actual elapsed duration and rejects nonexistent local service times',()=>{
 const input={...defaults,first:'2026-03-08',last:'2026-03-08',timeZone:'America/New_York',start:'01:00',end:'04:00'};
 const [shift]=restaurantScheduleWindows(input);assert.equal((Date.parse(shift.end)-Date.parse(shift.start))/3600000,2);
 assert.throws(()=>restaurantScheduleWindows({...input,start:'02:30'}),/does not exist/);
});
