// Public settings only: never put service-role credentials in VITE_ variables.
const production = {
  url: "https://gtcmyaksmyiarokloyje.supabase.co",
  publishableKey: "sb_publishable_AtuydWdxJPveD43PJ97Fjw_3m8kwLun",
};
const environment = import.meta.env.VITE_QUICKSERVE_ENVIRONMENT || "production";
const configuredUrl = import.meta.env.VITE_QUICKSERVE_SUPABASE_URL?.trim();
const configuredKey = import.meta.env.VITE_QUICKSERVE_SUPABASE_PUBLISHABLE_KEY?.trim();
if (environment !== "production" && environment !== "staging" && environment !== "development") {
  throw new Error("Invalid QuickServe environment");
}
if (environment !== "production" && (!configuredUrl || !configuredKey || configuredUrl === production.url)) {
  throw new Error("Non-production QuickServe requires a separate explicit Supabase project");
}
if (Boolean(configuredUrl) !== Boolean(configuredKey)) throw new Error("Configure both public Supabase settings");
if (configuredUrl && !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(configuredUrl)) throw new Error("Invalid Supabase project URL");
if (configuredKey && !configuredKey.startsWith("sb_publishable_")) throw new Error("Only public publishable keys are allowed");
export const quickServeSupabase = Object.freeze({
  url: configuredUrl || production.url,
  publishableKey: configuredKey || production.publishableKey,
});
