/** A stale worker must not acknowledge a later worker's attempt. */
export async function finishLeasedJob(client: any, table: string, job: any, patch: Record<string, unknown>) {
  let update = client.from(table)
    .update({ ...patch, lease_token: null, lease_expires_at: null })
    .eq("id", job.id).eq("lease_token", job.lease_token)
    .gt("lease_expires_at", new Date().toISOString());
  if (table === "booking_messages") update = update.eq("provider_status", "sending");
  const {data,error} = await update.select("id").maybeSingle();
  if (error) throw error;
  if (!data && table === "booking_messages") {
    const current = await client.from(table).select("provider_status,lease_token").eq("id",job.id).maybeSingle();
    if (!current.error && current.data?.lease_token === job.lease_token && current.data.provider_status !== "sending") return;
  }
  if (!data) throw new Error("Notification lease was lost");
}
export function ambiguousDelivery(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || error instanceof TypeError);
}
