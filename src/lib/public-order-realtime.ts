import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

/** This opaque topic carries refresh hints only, never receipt or customer data. */
export async function publicOrderRealtimeTopic(token: string): Promise<string> {
  const value = token.trim();
  if (!value || value.length > 512) throw new Error("Invalid order tracking token");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`quickserve:order:${value}`),
  );
  return `order-status:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function watchPublicOrder(
  client: Pick<SupabaseClient, "channel" | "removeChannel">,
  token: string,
  refresh: () => void,
  connection: (live: boolean) => void,
): () => void {
  let disposed = false;
  let channel: RealtimeChannel | undefined;
  let pending: ReturnType<typeof setTimeout> | undefined;
  connection(false);
  const invalidate = () => {
    if (disposed || pending) return;
    pending = setTimeout(() => {
      pending = undefined;
      if (!disposed) refresh();
    }, 60);
  };
  void publicOrderRealtimeTopic(token)
    .then((topic) => {
      if (disposed) return;
      channel = client
        .channel(topic, { config: { private: false } })
        .on("broadcast", { event: "order_changed" }, invalidate)
        .subscribe((status) => {
          if (disposed) return;
          const live = status === "SUBSCRIBED";
          connection(live);
          // Covers changes between the initial fetch and subscription/reconnection.
          if (live) invalidate();
        });
    })
    .catch(() => {
      if (!disposed) connection(false);
    });
  return () => {
    disposed = true;
    if (pending) clearTimeout(pending);
    if (channel) void client.removeChannel(channel).catch(() => {});
  };
}
