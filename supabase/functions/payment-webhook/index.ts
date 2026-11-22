import { createClient } from "@supabase/supabase-js";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info, x-paystack-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

declare const Deno:
  | {
      env: {
        get(key: string): string | undefined;
      };
      serve?: (handler: (req: Request) => Promise<Response> | Response) => void;
    }
  | undefined;

export function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined" && Deno?.env) {
    return Deno.env.get(key);
  }
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

export async function computeHmacSha512Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aNorm = a.trim().toLowerCase();
  const bNorm = b.trim().toLowerCase();
  let diff = aNorm.length ^ bNorm.length;
  const len = Math.max(aNorm.length, bNorm.length);
  for (let i = 0; i < len; i++) {
    const charA = i < aNorm.length ? aNorm.charCodeAt(i) : 0;
    const charB = i < bNorm.length ? bNorm.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  return diff === 0;
}

export async function validatePaystackSignature(
  secret: string,
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  if (!secret || typeof signature !== "string" || !signature.trim()) {
    return false;
  }
  try {
    const expected = await computeHmacSha512Hex(secret, rawBody);
    return timingSafeEqualHex(signature, expected);
  } catch {
    return false;
  }
}

export async function handlePaymentWebhook(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Read raw body as text first
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "Unable to read request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Validate HMAC-SHA512 with PAYSTACK_SECRET_KEY (works with test and live keys)
  const paystackSecretKey = getEnv("PAYSTACK_SECRET_KEY");
  if (!paystackSecretKey) {
    console.error("PAYSTACK_SECRET_KEY environment variable is not set");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("x-paystack-signature");
  const isValidSig = await validatePaystackSignature(paystackSecretKey, rawBody, signature);
  if (!isValidSig) {
    return new Response(JSON.stringify({ error: "Invalid or missing signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Parse JSON only after signature passes
  let payload: {
    event?: string;
    data?: {
      status?: string;
      reference?: string;
      amount?: number;
      currency?: string;
      customer?: {
        email?: string;
      };
      metadata?: {
        user_id?: string;
        [key: string]: unknown;
      };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Handle ONLY event "charge.success"; any other event -> 200 with no action.
  if (payload.event !== "charge.success") {
    return new Response(JSON.stringify({ received: true, ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const data = payload.data;
  const reference = data?.reference;
  if (!reference || typeof reference !== "string") {
    console.error("Webhook charge.success event missing valid reference");
    return new Response(JSON.stringify({ received: true, error: "Missing reference" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Setup Supabase admin client
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const rawPaymentAmount = getEnv("PAYMENT_AMOUNT_MINOR");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing Supabase credentials in environment");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const expectedAmountMinor = rawPaymentAmount ? parseInt(rawPaymentAmount, 10) : NaN;
  if (!Number.isInteger(expectedAmountMinor) || expectedAmountMinor <= 0) {
    console.error("Invalid PAYMENT_AMOUNT_MINOR configuration");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Query payments table for this reference
  const { data: payment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select("user_id, reference, amount_minor, currency, status")
    .eq("reference", reference)
    .maybeSingle();

  if (paymentError) {
    console.error("Database error looking up payment:", paymentError.message);
    return new Response(JSON.stringify({ error: "Database error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payment) {
    console.error(`Payment record not found for reference: ${reference}`);
    return new Response(JSON.stringify({ received: true, error: "Payment not found" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Idempotent: already success -> return 200 no-op
  if (payment.status === "success") {
    return new Response(JSON.stringify({ received: true, status: "already_processed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Lookup auth user email
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
    payment.user_id
  );

  let failureReason: string | null = null;

  if (payment.status !== "pending") {
    failureReason = `Payment status is '${payment.status}', expected 'pending'`;
  } else if (data.status !== "success") {
    failureReason = `Paystack data.status is '${data.status}', expected 'success'`;
  } else if (data.amount !== payment.amount_minor || data.amount !== expectedAmountMinor) {
    failureReason = `Amount mismatch (payload: ${data.amount}, payment: ${payment.amount_minor}, expected: ${expectedAmountMinor})`;
  } else if (data.currency !== payment.currency) {
    failureReason = `Currency mismatch (payload: ${data.currency}, payment: ${payment.currency})`;
  } else if (data.metadata?.user_id !== payment.user_id) {
    failureReason = `User ID mismatch in metadata`;
  } else if (userError || !userData?.user?.email) {
    failureReason = `Auth user not found for payment user_id`;
  } else {
    const authEmail = userData.user.email.toLowerCase().trim();
    const customerEmail = String(data.customer?.email || "").toLowerCase().trim();
    if (customerEmail !== authEmail) {
      failureReason = `Customer email mismatch (payload: ${customerEmail}, auth: ${authEmail})`;
    }
  }

  // 4. If any check fails: mark the payment 'failed', log reason (no secrets), return 200 (so Paystack stops retrying), do NOT activate.
  if (failureReason) {
    console.error(`Verification failed for reference ${reference}: ${failureReason}`);
    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({ status: "failed" })
      .eq("reference", reference);

    if (updateError) {
      console.error("Failed to update payment status to failed:", updateError.message);
    }

    return new Response(
      JSON.stringify({ received: true, verified: false, reason: failureReason }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 5. When all pass: call activate_payment(reference) via service_role client. Never write profiles directly. Return 200.
  const { data: activated, error: activateError } = await supabaseAdmin.rpc("activate_payment", {
    p_reference: reference,
  });

  if (activateError) {
    console.error("activate_payment RPC call failed:", activateError.message);
    return new Response(JSON.stringify({ error: "Failed to activate payment" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ received: true, verified: true, activated: activated ?? true }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

if (typeof Deno !== "undefined" && typeof Deno?.serve === "function") {
  Deno.serve(handlePaymentWebhook);
}
