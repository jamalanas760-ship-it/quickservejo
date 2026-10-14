import { z } from "zod";
import { AccessError } from "./auth.mjs";
const id = z.string().uuid();
const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const status = z.enum(["new", "accepted", "preparing", "ready", "served", "paid", "cancelled"]);
export const tools = [
  {
    name: "list_restaurants",
    title: "List restaurants",
    description: "List restaurants permitted by your current QuickServe account.",
    schema: z.object({ include_archived: z.boolean().default(false) }),
    write: false,
    execute: async (tx, a) => ({
      restaurants: await tx`select id,name,slug,is_active,archived_at,currency,phone,email
      from public.restaurants where app.has_restaurant_access(id) and (${a.include_archived} or archived_at is null) order by name limit 500`,
    }),
  },
  {
    name: "list_menu_items",
    title: "List menu items",
    description: "List menu items for a restaurant you can access.",
    schema: z.object({ restaurant_id: id, only_unavailable: z.boolean().default(false) }),
    write: false,
    execute: async (tx, a) => ({
      items: await tx`select id,name_en,name_ar,price,is_available,is_featured,sold_out_until,
      sold_out_note,category_id,preparation_time from public.menu_items where restaurant_id=${a.restaurant_id}::uuid and app.has_restaurant_access(restaurant_id)
      and (${!a.only_unavailable} or is_available=false) order by display_order limit 2000`,
    }),
  },
  {
    name: "list_orders",
    title: "List orders",
    description: "List recent orders for a permitted restaurant.",
    schema: z.object({
      restaurant_id: id,
      status: status.optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    write: false,
    execute: async (tx, a) => ({
      orders:
        await tx`select o.id,o.order_number,o.status,o.payment_status,case when app.has_capability(o.restaurant_id,'view_order_prices') then o.total else null end total,o.currency,
      o.table_id,o.created_at,o.updated_at,o.cancellation_reason,
      coalesce((select jsonb_agg(jsonb_build_object('quantity',i.quantity,'unit_price',case when app.has_capability(o.restaurant_id,'view_order_prices') then i.unit_price else null end,'notes',i.notes,'menu_item_id',i.menu_item_id))
        from public.order_items i where i.order_id=o.id and i.restaurant_id=o.restaurant_id),'[]'::jsonb) order_items
      from public.orders o where o.restaurant_id=${a.restaurant_id}::uuid and app.has_capability(o.restaurant_id,'view_orders') and (${a.status ?? null}::text is null or o.status::text=${a.status ?? null})
      order by o.created_at desc limit ${a.limit}`,
    }),
  },
  {
    name: "get_table_availability",
    title: "Table availability",
    description: "Check free tables using the restaurant local date and time.",
    schema: z.object({
      restaurant_id: id,
      date,
      time,
      party_size: z.number().int().min(1).max(100),
      duration_minutes: z.number().int().min(15).max(480).default(90),
      language: z.enum(["en", "ar"]).default("en"),
    }),
    write: false,
    execute: async (tx, a) =>
      (
        await tx`select public.mcp_table_availability(${a.restaurant_id}::uuid,${a.date}::date,${a.time}::time,${a.party_size},${a.duration_minutes}) result`
      )[0].result,
  },
  {
    name: "get_daily_sales_summary",
    title: "Daily sales",
    description: "Paid sales totals for a restaurant-local date, subject to analytics permission.",
    schema: z.object({ restaurant_id: id, date, language: z.enum(["en", "ar"]).default("en") }),
    write: false,
    execute: async (tx, a) =>
      (
        await tx`select public.mcp_daily_sales_summary(${a.restaurant_id}::uuid,${a.date}::date) result`
      )[0].result,
  },
  {
    name: "get_attendance_status",
    title: "Attendance status",
    description: "Current staff attendance, subject to shift-management permission.",
    schema: z.object({ restaurant_id: id, language: z.enum(["en", "ar"]).default("en") }),
    write: false,
    execute: async (tx, a) =>
      (await tx`select public.mcp_attendance_status(${a.restaurant_id}::uuid) result`)[0].result,
  },
  {
    name: "create_reservation",
    title: "Create reservation",
    description:
      "Create a reservation after explicit user approval. Requires booking permission and write scope.",
    schema: z.object({
      restaurant_id: id,
      date,
      time,
      party_size: z.number().int().min(1).max(100),
      guest_name: z.string().trim().min(1).max(120),
      phone: z.string().max(40).optional(),
      email: z.email().optional(),
      table_id: id.optional(),
      duration_minutes: z.number().int().min(15).max(480).default(90),
      notes: z.string().max(1000).optional(),
      language: z.enum(["en", "ar"]).default("en"),
    }),
    write: true,
    execute: async (tx, a) =>
      (
        await tx`select public.mcp_create_reservation(${a.restaurant_id}::uuid,${a.date}::date,${a.time}::time,${a.party_size},${a.guest_name},${a.phone ?? null},${a.email ?? null},${a.table_id ?? null}::uuid,${a.duration_minutes},${a.notes ?? null}) result`
      )[0].result,
  },
  {
    name: "set_item_availability",
    title: "Set menu item availability",
    description:
      "Update one permitted menu item. Requires write scope and existing menu permissions.",
    schema: z.object({
      item_id: id,
      is_available: z.boolean(),
      sold_out_until: z.iso.datetime({ offset: true }).optional(),
      sold_out_note: z.string().max(200).optional(),
    }),
    write: true,
    execute: async (tx, a) => {
      const rows =
        await tx`update public.menu_items set is_available=${a.is_available},sold_out_until=${a.is_available ? null : (a.sold_out_until ?? null)}::timestamptz,sold_out_note=${a.is_available ? null : (a.sold_out_note ?? null)} where id=${a.item_id}::uuid and app.has_capability(restaurant_id,'manage_menu') returning id,name_en,is_available,sold_out_until,sold_out_note`;
      if (!rows.length) throw new AccessError(403, "access_denied");
      return { item: rows[0] };
    },
  },
  {
    name: "update_order_status",
    title: "Update order status",
    description:
      "Update a permitted order after explicit user approval. Cancelling requires a reason. Requires write scope.",
    schema: z
      .object({
        order_id: id,
        status,
        cancellation_reason: z.string().trim().min(1).max(60).optional(),
        cancellation_note: z.string().max(300).optional(),
      })
      .superRefine((a, ctx) => {
        if (a.status === "cancelled" && !a.cancellation_reason)
          ctx.addIssue({
            code: "custom",
            message: "A cancellation reason is required",
            path: ["cancellation_reason"],
          });
      }),
    write: true,
    execute: async (tx, a) => {
      const rows =
        await tx`update public.orders set status=${a.status},cancellation_reason=case when ${a.status}='cancelled' then ${a.cancellation_reason ?? null} else cancellation_reason end,cancellation_note=case when ${a.status}='cancelled' then coalesce(${a.cancellation_note ?? null},cancellation_note) else cancellation_note end where id=${a.order_id}::uuid and app.has_capability(restaurant_id,'update_order_status') returning id,order_number,status,cancellation_reason,updated_at`;
      if (!rows.length) throw new AccessError(403, "access_denied");
      return { order: rows[0] };
    },
  },
];
export async function executeTool(tool, args, identity, database) {
  const input = tool.schema.parse(args);
  // Re-check expiry immediately before database access (not just at HTTP entry).
  if (identity.expiresAt <= Date.now() / 1000) throw new AccessError(401, "invalid_token");
  return database.run(identity, tool.write, (tx) => tool.execute(tx, input));
}
