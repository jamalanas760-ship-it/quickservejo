/**
 * Centralized role + plan/feature-limit logic.
 * The database/RLS remains the security boundary; this module controls UX access.
 */
export type AppRole = "super_admin" | "restaurant_admin" | "manager" | "kitchen" | "waiter" | "cashier";
export type SubscriptionPlan = "free" | "basic" | "professional" | "enterprise";

export const ROLE_LABELS: Record<AppRole,{en:string;ar:string}> = {
 super_admin:{en:"Owner",ar:"المالك"}, restaurant_admin:{en:"Admin",ar:"المدير"}, manager:{en:"Manager",ar:"مشرف"},
 kitchen:{en:"Kitchen",ar:"المطبخ"}, waiter:{en:"Waiter",ar:"النادل"}, cashier:{en:"Cashier",ar:"الكاشير"},
};
export const ROLE_HOME:Record<AppRole,string>={super_admin:"/super-admin",restaurant_admin:"/manage",manager:"/manage",kitchen:"/kitchen",waiter:"/waiter",cashier:"/cashier"};
export type Capability="manage_platform"|"manage_restaurant"|"manage_menu"|"manage_tables"|"manage_staff"|"manage_appearance"|"view_analytics"|"view_orders"|"view_order_prices"|"update_order_status"|"manage_payments"|"handle_waiter_calls";
const ROLE_CAPABILITIES:Record<AppRole,Capability[]>={
 super_admin:["manage_platform","manage_restaurant","manage_menu","manage_tables","manage_staff","manage_appearance","view_analytics","view_orders","view_order_prices","update_order_status","manage_payments","handle_waiter_calls"],
 restaurant_admin:["manage_restaurant","manage_menu","manage_tables","manage_staff","manage_appearance","view_analytics","view_orders","view_order_prices","update_order_status","manage_payments","handle_waiter_calls"],
 manager:["manage_menu","manage_tables","manage_staff","manage_appearance","view_analytics","view_orders","view_order_prices","update_order_status","manage_payments","handle_waiter_calls"],
 kitchen:["view_orders","update_order_status"],waiter:["view_orders","view_order_prices","update_order_status","handle_waiter_calls"],cashier:["view_orders","view_order_prices","manage_payments"]
};
export function roleHasCapability(role:AppRole,capability:Capability){return ROLE_CAPABILITIES[role].includes(capability)}
export function anyRoleHasCapability(roles:AppRole[],capability:Capability){return roles.some(r=>roleHasCapability(r,capability))}
export type PlanLimits={maxTables:number|null;maxProducts:number|null;maxStaff:number|null;maxMonthlyOrders:number|null;analytics:boolean;customBranding:boolean;aiFeatures:boolean;advancedFeatures:boolean};
export const PLAN_LIMITS:Record<SubscriptionPlan,PlanLimits>={free:{maxTables:5,maxProducts:25,maxStaff:2,maxMonthlyOrders:300,analytics:false,customBranding:false,aiFeatures:false,advancedFeatures:false},basic:{maxTables:15,maxProducts:100,maxStaff:5,maxMonthlyOrders:2000,analytics:true,customBranding:false,aiFeatures:false,advancedFeatures:false},professional:{maxTables:50,maxProducts:500,maxStaff:20,maxMonthlyOrders:10000,analytics:true,customBranding:true,aiFeatures:true,advancedFeatures:false},enterprise:{maxTables:null,maxProducts:null,maxStaff:null,maxMonthlyOrders:null,analytics:true,customBranding:true,aiFeatures:true,advancedFeatures:true}};
export function isWithinLimit(limit:number|null,current:number){return limit===null||current<limit}
export const MANAGEMENT_ROLES:AppRole[]=["super_admin","restaurant_admin","manager"];
export function isFrontlineOnly(roles:AppRole[]){return roles.length>0&&!roles.some(r=>MANAGEMENT_ROLES.includes(r))}
export function frontlineHome(roles:AppRole[]){void roles;return "/kitchen"}
export type AccessLevel="admin"|"member";
export function accessLevelFor(role:AppRole):AccessLevel{return MANAGEMENT_ROLES.includes(role)?"admin":"member"}
export const ACCESS_LEVEL_LABELS:Record<AccessLevel,{en:string;ar:string}>={admin:{en:"Admin",ar:"مدير"},member:{en:"Staff",ar:"موظف"}};
