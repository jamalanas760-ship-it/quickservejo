/**
 * Centralized role + plan/feature-limit logic.
 * The database/RLS remains the security boundary; this module controls UX access.
 */
export type AppRole =
  | "super_admin"
  | "restaurant_admin"
  | "operations_manager"
  | "manager"
  | "kitchen"
  | "waiter"
  | "cashier"
  | "host"
  | "inventory"
  | "procurement"
  | "accountant";
export type SubscriptionPlan = "free" | "basic" | "professional" | "enterprise";

/** Job profiles are templates. Permission overrides may narrow a role, never expand beyond its ceiling. */
export const ROLE_LABELS: Record<AppRole, { en: string; ar: string }> = {
  super_admin: { en: "Super Admin", ar: "المشرف العام" },
  restaurant_admin: { en: "Restaurant Manager", ar: "مدير المطعم" },
  operations_manager: { en: "Operations Manager", ar: "مدير العمليات" },
  manager: { en: "Shift Manager", ar: "مدير الوردية" },
  kitchen: { en: "Kitchen", ar: "المطبخ" },
  waiter: { en: "Waiter", ar: "نادل" },
  cashier: { en: "Cashier", ar: "كاشير" },
  host: { en: "Host", ar: "الاستقبال" },
  inventory: { en: "Inventory Controller", ar: "مسؤول المخزون" },
  procurement: { en: "Procurement Officer", ar: "مسؤول المشتريات" },
  accountant: { en: "Finance & Accounting", ar: "المالية والمحاسبة" },
};

export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/super-admin",
  restaurant_admin: "/dashboard",
  operations_manager: "/manager",
  manager: "/manager",
  kitchen: "/kitchen",
  waiter: "/waiter",
  cashier: "/cashier",
  host: "/waiter",
  inventory: "/work",
  procurement: "/work",
  accountant: "/work",
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
  | "handle_waiter_calls"
  | "view_work"
  | "create_work"
  | "manage_work"
  | "approve_work"
  | "view_erp"
  | "manage_inventory"
  | "manage_procurement"
  | "manage_finance"
  | "manage_shifts";
export type PermissionOverrides = Partial<Record<Capability, boolean>>;

const WORKER_WORK: Capability[] = ["view_work", "create_work"];
const MANAGER_WORK: Capability[] = [...WORKER_WORK, "manage_work", "approve_work", "manage_shifts"];
const ERP_BASE: Capability[] = ["view_erp"];

export const ROLE_CAPABILITIES: Record<AppRole, Capability[]> = {
  super_admin: [
    "manage_platform", "manage_restaurant", "manage_menu", "manage_tables", "manage_staff", "manage_appearance",
    "view_analytics", "view_orders", "view_order_prices", "update_order_status", "manage_payments", "handle_waiter_calls",
    ...MANAGER_WORK, ...ERP_BASE, "manage_inventory", "manage_procurement", "manage_finance",
  ],
  restaurant_admin: [
    "manage_restaurant", "manage_menu", "manage_tables", "manage_staff", "manage_appearance", "view_analytics",
    "view_orders", "view_order_prices", "update_order_status", "manage_payments", "handle_waiter_calls",
    ...MANAGER_WORK, ...ERP_BASE, "manage_inventory", "manage_procurement", "manage_finance",
  ],
  operations_manager: [
    "manage_menu", "manage_tables", "view_analytics", "view_orders", "view_order_prices", "update_order_status", "handle_waiter_calls",
    ...MANAGER_WORK, ...ERP_BASE, "manage_inventory", "manage_procurement",
  ],
  manager: [
    "manage_menu", "manage_tables", "view_analytics", "view_orders", "view_order_prices", "update_order_status", "handle_waiter_calls",
    ...MANAGER_WORK,
  ],
  kitchen: ["view_orders", "update_order_status", ...WORKER_WORK],
  waiter: ["view_orders", "view_order_prices", "update_order_status", "manage_tables", "handle_waiter_calls", ...WORKER_WORK],
  cashier: ["view_orders", "view_order_prices", "manage_payments", ...WORKER_WORK],
  host: ["view_orders", "manage_tables", "handle_waiter_calls", ...WORKER_WORK],
  inventory: [...WORKER_WORK, ...ERP_BASE, "manage_inventory"],
  procurement: [...WORKER_WORK, ...ERP_BASE, "manage_procurement"],
  accountant: [...WORKER_WORK, ...ERP_BASE, "manage_finance", "view_analytics", "view_order_prices"],
};

export const PERMISSION_GROUPS: Array<{ id: string; en: string; ar: string; items: Array<{ capability: Capability; en: string; ar: string }> }> = [
  { id: "work", en: "My Work & Approvals", ar: "عملي والموافقات", items: [
    { capability: "view_work", en: "View assigned work", ar: "عرض العمل المكلّف" },
    { capability: "create_work", en: "Create operational tasks", ar: "إنشاء مهام تشغيلية" },
    { capability: "manage_work", en: "Manage team work", ar: "إدارة عمل الفريق" },
    { capability: "approve_work", en: "Approve operational requests", ar: "اعتماد الطلبات التشغيلية" },
    { capability: "manage_shifts", en: "Manage shifts & handover", ar: "إدارة الورديات والتسليم" },
  ] },
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
  { id: "erp", en: "ERP & Back Office", ar: "ERP والإدارة الخلفية", items: [
    { capability: "view_erp", en: "Open ERP workspace", ar: "فتح مساحة ERP" },
    { capability: "manage_inventory", en: "Inventory & stock control", ar: "المخزون وحركة المواد" },
    { capability: "manage_procurement", en: "Procurement & suppliers", ar: "المشتريات والموردون" },
    { capability: "manage_finance", en: "Finance & reconciliation", ar: "المالية والتسويات" },
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
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}
export function anyRoleHasCapability(roles: AppRole[], capability: Capability) {
  return roles.some((role) => roleHasCapability(role, capability));
}

/** Overrides cannot escalate a role beyond its role ceiling. */
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
    "view_work", "create_work", "manage_work", "approve_work", "view_erp", "manage_inventory", "manage_procurement", "manage_finance", "manage_shifts",
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
export const MANAGEMENT_ROLES: AppRole[] = ["super_admin", "restaurant_admin", "operations_manager", "manager"];
export function isFrontlineOnly(roles: AppRole[]) { return roles.length > 0 && !roles.some((role) => MANAGEMENT_ROLES.includes(role)); }
export function frontlineHome(roles: AppRole[]) {
  if (roles.includes("operations_manager") || roles.includes("manager")) return "/manager";
  if (roles.includes("waiter") || roles.includes("host")) return "/waiter";
  if (roles.includes("cashier")) return "/cashier";
  if (roles.includes("inventory") || roles.includes("procurement") || roles.includes("accountant")) return "/work";
  return "/kitchen";
}
export type AccessLevel = "admin" | "member";
export function accessLevelFor(role: AppRole): AccessLevel { return MANAGEMENT_ROLES.includes(role) ? "admin" : "member"; }
export const ACCESS_LEVEL_LABELS: Record<AccessLevel, { en: string; ar: string }> = { admin: { en: "Management", ar: "الإدارة" }, member: { en: "Team Member", ar: "عضو الفريق" } };
