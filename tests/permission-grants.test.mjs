import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/permissions.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { membershipHasCapability: can, ROLE_CAPABILITIES, setCapabilityOverride, canEditRestaurantPermissions } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('role defaults are preserved and explicit grants and revocations work for every role', () => {
  for (const [role, defaults] of Object.entries(ROLE_CAPABILITIES)) {
    if (role === 'super_admin') continue;
    for (const cap of ROLE_CAPABILITIES.restaurant_admin) {
      assert.equal(can(role, {}, cap), defaults.includes(cap), `${role} ${cap} default`);
      assert.equal(can(role, { [cap]: true }, cap), true, `${role} ${cap} grant`);
      assert.equal(can(role, { [cap]: false }, cap), false, `${role} ${cap} revoke`);
    }
    assert.equal(can(role, {manage_platform: true}, 'manage_platform'), false);
  }
});
test('permission editing remains reserved for Restaurant Managers and Super Admin', () => {
  for (const role of Object.keys(ROLE_CAPABILITIES)) assert.equal(canEditRestaurantPermissions(role), ['super_admin','restaurant_admin'].includes(role));
  assert.equal(canEditRestaurantPermissions(null), false);
});
test('dependent workspaces activate with features and revoking workspace access disables dependents', () => {
  const granted = setCapabilityOverride('waiter', {}, 'manage_finance', true);
  assert.deepEqual(granted, {manage_finance:true,view_erp:true});
  assert.equal(can('waiter', granted, 'manage_finance'), true);
  assert.deepEqual(setCapabilityOverride('waiter', granted, 'view_erp', false), {manage_finance:false,view_erp:false});
  const payment = setCapabilityOverride('kitchen', {view_orders:false}, 'manage_payments', true);
  assert.equal(payment.view_orders,true);
  assert.equal(setCapabilityOverride('kitchen', payment, 'view_orders', false).manage_payments,false);
  assert.deepEqual(setCapabilityOverride('waiter', {}, 'manage_platform', true), {});
});
test('the staff endpoint saves extra grants but protects granting authority before Auth updates', async () => {
  const edge=await readFile(new URL('../supabase/functions/staff-admin/index.ts',import.meta.url),'utf8');
  const start=edge.indexOf('const ROLE_CAPS:'), end=edge.indexOf('\ntype AdminRequest');
  const body=ts.transpileModule(edge.slice(start,end),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
  const {sanitize}=await import(`data:text/javascript;base64,${Buffer.from(body+'\nexport const sanitize=sanitizeOverrides;').toString('base64')}`);
  assert.deepEqual(sanitize('waiter',{manage_finance:true,manage_platform:true,view_orders:false,manage_menu:'yes'}),{manage_finance:true,view_orders:false});
  assert.ok(edge.indexOf('Only the Restaurant Manager can change roles and permissions') < edge.lastIndexOf('admin.auth.admin.updateUserById'));
});
