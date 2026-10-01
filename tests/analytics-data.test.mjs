import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalytics, analyticsCsv, calendarKey, orderChannel } from '../src/components/analytics/analytics-data.ts';
const now = new Date('2026-10-01T13:00:00Z');
const order = (id, created_at, total, options = {}) => ({ id, order_number: id, status: 'served', payment_status: 'paid', total, table_id: 't1', created_at, ...options });
test('analytics uses restaurant calendar boundaries and excludes cancelled sales and items', () => {
 const orders = [order('today','2026-09-30T22:00:00Z',10),order('previous','2026-09-23T22:00:00Z',20),order('cancelled','2026-10-01T10:00:00Z',100,{status:'cancelled'}),order('pending','2026-10-01T11:00:00Z',30,{payment_status:'unpaid',fulfillment_type:'delivery'}),order('refund','2026-10-01T12:00:00Z',5,{payment_status:'refunded'})];
 const items = orders.map(row=>({order_id:row.id,menu_item_id:'m1',product_name_snapshot_en:'Rice',product_name_snapshot_ar:'رز',quantity:2,total_price:Number(row.total)}));
 const data=buildAnalytics(orders,items,[{id:'m1',image_url:'/rice.jpg'}],7,'Asia/Amman','en',now);
 assert.equal(data.revenue,45);assert.equal(data.previousRevenue,20);assert.equal(data.collected,10);assert.equal(data.pending,30);assert.equal(data.refunded,5);
 assert.equal(data.topProducts[0].qty,6);assert.equal(data.topProducts[0].revenue,45);assert.equal(data.itemCounts.has('cancelled'),false);
 assert.equal(data.series.length,7);assert.equal(data.series.at(-1).sales,45);assert.equal(data.series.at(-1).previous,20);
 assert.equal(data.peak[1].orders,1);assert.equal(data.weekly.find(row=>row.day===4).orders,3);
 assert.equal(data.channels.find(row=>row.name==='Delivery').value,1);
 assert.equal(calendarKey(new Date('2026-09-30T22:00:00Z'),'Asia/Amman'),'2026-10-01');
});
test('empty analytics remains finite and zero with no fabricated activity',()=>{
 const data=buildAnalytics([],[],[],7,'Asia/Amman','en',now);
 assert.equal(data.revenue,0);assert.equal(data.aov,0);assert.equal(data.collectionRate,0);assert.deepEqual(data.channels,[]);
 assert.ok(data.series.every(row=>row.sales===0&&row.orders===0));
});
test('order channels use fulfillment data and legacy table association',()=>{
 assert.equal(orderChannel(order('1',now.toISOString(),10,{fulfillment_type:'pickup'})),'pickup');
 assert.equal(orderChannel(order('1',now.toISOString(),10,{table_id:null})),'pickup');
 assert.equal(orderChannel(order('1',now.toISOString(),10)),'dine_in');
});
test('CSV safely escapes quotes, multiline values and spreadsheet formula injection',()=>{
 const csv=analyticsCsv([['=HYPERLINK("x")','a,b','a\nb','"hello"']]);
 assert.ok(csv.startsWith('\uFEFF"\'=HYPERLINK'));assert.ok(csv.includes('"a,b"'));assert.ok(csv.includes('""hello""'));
});
