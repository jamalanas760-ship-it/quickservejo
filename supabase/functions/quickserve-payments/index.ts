import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serverKey() {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) { try { return JSON.parse(secretKeys).default; } catch {} }
  throw new Error("Supabase server secret is unavailable");
}
function publicKey() {
  const direct = Deno.env.get("SUPABASE_ANON_KEY");
  if (direct) return direct;
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (keys) { try { return JSON.parse(keys).default; } catch {} }
  throw new Error("Supabase publishable key is unavailable");
}
function exponent(currency: string) {
  const c = currency.toUpperCase();
  if (["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"].includes(c)) return 0;
  if (["BHD","JOD","KWD","OMR","TND"].includes(c)) return 3;
  return 2;
}
function toMinor(amount: number, currency: string) { return Math.round(amount * 10 ** exponent(currency)); }
function stripeStatus(value: string) {
  if (value === "requires_payment_method") return value;
  if (value === "requires_action" || value === "requires_confirmation") return "requires_action";
  if (value === "processing" || value === "requires_capture") return "processing";
  if (value === "succeeded") return "succeeded";
  if (value === "canceled") return "canceled";
  return "failed";
}
function stripeHeaders(opts?: { account?: string | null; idempotency?: string | null }) {
  const secret = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not configured");
  const headers: Record<string,string> = { Authorization: `Bearer ${secret}` };
  if (opts?.account) headers["Stripe-Account"] = opts.account;
  if (opts?.idempotency) headers["Idempotency-Key"] = opts.idempotency;
  return headers;
}
async function stripePost(path: string, params: URLSearchParams, opts?: { account?: string | null; idempotency?: string | null }) {
  const headers = stripeHeaders(opts);
  headers["Content-Type"] = "application/x-www-form-urlencoded";
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { method:"POST", headers, body: params });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error?.message || `Stripe HTTP ${res.status}`));
  return data;
}
async function stripeGet(path: string, opts?: { account?: string | null }) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: stripeHeaders(opts) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(data?.error?.message || `Stripe HTTP ${res.status}`));
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), { auth: { persistSession:false, autoRefreshToken:false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "booking_deposit_create" || action === "booking_deposit_sync") {
      const bookingToken = String(body.bookingToken ?? "").trim();
      if (bookingToken.length < 24) return json({ error: "Invalid booking token" }, 400);

      const { data: booking, error: bookingError } = await admin.from("table_bookings")
        .select("id,restaurant_id,confirmation_code,customer_name,status,deposit_amount,deposit_status,booking_at")
        .eq("public_token", bookingToken).maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking) return json({ error: "Booking not found" }, 404);
      if (["cancelled","completed","no_show"].includes(String(booking.status))) return json({ error: "This booking is no longer payable" }, 409);
      const depositAmount = Number(booking.deposit_amount ?? 0);
      if (!(depositAmount > 0)) return json({ error: "This booking does not require a deposit" }, 409);
      if (booking.deposit_status === "paid") return json({ provider:"stripe", settled:true, status:"succeeded" });

      const [{ data: restaurant, error: restaurantError }, { data: connection, error: connectionError }] = await Promise.all([
        admin.from("restaurants").select("currency,name").eq("id", booking.restaurant_id).single(),
        admin.from("integration_connections").select("id,status,config")
          .eq("restaurant_id", booking.restaurant_id).eq("category","payments").eq("provider","stripe").maybeSingle(),
      ]);
      if (restaurantError) throw restaurantError;
      if (connectionError) throw connectionError;
      if (!connection || connection.status === "disabled") return json({ error: "Online booking deposits are not enabled for this restaurant" }, 503);

      const publishable = Deno.env.get("STRIPE_PUBLISHABLE_KEY")?.trim();
      if (!publishable || !Deno.env.get("STRIPE_SECRET_KEY")?.trim()) return json({ error: "Stripe is not fully configured on the server" }, 503);
      const stripeAccount = connection.config?.stripe_account_id ? String(connection.config.stripe_account_id) : null;

      const { data: existing, error: existingError } = await admin.from("booking_deposit_intents")
        .select("id,provider_intent_id,idempotency_key,status,amount,currency")
        .eq("booking_id", booking.id).maybeSingle();
      if (existingError) throw existingError;

      if (action === "booking_deposit_sync") {
        const intentRecordId = String(body.intentRecordId ?? "");
        if (!existing || existing.id !== intentRecordId || !existing.provider_intent_id) return json({ error: "Booking deposit intent not found" }, 404);
        const stripe = await stripeGet(`payment_intents/${encodeURIComponent(existing.provider_intent_id)}`, { account: stripeAccount });
        const mapped = stripeStatus(String(stripe.status));
        await admin.rpc("update_booking_deposit_intent_status", {
          _intent_id: existing.id, _provider_intent_id: stripe.id, _status: mapped,
          _last_error: stripe.last_payment_error?.message || null,
        });
        if (stripe.status === "succeeded") {
          await admin.rpc("record_booking_deposit_payment", {
            _intent_id: existing.id,
            _provider_intent_id: stripe.id,
            _provider_transaction_id: String(stripe.latest_charge || stripe.id),
            _provider_event_id: "sync:" + stripe.id,
          });
        }
        return json({ provider:"stripe", status:stripe.status, settled:stripe.status === "succeeded" });
      }

      let intentRecord = existing;
      if (!intentRecord) {
        const idempotencyKey = `booking:${booking.id}:deposit`;
        const { data: created, error: createError } = await admin.from("booking_deposit_intents").insert({
          booking_id: booking.id,
          restaurant_id: booking.restaurant_id,
          provider: "stripe",
          provider_account_id: stripeAccount,
          idempotency_key: idempotencyKey,
          amount: depositAmount,
          currency: String(restaurant.currency || "JOD").toUpperCase(),
          status: "creating",
        }).select("id,provider_intent_id,idempotency_key,status,amount,currency").single();
        if (createError) throw createError;
        intentRecord = created;
      }

      if (intentRecord.provider_intent_id) {
        const stripe = await stripeGet(`payment_intents/${encodeURIComponent(intentRecord.provider_intent_id)}`, { account: stripeAccount });
        const mapped = stripeStatus(String(stripe.status));
        await admin.rpc("update_booking_deposit_intent_status", {
          _intent_id: intentRecord.id, _provider_intent_id: stripe.id, _status: mapped,
          _last_error: stripe.last_payment_error?.message || null,
        });
        if (stripe.status === "succeeded") {
          await admin.rpc("record_booking_deposit_payment", {
            _intent_id: intentRecord.id, _provider_intent_id: stripe.id,
            _provider_transaction_id: String(stripe.latest_charge || stripe.id), _provider_event_id: "resume:" + stripe.id,
          });
          return json({ provider:"stripe", settled:true, status:"succeeded" });
        }
        return json({
          provider:"stripe", intentRecordId:intentRecord.id, providerIntentId:stripe.id,
          clientSecret:stripe.client_secret, publishableKey:publishable, stripeAccount, status:stripe.status,
          walletSupport:"automatic_payment_methods",
        });
      }

      const params = new URLSearchParams();
      params.set("amount", String(toMinor(depositAmount, String(restaurant.currency || "JOD"))));
      params.set("currency", String(restaurant.currency || "JOD").toLowerCase());
      params.set("automatic_payment_methods[enabled]", "true");
      params.set("description", `QuickServe reservation deposit ${booking.confirmation_code}`);
      params.set("metadata[quickserve_booking_deposit_intent_id]", String(intentRecord.id));
      params.set("metadata[booking_id]", String(booking.id));
      params.set("metadata[restaurant_id]", String(booking.restaurant_id));
      params.set("metadata[deposit_amount]", String(depositAmount));
      params.set("metadata[payment_purpose]", "booking_deposit");

      try {
        const stripe = await stripePost("payment_intents", params, {
          account: stripeAccount, idempotency: String(intentRecord.idempotency_key),
        });
        await admin.rpc("update_booking_deposit_intent_status", {
          _intent_id:intentRecord.id, _provider_intent_id:stripe.id, _status:stripeStatus(String(stripe.status)), _last_error:null,
        });
        return json({
          provider:"stripe", intentRecordId:intentRecord.id, providerIntentId:stripe.id,
          clientSecret:stripe.client_secret, publishableKey:publishable, stripeAccount, status:stripe.status,
          walletSupport:"automatic_payment_methods",
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Stripe booking deposit intent creation failed";
        await admin.rpc("update_booking_deposit_intent_status", {
          _intent_id:intentRecord.id, _provider_intent_id:"", _status:"failed", _last_error:detail,
        });
        throw error;
      }
    }

    const auth = req.headers.get("authorization") ?? "";
    if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "Authentication required" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, publicKey(), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    if (action === "create_intent") {
      const orderId = String(body.orderId ?? "");
      const amount = Number(body.amount ?? 0);
      const tip = Math.max(0, Number(body.tip ?? 0));
      const methodHint = body.methodHint === "wallet" ? "wallet" : "card";
      const idempotencyKey = String(body.idempotencyKey ?? crypto.randomUUID());

      const { data: prep, error: prepError } = await userClient.rpc("prepare_provider_payment_intent", {
        _order_id: orderId, _provider: "stripe", _amount: amount, _tip: tip,
        _method_hint: methodHint, _idempotency_key: idempotencyKey,
      });
      if (prepError) throw prepError;

      const publishable = Deno.env.get("STRIPE_PUBLISHABLE_KEY")?.trim();
      if (!publishable) {
        await admin.rpc("update_provider_intent_status", { _intent_id: prep.intent_id, _provider_intent_id: "", _status: "failed", _last_error: "STRIPE_PUBLISHABLE_KEY is not configured" });
        return json({ error: "Stripe is not fully configured on the server" }, 503);
      }

      const params = new URLSearchParams();
      params.set("amount", String(toMinor(Number(prep.amount) + Number(prep.tip_amount), prep.currency)));
      params.set("currency", String(prep.currency).toLowerCase());
      params.set("automatic_payment_methods[enabled]", "true");
      params.set("description", `QuickServe ${prep.order_number}`);
      params.set("metadata[quickserve_intent_id]", String(prep.intent_id));
      params.set("metadata[restaurant_id]", String(prep.restaurant_id));
      params.set("metadata[order_id]", String(prep.order_id));
      params.set("metadata[order_amount]", String(prep.amount));
      params.set("metadata[tip_amount]", String(prep.tip_amount));
      params.set("metadata[method_hint]", methodHint);

      try {
        const stripe = await stripePost("payment_intents", params, {
          account: prep.provider_account_id || null, idempotency: String(prep.idempotency_key),
        });
        await admin.rpc("update_provider_intent_status", {
          _intent_id: prep.intent_id, _provider_intent_id: stripe.id,
          _status: stripeStatus(String(stripe.status)), _last_error: null,
        });
        return json({
          provider: "stripe", intentRecordId: prep.intent_id, providerIntentId: stripe.id,
          clientSecret: stripe.client_secret, publishableKey: publishable,
          stripeAccount: prep.provider_account_id || null, status: stripe.status,
          walletSupport: "automatic_payment_methods",
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Stripe intent creation failed";
        await admin.rpc("update_provider_intent_status", {
          _intent_id: prep.intent_id, _provider_intent_id: "", _status: "failed", _last_error: detail,
        });
        throw error;
      }
    }

    if (action === "sync_intent") {
      const intentRecordId = String(body.intentRecordId ?? "");
      const { data: record, error: readError } = await userClient.from("payment_provider_intents")
        .select("id,restaurant_id,provider,provider_account_id,provider_intent_id,status")
        .eq("id", intentRecordId).maybeSingle();
      if (readError) throw readError;
      if (!record || record.provider !== "stripe" || !record.provider_intent_id) return json({ error:"Payment intent not found" },404);

      const stripe = await stripeGet(`payment_intents/${encodeURIComponent(record.provider_intent_id)}`, {
        account: record.provider_account_id || null,
      });
      await admin.rpc("update_provider_intent_status", {
        _intent_id: record.id, _provider_intent_id: stripe.id,
        _status: stripeStatus(String(stripe.status)),
        _last_error: stripe.last_payment_error?.message || null,
      });
      if (stripe.status === "succeeded") {
        const metadata = stripe.metadata ?? {};
        await admin.rpc("record_provider_payment", {
          _intent_id: record.id, _provider_intent_id: stripe.id,
          _provider_transaction_id: String(stripe.latest_charge || stripe.id),
          _provider_event_id: "sync:" + stripe.id,
          _method: metadata.method_hint === "wallet" ? "wallet" : "card",
          _metadata: { source:"cashier_reconciliation", stripe_payment_method:stripe.payment_method || null },
        });
      }
      return json({ provider:"stripe", status:stripe.status, settled:stripe.status === "succeeded" });
    }

    if (action === "refund") {
      const paymentId = String(body.paymentId ?? "");
      const amount = Number(body.amount ?? 0);
      const idempotencyKey = String(body.idempotencyKey ?? crypto.randomUUID());
      const { data: prep, error: prepError } = await userClient.rpc("prepare_provider_refund", { _payment_id: paymentId, _amount: amount });
      if (prepError) throw prepError;
      if (prep.provider !== "stripe") return json({ error: "This provider refund adapter is not available yet" }, 409);

      const { data: connection } = await admin.from("integration_connections")
        .select("config").eq("restaurant_id", prep.restaurant_id).eq("category","payments").eq("provider","stripe").maybeSingle();
      const params = new URLSearchParams();
      params.set("charge", String(prep.provider_transaction_id));
      params.set("amount", String(toMinor(Number(prep.amount), String(prep.currency))));
      params.set("metadata[quickserve_payment_id]", String(prep.payment_id));
      const refund = await stripePost("refunds", params, {
        account: connection?.config?.stripe_account_id || null, idempotency: idempotencyKey,
      });
      if (refund.status === "succeeded") {
        await admin.rpc("record_provider_refund", {
          _payment_id: prep.payment_id, _provider_refund_id: refund.id, _amount: prep.amount,
          _provider_event_id: null, _metadata: { source: "quickserve_refund_api" },
        });
      }
      return json({ provider:"stripe", refundId:refund.id, status:refund.status });
    }

    if (action === "capabilities") {
      return json({
        provider:"stripe",
        configured:Boolean(Deno.env.get("STRIPE_SECRET_KEY")?.trim() && Deno.env.get("STRIPE_PUBLISHABLE_KEY")?.trim()),
        webhookConfigured:Boolean(Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim()),
        paymentElement:true, applePay:true, googlePay:true,
        note:"Wallets appear when Stripe, the account, browser and registered domain are eligible.",
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Payment request failed" }, 500);
  }
});