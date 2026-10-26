export const PRODUCTION_PROJECT = 'gtcmyaksmyiarokloyje';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateConfig(config, mode) {
  if (!['smoke', 'target'].includes(mode)) throw Error('Mode must be smoke or target');
  if (config.environment !== 'staging') throw Error('Only staging is allowed');
  if (!/^[a-z0-9]{20}$/.test(config.projectRef) || config.projectRef === PRODUCTION_PROJECT) throw Error('Use a separate staging project');
  if (config.supabaseUrl !== `https://${config.projectRef}.supabase.co`) throw Error('Project URL mismatch');
  if (!String(config.publishableKey).startsWith('sb_publishable_')) throw Error('Use a publishable key, never a secret/service role');
  if (!Array.isArray(config.tenants) || config.tenants.length < (mode === 'target' ? 20 : 2)) throw Error('Need 20+ tenants for target, 2+ for smoke');
  const requiredPerTenant = Math.ceil((mode === 'target' ? 1000 : 2) / config.tenants.length);
  const restaurants = new Set(), identities = new Set(), tokens = new Set();
  for (const tenant of config.tenants) {
    if (!uuid.test(tenant.restaurantId) || !uuid.test(tenant.sentinelOrderId) || restaurants.has(tenant.restaurantId)) throw Error('Unique tenant and valid sentinel IDs required');
    restaurants.add(tenant.restaurantId);
    if (!Array.isArray(tenant.users) || tenant.users.length < requiredPerTenant) throw Error('Need distinct accounts for every concurrent virtual user');
    for (const user of tenant.users) {
      if (!uuid.test(user.userId) || identities.has(user.userId) || tokens.has(user.accessToken) || !user.accessToken?.startsWith('eyJ')) throw Error('Unique real user tokens required');
      identities.add(user.userId); tokens.add(user.accessToken);
    }
  }
  return config;
}
