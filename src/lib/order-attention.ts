import { supabase } from "@/integrations/supabase/client";

export async function markOrderViewed(orderId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("mark_order_viewed", { _order_id: orderId });
  if (error) throw error;
}
