import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/avatar-presets.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { AVATAR_PRESETS, avatarPresetUrl, resolveAvatarPresetId, roleAvatarUrl } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('every app role receives an approved portrait and unknown roles stay unset', () => {
  for (const role of ['super_admin','restaurant_admin','operations_manager','manager','kitchen','waiter','cashier','host','inventory','procurement','accountant','hr','chef','owner']) {
    assert.match(roleAvatarUrl(role), /^\/avatars\/flat-approved\/.+\.png$/);
  }
  assert.equal(roleAvatarUrl('unknown'), null);
  assert.equal(roleAvatarUrl(null), null);
});

test('all previously saved avatar ids resolve to a selectable approved portrait', () => {
  const previous = ['owner-male','hr-male','manager-male','chef-male','kitchen-male','server-male','cashier-male','inventory-male','server-male-2','finance-male','operations-male','host-male','manager-male-2','shift-manager-male','kitchen-male-2','procurement-male','owner-female','server-female','chef-female','manager-female','finance-female','kitchen-female','cashier-female','host-female','hr-female','procurement-female','manager-female-2','server-female-2','inventory-female','operations-female','shift-manager-female','owner-female-2','role-manager','role-chef','role-waiter','role-cashier','role-purchasing','role-inventory','role-kitchen','role-staff','waiter-male','waiter-female'];
  for (const id of previous) {
    assert.ok(AVATAR_PRESETS.some(p => p.id === resolveAvatarPresetId(id)), id);
    assert.match(avatarPresetUrl(id), /^\/avatars\/flat-approved\/.+\.png$/);
  }
  assert.equal(avatarPresetUrl('unknown'), null);
});

test('the catalogue uses exactly nine independently loadable approved PNGs', async () => {
  const urls = new Set(AVATAR_PRESETS.map(p => p.url));
  assert.equal(urls.size, 9);
  for (const url of urls) {
    const bytes = await readFile(new URL(`../public${url}`, import.meta.url));
    assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 392);
    assert.equal(bytes.readUInt32BE(20), 392);
  }
});
