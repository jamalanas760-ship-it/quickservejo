import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "platform.ownership_claimed"
  | "restaurant.created"
  | "restaurant.updated"
  | "restaurant.activated"
  | "restaurant.deactivated"
  | "restaurant.archived"
  | "restaurant.restored"
  | "restaurant.management_entered"
  | "category.created"
  | "category.updated"
  | "category.archived"
  | "category.deleted"
  | "product.created"
  | "product.updated"
  | "product.price_changed"
  | "product.archived"
  | "product.duplicated"
  | "product.deleted"
  | "modifier_group.created"
  | "modifier.created"
  | "table.created"
  | "table.updated"
  | "table.deactivated"
  | "table.qr_regenerated"
  | "staff.created"
  | "staff.role_changed"
  | "staff.deactivated"
  | "staff.reactivated"
  | "staff.access_removed"
  | "staff.password_reset"
  | "staff.deleted"
  | "order.cancelled"
  | "platform.settings_updated"
  | "plan.updated";

/**
 * Append-only audit trail. Failures never block the user action — the audit
 * insert is best effort and logged to the console for diagnostics.
 */
export async function logAudit(
  action: AuditAction,
  opts: {
    restaurantId?: string | null;
    entity?: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase.from("audit_logs").insert({
      restaurant_id: opts.restaurantId ?? null,
      actor_user_id: user.id,
      actor_name:
        (user.user_metadata as { full_name?: string } | null)?.full_name ?? user.email ?? null,
      action,
      entity: opts.entity ?? null,
      entity_id: opts.entityId ?? null,
      metadata: (opts.metadata ?? {}) as never,
    });
  } catch (error) {
    console.warn("[audit] failed to record action", action, error);
  }
}
