/**
 * Centralized role + plan/feature-limit logic.
 * Never duplicate role checks in components — import from here.
 * The database enforces the same rules via RLS; this layer is UX only.
 */

export type AppRole =
  | "super_admin"
  | "restaurant_admin"
  | "manager"
  | "kitchen"
  | "waiter"
  | "cashier";

export type SubscriptionPlan = "free" | "basic" | "professional" | "enterprise";

export const ROLE_LABELS: Record<AppRole, { en: string; ar: string }> = {
  super_admin: { en: "Platform Owner", ar: "مالك المنصة" },
  restaurant_admin: { en: "Restaurant Admin", ar: "مدير المطعم" },
  manager: { en: "Manager", ar: "مشرف" },
  kitchen: { en: "Kitchen", ar: "المطبخ" },
  waiter: { en: "Waiter", ar: "نادل" },
  cashier: { en: "Cashier", ar: "الكاشير" },
};

/** Workspaces a role can open, in priority order. */
export const ROLE_HOME: Record<AppRole, string> = {
  super_admin: "/super-admin",
  restaurant_admin: "/manage",
  manager: "/manage",
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
  | "update_order_status"
  | "manage_payments"
  | "handle_waiter_calls";

const ROLE_CAPABILITIES: Record<AppRole, Capability[]> = {
  super_admin: [
    "manage_platform",
    "manage_restaurant",
    "manage_menu",
    "manage_tables",
    "manage_staff",
    "manage_appearance",
    "view_analytics",
    "view_orders",
    "update_order_status",
    "manage_payments",
    "handle_waiter_calls",
  ],
  restaurant_admin: [
    "manage_restaurant",
    "manage_menu",
    "manage_tables",
    "manage_staff",
    "manage_appearance",
    "view_analytics",
    "view_orders",
    "update_order_status",
    "manage_payments",
    "handle_waiter_calls",
  ],
  manager: [
    "manage_menu",
    "manage_tables",
    "manage_staff",
    "manage_appearance",
    "view_analytics",
    "view_orders",
    "update_order_status",
    "manage_payments",
    "handle_waiter_calls",
  ],
  kitchen: ["view_orders", "update_order_status"],
  waiter: ["view_orders", "update_order_status", "handle_waiter_calls"],
  cashier: ["view_orders", "manage_payments"],
};

export function roleHasCapability(role: AppRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function anyRoleHasCapability(roles: AppRole[], capability: Capability): boolean {
  return roles.some((role) => roleHasCapability(role, capability));
}

export type PlanLimits = {
  maxTables: number | null;
  maxProducts: number | null;
  maxStaff: number | null;
  maxMonthlyOrders: number | null;
  analytics: boolean;
  customBranding: boolean;
  aiFeatures: boolean;
  advancedFeatures: boolean;
};

/**
 * Fallback limits used before plan rows load. The database table
 * `subscription_plans` is the source of truth and can be edited by the
 * platform owner without touching code.
 */
export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    maxTables: 5,
    maxProducts: 25,
    maxStaff: 2,
    maxMonthlyOrders: 300,
    analytics: false,
    customBranding: false,
    aiFeatures: false,
    advancedFeatures: false,
  },
  basic: {
    maxTables: 15,
    maxProducts: 100,
    maxStaff: 5,
    maxMonthlyOrders: 2000,
    analytics: true,
    customBranding: false,
    aiFeatures: false,
    advancedFeatures: false,
  },
  professional: {
    maxTables: 50,
    maxProducts: 500,
    maxStaff: 20,
    maxMonthlyOrders: 10000,
    analytics: true,
    customBranding: true,
    aiFeatures: true,
    advancedFeatures: false,
  },
  enterprise: {
    maxTables: null,
    maxProducts: null,
    maxStaff: null,
    maxMonthlyOrders: null,
    analytics: true,
    customBranding: true,
    aiFeatures: true,
    advancedFeatures: true,
  },
};

export function isWithinLimit(limit: number | null, current: number): boolean {
  return limit === null || current < limit;
}

/** Roles that can administer a workspace (dashboard, menu, staff, settings). */
export const MANAGEMENT_ROLES: AppRole[] = ["super_admin", "restaurant_admin", "manager"];

/** True when the user only holds frontline roles (kitchen / waiter / cashier). */
export function isFrontlineOnly(roles: AppRole[]): boolean {
  return roles.length > 0 && !roles.some((role) => MANAGEMENT_ROLES.includes(role));
}

/** Where a frontline-only user belongs: their operational display. */
export function frontlineHome(roles: AppRole[]): string {
  // Kitchen display is the shared operational screen for all frontline roles.
  void roles;
  return "/kitchen";
}

export type AccessLevel = "admin" | "member";

export function accessLevelFor(role: AppRole): AccessLevel {
  return MANAGEMENT_ROLES.includes(role) ? "admin" : "member";
}

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, { en: string; ar: string }> = {
  admin: { en: "Admin", ar: "مدير" },
  member: { en: "Member", ar: "عضو" },
};
