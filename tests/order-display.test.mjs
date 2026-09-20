import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsed, statusLabel } from '../src/lib/order-display.ts';

test('order age advances with supplied clock and never becomes negative', () => {
  const placed = '2026-09-20T12:00:00Z';
  const time = Date.parse(placed);
  assert.equal(elapsed(placed, false, time + 120_000), '2 min');
  assert.equal(elapsed(placed, false, time + 180_000), '3 min');
  assert.equal(elapsed(placed, false, time - 60_000), '0 min');
});

test('invalid dates do not produce NaN on an order ticket', () => {
  assert.equal(elapsed('invalid', false, Date.now()), '—');
});

test('Arabic statuses distinguish accepted, preparing and terminal orders', () => {
  assert.equal(statusLabel('accepted', true), 'مقبول');
  assert.equal(statusLabel('preparing', true), 'قيد التحضير');
  assert.equal(statusLabel('paid', true), 'مدفوع');
  assert.equal(statusLabel('cancelled', true), 'ملغي');
  assert.equal(statusLabel('ready', false), 'ready');
  assert.equal(statusLabel('future-status', true), 'future-status');
});

test('Arabic elapsed time uses the selected locale', () => {
  const placed = '2026-09-20T12:00:00Z';
  assert.equal(elapsed(placed, true, Date.parse(placed) + 120_000), `${(2).toLocaleString('ar-JO')} دقيقة`);
});
