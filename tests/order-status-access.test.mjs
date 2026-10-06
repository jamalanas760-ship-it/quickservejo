import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const raw = await readFile(new URL('../src/components/manage/OrdersManager.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('OrdersManager.tsx', raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const editor = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'OrderStatusEditor');
const declaration = editor.body.statements.filter(ts.isVariableStatement)
  .flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(file) === 'canUpdate');
const expression = declaration.initializer.getText(file);
const policyRaw = await readFile(new URL('../src/lib/permissions.ts', import.meta.url), 'utf8');
const policyJS = ts.transpileModule(policyRaw, {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {membershipHasCapability} = await import(`data:text/javascript;base64,${Buffer.from(policyJS).toString('base64')}`);
const permitted = (membership, isSuperAdmin=false) => vm.runInNewContext(expression, {membership, access:{isSuperAdmin}, membershipHasCapability});
const roles = ['restaurant_admin','operations_manager','manager','kitchen','waiter','cashier','host','inventory','procurement','hr','accountant'];

test('actual Orders editor honors grants and revocations for every restaurant role', () => {
  for (const role of roles) {
    assert.equal(permitted({role,permission_overrides:{update_order_status:true}}), true, `${role}: explicit grant must unlock the editor`);
    assert.equal(permitted({role,permission_overrides:{update_order_status:false}}), false, `${role}: revocation must hide the editor`);
  }
});
test('actual Orders editor respects job defaults, payment separation and tenant membership', () => {
  for (const role of roles) {
    assert.equal(permitted({role,permission_overrides:{}}), ['restaurant_admin','operations_manager','manager','kitchen','waiter'].includes(role), `${role}: job default`);
  }
  assert.equal(permitted({role:'hr',permission_overrides:{manage_payments:true}}),false);
  assert.equal(permitted(null),false);
  assert.equal(permitted(null,true),true);
});
