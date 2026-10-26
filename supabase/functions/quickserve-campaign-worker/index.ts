import { finishLeasedJob, ambiguousDelivery } from "../_shared/notification-lease.ts";
import { mapConcurrent } from "../_shared/integration-transport.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

function serviceKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try { return JSON.parse(secretKeys).default; } catch {}
  }
  throw new Error("Supabase server secret is not configured");
}

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function personalize(template: string, name: string | null) {
  return template.replaceAll("{{name}}", name?.trim() || "Guest");
}

function normalizeDestination(value: string): string {
  const raw = value.trim();
  if (raw.startsWith("whatsapp:")) return "whatsapp:" + normalizeDestination(raw.slice(9));
  if (raw.startsWith("+")) return raw;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 9) digits = "962" + digits.slice(1);
  return "+" + digits;
}

async function sendTwilio(channel: "sms" | "whatsapp", to: string, message: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
  const smsFrom = Deno.env.get("TWILIO_FROM_NUMBER")?.trim();
  const waFrom = Deno.env.get("TWILIO_WHATSAPP_FROM")?.trim();
  const from = channel === "whatsapp" ? waFrom : smsFrom;
  if (!sid || !token || !from) throw new Error(channel === "whatsapp"
    ? "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM are required"
    : "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are required");

  const normalizedTo = normalizeDestination(to);
  const destination = channel === "whatsapp" && !normalizedTo.startsWith("whatsapp:") ? `whatsapp:${normalizedTo}` : normalizedTo;
  const source = channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from;
  const body = new URLSearchParams({ To: destination, From: source, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: "Basic " + btoa(`${sid}:${token}`), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.message || `Twilio HTTP ${response.status}`));
  return String(data?.sid || "");
}

async function sendEmail(to: string, subject: string, message: string, deliveryKey: string) {
  const key = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("RESEND_FROM_EMAIL")?.trim();
  if (!key || !from) throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL are required");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": deliveryKey },
    body: JSON.stringify({ from, to: [to], subject: subject || "Message from your restaurant", text: message }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.message || `Resend HTTP ${response.status}`));
  return String(data?.id || "");
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const workerSecret = req.headers.get("x-quickserve-worker") ?? "";
    const { data: authorized, error: authError } = await supabase.rpc("verify_campaign_worker_secret", { _secret: workerSecret });
    if (authError || !authorized) return respond({ error: "Unauthorized" }, 401);

    const now = new Date().toISOString();
    const { data: campaigns, error: campaignError } = await supabase.from("crm_campaigns")
      .select("id,restaurant_id,name,channel,subject,message,status,scheduled_at")
      .in("status", ["scheduled", "processing"]).lte("scheduled_at", now).order("scheduled_at").limit(5);
    if (campaignError) throw campaignError;

    const results: unknown[] = [];
    for (const campaign of campaigns ?? []) {
      const channel = campaign.channel as "sms" | "whatsapp" | "email";
      const providerReady = channel === "email"
        ? Boolean(Deno.env.get("RESEND_API_KEY")?.trim() && Deno.env.get("RESEND_FROM_EMAIL")?.trim())
        : Boolean(Deno.env.get("TWILIO_ACCOUNT_SID")?.trim() && Deno.env.get("TWILIO_AUTH_TOKEN")?.trim()
          && (channel === "whatsapp" ? Deno.env.get("TWILIO_WHATSAPP_FROM")?.trim() : Deno.env.get("TWILIO_FROM_NUMBER")?.trim()));

      if (!providerReady) {
        const detail = channel === "email"
          ? "Email provider is not configured: RESEND_API_KEY and RESEND_FROM_EMAIL are required."
          : channel === "whatsapp"
            ? "WhatsApp provider is not configured: Twilio account, token and WhatsApp sender are required."
            : "SMS provider is not configured: Twilio account, token and sender are required.";
        await supabase.from("crm_campaigns").update({ status: "blocked", last_error: detail }).eq("id", campaign.id);
        results.push({ campaign_id: campaign.id, status: "blocked", detail });
        continue;
      }

      await supabase.from("crm_campaigns").update({ status: "processing", last_error: null }).eq("id", campaign.id);
      const { data: recipients, error: recipientError } = await supabase.rpc("claim_notification_jobs", { _queue: "crm_campaign_recipients", _campaign_id: campaign.id });
      if (recipientError) throw recipientError;

      const guestIds = [...new Set((recipients ?? []).map((row:any) => row.guest_id))];
      const { data: guests, error: guestError } = guestIds.length
        ? await supabase.from("crm_guests").select("id,name,marketing_opt_in").in("id", guestIds)
        : { data: [], error: null };
      if (guestError) throw guestError;
      const guestMap = new Map((guests ?? []).map((guest) => [guest.id, guest]));

      await mapConcurrent(recipients ?? [],4,async (recipient:any) => {
        const guest = guestMap.get(recipient.guest_id);
        if (!guest?.marketing_opt_in) {
          await finishLeasedJob(supabase,"crm_campaign_recipients",recipient,{ status: "skipped", last_error: "Marketing consent was withdrawn before delivery" });
          return;
        }
        try {
          const message = personalize(campaign.message, guest.name);
          const reference = channel === "email"
            ? await sendEmail(recipient.destination, campaign.subject || campaign.name, message, recipient.id)
            : await sendTwilio(channel, recipient.destination, message);
          await finishLeasedJob(supabase,"crm_campaign_recipients",recipient,{ status: "sent", provider_reference: reference || null, sent_at: new Date().toISOString(), last_error: null });
        } catch (error) {
          await finishLeasedJob(supabase,"crm_campaign_recipients",recipient,{ status: "failed", attempt_count: ambiguousDelivery(error) ? 3 : Number(recipient.attempt_count), next_attempt_at: new Date(Date.now()+60_000).toISOString(), last_error: ambiguousDelivery(error) ? "Delivery outcome unknown; reconcile before retry" : "Provider delivery failed" });
        }
      });

      const { data: counts, error: statsError } = await supabase.rpc("campaign_delivery_counts", { _campaign_id: campaign.id });
      if (statsError) throw statsError;
      const {sent,failed,skipped,remaining}=counts;
      await supabase.from("crm_campaigns").update({
        status: remaining === 0 ? "completed" : "processing",
        sent_count: sent, failed_count: failed, skipped_count: skipped,
        last_error: failed > 0 ? `${failed} recipients exhausted delivery retries` : null,
      }).eq("id", campaign.id);
      results.push({ campaign_id: campaign.id, sent, failed, skipped, remaining });
    }

    return respond({ ok: true, processed_campaigns: results.length, results });
  } catch (error) {
    console.error(error);
    return respond({ error: error instanceof Error ? error.message : "Campaign worker failed" }, 500);
  }
});