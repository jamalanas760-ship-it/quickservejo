import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, PRODUCTION_PROJECT } from './load-config.mjs';
const uuid = n => `${String(n).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
function fixture(count = 2, users = 1) {
  return { environment: 'staging', projectRef: 'abcdefghijklmnopqrst', supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co', publishableKey: 'sb_publishable_test',
    tenants: Array.from({ length: count }, (_, i) => ({ restaurantId: uuid(i + 1), sentinelOrderId: uuid(i + 5000),
      users: Array.from({ length: users }, (_, j) => ({ userId: uuid(10000 + i * users + j), accessToken: `eyJ.test-${i}-${j}` })) })) };
}
test('allows only a separate matching staging target', () => {
  assert.ok(validateConfig(fixture(), 'smoke'));
  for (const patch of [{ environment: 'production' }, { projectRef: PRODUCTION_PROJECT }, { supabaseUrl: 'https://example.com' }, { publishableKey: 'sb_secret_forbidden' }]) {
    assert.throws(() => validateConfig({ ...fixture(), ...patch }, 'smoke'));
  }
});
test('target requires 20 tenants and separate identities for every virtual user', () => {
  assert.throws(() => validateConfig(fixture(), 'target'));
  assert.throws(() => validateConfig(fixture(20, 1), 'target'));
  assert.ok(validateConfig(fixture(20, 50), 'target'));
});
test('rejects duplicate tenant, user, and credential fixtures', () => {
  for (const field of ['restaurantId', 'userId', 'accessToken']) {
    const value = fixture();
    if (field === 'restaurantId') value.tenants[1][field] = value.tenants[0][field];
    else value.tenants[1].users[0][field] = value.tenants[0].users[0][field];
    assert.throws(() => validateConfig(value, 'smoke'));
  }
});
