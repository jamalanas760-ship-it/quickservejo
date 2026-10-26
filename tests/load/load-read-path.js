/* global __ENV, open */
// k6 HTTP read-path starter. NOT a full application/realtime/write benchmark.
import http from 'k6/http';
import { sleep } from 'k6';
import exec from 'k6/execution';
import encoding from 'k6/encoding';
import { Rate, Trend } from 'k6/metrics';
import { validateConfig } from './load-config.mjs';

const mode = __ENV.MODE || 'smoke';
if (__ENV.CONFIRM_STAGING !== 'yes') throw Error('Set CONFIRM_STAGING=yes after reviewing staging isolation');
const config = validateConfig(JSON.parse(open(__ENV.FIXTURES || './fixtures.private.json')), mode);
const errors = new Rate('unexpected_errors');
const readDuration = new Trend('tenant_read_ms', true);
const thresholds = { unexpected_errors: ['rate<0.005'] };
for (let i = 0; i < config.tenants.length; i++) {
  thresholds[`tenant_read_ms{tenant:t${i}}`] = ['p(95)<500', 'p(99)<1500'];
}
export const options = {
  scenarios: {
    restaurant_reads: mode === 'smoke'
      ? { executor: 'constant-vus', vus: 2, duration: '1m' }
      : { executor: 'ramping-vus', startVUs: 0, stages: [
          { duration: '2m', target: 100 }, { duration: '5m', target: 250 },
          { duration: '5m', target: 500 }, { duration: '5m', target: 1000 },
          { duration: '60m', target: 1000 }, { duration: '2m', target: 0 },
        ], gracefulRampDown: '30s' },
  },
  thresholds, setupTimeout: '15m', discardResponseBodies: false,
};
function params(user, label) {
  return { headers: { apikey: config.publishableKey, Authorization: `Bearer ${user.accessToken}` },
    redirects: 0, timeout: '10s', tags: { name: label } };
}
function readOrder(user, id) {
  return http.get(`${config.supabaseUrl}/rest/v1/orders?select=id,restaurant_id&id=eq.${id}`, params(user, 'sentinel_order'));
}
function rows(response) { try { const value = response.json(); return Array.isArray(value) ? value : null; } catch { return null; } }
function ownSentinel(user, tenant) {
  const response = readOrder(user, tenant.sentinelOrderId);
  const result = rows(response);
  return response.status === 200 && result?.length === 1 && result[0].restaurant_id === tenant.restaurantId;
}
function isolated(user, foreign) {
  const response = readOrder(user, foreign.sentinelOrderId);
  const result = rows(response);
  // Fail on transport/auth errors as well: a 401 cannot prove tenant isolation.
  return response.status === 403 || (response.status === 200 && result?.length === 0);
}
export function setup() {
  const horizonSeconds = 120;
  config.tenants.forEach((tenant, index) => {
    for (const user of tenant.users) {
      const claims = JSON.parse(encoding.b64decode(user.accessToken.split('.')[1], 'rawurl', 's'));
      if (claims.role !== 'authenticated' || claims.sub !== user.userId || claims.exp < Date.now() / 1000 + horizonSeconds || (mode === 'target' && !user.refreshToken)) {
        throw Error('Use a valid authenticated staging token and a refresh token for long tests; never admin tokens');
      }
      const verified = http.get(`${config.supabaseUrl}/auth/v1/user`, params(user, 'fixture_identity'));
      let identity; try { identity = verified.json(); } catch { identity = null; }
      if (verified.status !== 200 || identity?.id !== user.userId) throw Error('Fixture authentication failed');
      if (!ownSentinel(user, tenant) || !isolated(user, config.tenants[(index + 1) % config.tenants.length])) {
        throw Error('Positive/negative fixture control failed; do not run load');
      }
    }
  });
}
export default function () {
  const vu = exec.vu.idInTest - 1;
  const index = vu % config.tenants.length;
  const tenant = config.tenants[index];
  const user = tenant.users[Math.floor(vu / config.tenants.length)];
  const claims = JSON.parse(encoding.b64decode(user.accessToken.split('.')[1], 'rawurl', 's'));
  if (claims.exp < Date.now() / 1000 + 60 + (vu % 120)) {
    const renewed = http.post(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, JSON.stringify({refresh_token:user.refreshToken}), {
      headers: {apikey:config.publishableKey,'Content-Type':'application/json'},redirects:0,timeout:'10s',tags:{name:'session_refresh'},
    });
    let session;try{session=renewed.json();}catch{session=null;}
    if (renewed.status !== 200 || !session?.access_token || !session?.refresh_token) exec.test.abort('Staging session refresh failed');
    user.accessToken=session.access_token;user.refreshToken=session.refresh_token;
  }
  const response = http.get(`${config.supabaseUrl}/rest/v1/orders?select=id,restaurant_id,status,created_at&restaurant_id=eq.${tenant.restaurantId}&order=created_at.desc&limit=50`, params(user, 'restaurant_orders'));
  readDuration.add(response.timings.duration, { tenant: `t${index}` });
  const result = rows(response);
  const ok = response.status === 200 && result !== null && result.every(row => row.restaurant_id === tenant.restaurantId);
  errors.add(!ok);
  if (result?.some(row => row.restaurant_id !== tenant.restaurantId)) exec.test.abort('Tenant data boundary failed');
  if (exec.vu.iterationInScenario % 20 === 0) {
    const isolationOk = isolated(user, config.tenants[(index + 1) % config.tenants.length]);
    errors.add(!isolationOk);
    if (!isolationOk) exec.test.abort('Isolation assertion failed or could not be verified');
    errors.add(!ownSentinel(user, tenant));
  }
  sleep(8 + Math.random() * 4);
}
