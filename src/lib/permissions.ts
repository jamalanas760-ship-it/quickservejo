/**
 * Centralized role + plan/feature-limit logic.
 * The database/RLS remains the security boundary; this module controls UX access.
 */
export type AppRole = "super_admin" | "restaurant_admin" | "manager" | "kitchen" | "waiter" | "cashier";
export type SubscriptionPlan = "free" | "basic" | "professional" | "enterprise";

/** Keep operational roles explicit in the UI instead of collapsing them into generic Staff. */
export const ROLE_LABELS: Record<AppRole, { en: string; ar: string }> = {
  super_admin: { en: "Super Admin", ar: "المشرف العام" },
  restaurant_admin: { en: "Admin", ar: "مدير المطعم" },
  manager: { en: "Manager", ar: "مدير التشغيل" },
  kitchen: { en: "Kitchen", ar: "المطبخ" },
  waiter: { en: "Waiter", ar: "نادل" },
  cashier: { en: "Cashier", ar: "كاشير" },
};

export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/super-admin",
  restaurant_admin: "/dashboard",
  manager: "/manager",
  kitchen: "/kitchen",
  waiter: "/waiter",
  cashier: "/cashier",
};

export type Capability =
  | "manage_platform"
  | "manage_restaurant"
  | "manage_menu"
  | "manage_tables"
  | "manage_staff"
  | "manage_appearance"
  | "view_analytics"
  | "view_orders"
  | "view_order_prices"
  | "update_order_status"
  | "manage_payments"
  | "handle_waiter_calls";
export type PermissionOverrides = Partial<Record<Capability, boolean>>;

export const ROLE_CAPABILITIES: Record<AppRole, Capability[]> = {
  super_admin: ["manage_platform", "manage_restaurant", "manage_menu", "manage_tables", "manage_staff", "manage_appearance", "view_analytics", "view_orders", "view_order_prices", "update_order_status", "manage_payments", "handle_waiter_calls"],
  restaurant_admin: ["manage_restaurant", "manage_menu", "manage_tables", "manage_staff", "manage_appearance", "view_analytics", "view_orders", "view_order_prices", "update_order_status", "manage_payments", "handle_waiter_calls"],
  manager: ["manage_menu", "manage_tables", "view_analytics", "view_orders", "view_order_prices", "update_order_status", "handle_waiter_calls"],
  kitchen: ["view_orders", "update_order_status"],
  waiter: ["view_orders", "view_order_prices", "update_order_status", "manage_tables", "handle_waiter_calls"],
  cashier: ["view_orders", "view_order_prices", "manage_payments"],
};

export const PERMISSION_GROUPS: Array<{ id: string; en: string; ar: string; items: Array<{ capability: Capability; en: string; ar: string }> }> = [
  { id: "orders", en: "Orders", ar: "الطلبات", items: [
    { capability: "view_orders", en: "View orders", ar: "عرض الطلبات" },
    { capability: "update_order_status", en: "Manage order status", ar: "إدارة حالة الطلب" },
    { capability: "view_order_prices", en: "View prices", ar: "عرض الأسعار" },
    { capability: "manage_payments", en: "Payments & refunds", ar: "المدفوعات والاسترداد" },
  ] },
  { id: "menu", en: "Menu", ar: "القائمة", items: [
    { capability: "manage_menu", en: "Edit menu, categories & availability", ar: "تعديل القائمة والفئات والتوفر" },
  ] },
  { id: "tables", en: "Tables & Floor", ar: "الطاولات والمخطط", items: [
    { capability: "manage_tables", en: "Manage tables & floor", ar: "إدارة الطاولات والمخطط" },
    { capability: "handle_waiter_calls", en: "Handle table alerts", ar: "معالجة تنبيهات الطاولات" },
  ] },
  { id: "analytics", en: "Analytics", ar: "التحليلات", items: [
    { capability: "view_analytics", en: "View analytics & reports", ar: "عرض التحليلات والتقارير" },
  ] },
  { id: "people", en: "People & Staff", ar: "الفريق والموظفون", items: [
    { capability: "manage_staff", en: "Manage staff", ar: "إدارة الموظفين" },
  ] },
  { id: "settings", en: "System & Settings", ar: "النظام والإعدادات", items: [
    { capability: "manage_restaurant", en: "Restaurant settings", ar: "إعدادات المطعم" },
    { capability: "manage_appearance", en: "Branding & appearance", ar: "الهوية والمظهر" },
  ] },
];

export function roleHasCapability(role: AppRole, capability: Capability) {
  return ROLE_CAPABILITIES[role].includes(capability);
}
export function anyRoleHasCapability(roles: AppRole[], capability: Capability) {
  return roles.some((role) => roleHasCapability(role, capability));
}

/**
 * Overrides cannot escalate a role beyond its role ceiling.
 * A true value preserves an already-allowed capability; false narrows it.
 */
export function membershipHasCapability(role: AppRole, overrides: PermissionOverrides | undefined | null, capability: Capability) {
  if (role === "super_admin") return true;
  if (!roleHasCapability(role, capability)) return false;
  return overrides?.[capability] !== false;
}

export function normalizedOverrides(value: unknown): PermissionOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const allow = new Set<Capability>([
    "manage_platform", "manage_restaurant", "manage_menu", "manage_tables", "manage_staff", "manage_appearance",
    "view_analytics", "view_orders", "view_order_prices", "update_order_status", "manage_payments", "handle_waiter_calls",
  ]);
  const out: PermissionOverrides = {};
  for (const [key, val] of Object.entries(input)) {
    if (allow.has(key as Capability) && typeof val === "boolean") out[key as Capability] = val;
  }
  return out;
}

export type PlanLimits = { maxTables: number | null; maxProducts: number | null; maxStaff: number | null; maxMonthlyOrders: number | null; analytics: boolean; customBranding: boolean; aiFeatures: boolean; advancedFeatures: boolean };
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: { maxTables: 5, maxProducts: 25, maxStaff: 2, maxMonthlyOrders: 300, analytics: false, customBranding: false, aiFeatures: false, advancedFeatures: false },
  basic: { maxTables: 15, maxProducts: 100, maxStaff: 5, maxMonthlyOrders: 2000, analytics: true, customBranding: false, aiFeatures: false, advancedFeatures: false },
  professional: { maxTables: 50, maxProducts: 500, maxStaff: 20, maxMonthlyOrders: 10000, analytics: true, customBranding: true, aiFeatures: true, advancedFeatures: false },
  enterprise: { maxTables: null, maxProducts: null, maxStaff: null, maxMonthlyOrders: null, analytics: true, customBranding: true, aiFeatures: true, advancedFeatures: true },
};
export function isWithinLimit(limit: number | null, current: number) { return limit === null || current < limit; }
export const MANAGEMENT_ROLES: AppRole[] = ["super_admin", "restaurant_admin"];
export function isFrontlineOnly(roles: AppRole[]) { return roles.length > 0 && !roles.some((role) => MANAGEMENT_ROLES.includes(role)); }
export function frontlineHome(roles: AppRole[]) {
  if (roles.includes("manager")) return "/manager";
  if (roles.includes("waiter")) return "/waiter";
  if (roles.includes("cashier")) return "/cashier";
  return "/kitchen";
}
export type AccessLevel = "admin" | "member";
export function accessLevelFor(role: AppRole): AccessLevel { return MANAGEMENT_ROLES.includes(role) ? "admin" : "member"; }
export const ACCESS_LEVEL_LABELS: Record<AccessLevel, { en: string; ar: string }> = { admin: { en: "Admin", ar: "مدير" }, member: { en: "Staff", ar: "موظف" } };
