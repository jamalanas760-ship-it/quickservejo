import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNotifications, notificationHref, notificationDayKey, notificationCopy } from '../src/lib/notification-feed.ts';
const base = {id:'one',restaurant_id:'r',staff_id:null,target_role:null,kind:'system',title:'Inventory alert',body:'Low stock',source_type:'inventory_alert',source_id:null,read_at:null,created_at:'2026-10-01T22:30:00Z'};
test('notification presentation retains short ticket titles and details below a clear category', () => {
  assert.deepEqual(notificationCopy({...base,kind:'task',source_type:'work_task',title:'T',body:'Prepare the room'}), {title:'Ticket assigned',body:'T — Prepare the room'});
  assert.equal(notificationCopy({...base,source_type:'missing_punch_request'}).title,'Missing punch');
  assert.equal(notificationCopy({...base,source_type:'staff_time_entry',title:'Clocked out',body:null}).title,'Clock out');
  assert.equal(notificationCopy({...base,source_type:'booking'},true).title,'حجز');
});
test('notification search and category filters combine without losing unread state', () => {
  const readOrder = {...base,id:'two',source_type:'order',title:'New order',read_at:'2026-10-01T00:00:00Z'};
  assert.deepEqual(filterNotifications([base,readOrder],'unread','  STOCK '),[base]);
  assert.deepEqual(filterNotifications([base,readOrder],'orders','stock'),[readOrder]);
  assert.deepEqual(filterNotifications([base,readOrder],'finance',''),[base]);
  assert.equal(filterNotifications([base,readOrder],'unread','order').length,0);
});
test('notification links use the proper restaurant route and day grouping uses local midnight', () => {
  assert.equal(notificationHref(base),'/manage/r/operations');
  assert.equal(notificationHref({...base,source_type:'order'}),'/manage/r/orders');
  assert.equal(notificationHref({...base,source_type:'booking'}),'/bookings');
  assert.equal(notificationHref({...base,source_type:'waitlist'}),'/waitlist');
  assert.equal(notificationHref({...base,source_type:null,kind:'shift'}),'/shifts');
  assert.equal(notificationDayKey(base.created_at,'Asia/Amman'),'2026-10-02');
  assert.equal(notificationDayKey(base.created_at,'UTC'),'2026-10-01');
  assert.equal(notificationDayKey('bad','Asia/Amman'),'');
});

test('record notifications preserve the specific work, booking and waitlist target', () => {
  assert.equal(notificationHref({...base,source_type:'work_task',source_id:'task/1'}),'/work?record=task%2F1');
  assert.equal(notificationHref({...base,source_type:'booking',source_id:'b1'}),'/bookings?record=b1');
  assert.equal(notificationHref({...base,source_type:'order',source_id:'o1'}),'/manage/r/orders?record=o1');
  assert.equal(notificationHref({...base,source_type:'waitlist',source_id:'w1'}),'/waitlist?record=w1');
});
