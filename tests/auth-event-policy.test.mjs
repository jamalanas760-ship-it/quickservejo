import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRefreshAuthAccess } from '../src/lib/auth-event-policy.ts';
test('foreground confirmation and token refresh preserve the current workspace cache',()=>{
  assert.equal(shouldRefreshAuthAccess('INITIAL_SESSION',undefined,'a'),false);
  assert.equal(shouldRefreshAuthAccess('SIGNED_IN','a','a'),false);
  assert.equal(shouldRefreshAuthAccess('TOKEN_REFRESHED','a','a'),false);
});
test('real login, logout, account switches and profile updates refresh access',()=>{
  assert.equal(shouldRefreshAuthAccess('SIGNED_IN',undefined,'a'),true);
  assert.equal(shouldRefreshAuthAccess('SIGNED_IN',null,'a'),true);
  assert.equal(shouldRefreshAuthAccess('SIGNED_IN','a','b'),true);
  assert.equal(shouldRefreshAuthAccess('SIGNED_OUT','a',null),true);
  assert.equal(shouldRefreshAuthAccess('USER_UPDATED','a','a'),true);
});
