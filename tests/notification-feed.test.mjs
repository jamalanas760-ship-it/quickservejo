import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNotifications, notificationHref, notificationDayKey } from '../src/lib/notification-feed.ts';
const base = {id:'one',restaurant_id:'r',staff_id:null,target_role:null,kind:'system',title:'Inventory alert',body:'Low stock',source_type:'inventory_alert',source_id:null,read_at:null,created_at:'2026-10-01T22:30:00Z'};
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
