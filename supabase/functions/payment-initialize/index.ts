import { createClient } from "@supabase/supabase-js";

// CORS headers allowing Authorization and Content-Type
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Interface for Deno global when running in Supabase Edge Runtime
declare const Deno:
  | {
      env: {
        get(key: string): string | undefined;
      };
      serve?: (handler: (req: Request) => Promise<Response> | Response) => void;
    }
  | undefined;

function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined" && Deno?.env) {
    return Deno.env.get(key);
  }
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

export async function handlePaymentInitialize(req: Request): Promise<Response> {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Auth: require caller's JWT (Authorization header)
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Invalid authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get user with supabase-js using anon key + caller's Authorization header
  const supabaseCaller = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseCaller.auth.getUser(token);

  if (userError || !user || !user.id) {
    return new Response(JSON.stringify({ error: "Invalid or expired user session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!user.email) {
    return new Response(JSON.stringify({ error: "User email is required for payment" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 4. Reject if profiles.is_active is already true (409)
  const { data: profile, error: profileError } = await supabaseCaller
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return new Response(JSON.stringify({ error: "Failed to query profile" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (profile?.is_active === true) {
    return new Response(JSON.stringify({ error: "Profile is already active" }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 5. Read from env, never from the request body: PAYSTACK_SECRET_KEY,
  // PAYMENT_AMOUNT_MINOR (parse to integer, reject if invalid),
  // PAYMENT_CURRENCY, APP_BASE_URL. The client sends NO amount.
  const paystackSecretKey = getEnv("PAYSTACK_SECRET_KEY");
  const rawAmountMinor = getEnv("PAYMENT_AMOUNT_MINOR");
  const paymentCurrency = getEnv("PAYMENT_CURRENCY") || "NGN";
  const appBaseUrl = getEnv("APP_BASE_URL");

  if (!paystackSecretKey) {
    return new Response(JSON.stringify({ error: "PAYSTACK_SECRET_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const amountMinor = rawAmountMinor ? parseInt(rawAmountMinor, 10) : NaN;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return new Response(JSON.stringify({ error: "Invalid PAYMENT_AMOUNT_MINOR configuration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!appBaseUrl) {
    return new Response(JSON.stringify({ error: "APP_BASE_URL not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Service role client for DB writes only
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // 6. Reference: nursing-<first 8 of user id>-<crypto.randomUUID()>.
  // Always create a fresh pending row in payments (no 30-minute lock).
  const userPrefix = user.id.slice(0, 8);
  const reference = `nursing-${userPrefix}-${crypto.randomUUID()}`;

  const { error: insertError } = await supabaseAdmin.from("payments").insert({
    user_id: user.id,
    reference,
    amount_minor: amountMinor,
    currency: paymentCurrency,
    status: "pending",
  });

  if (insertError) {
    return new Response(JSON.stringify({ error: "Failed to create payment record" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 7. Call Paystack POST https://api.paystack.co/transaction/initialize
  const callbackUrl = `${appBaseUrl.replace(/\/+$/, "")}/pay/return`;
  const paystackPayload = {
    email: user.email,
    amount: amountMinor,
    currency: paymentCurrency,
    reference,
    callback_url: callbackUrl,
    metadata: {
      user_id: user.id,
    },
  };

  let paystackResponse: Response;
  try {
    paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paystackPayload),
    });
  } catch {
    // Paystack network error: mark payment failed and return 502
    await supabaseAdmin
      .from("payments")
      .update({ status: "failed" })
      .eq("reference", reference);

    return new Response(JSON.stringify({ error: "Paystack initialization network error" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let paystackData: {
    status?: boolean;
    message?: string;
    data?: {
      authorization_url?: string;
      reference?: string;
    };
  } | null;

  try {
    paystackData = (await paystackResponse.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        authorization_url?: string;
        reference?: string;
      };
    };
  } catch {
    paystackData = null;
  }

  if (
    !paystackResponse.ok ||
    !paystackData ||
    paystackData.status !== true ||
    !paystackData.data?.authorization_url
  ) {
    await supabaseAdmin
      .from("payments")
      .update({ status: "failed" })
      .eq("reference", reference);

    return new Response(
      JSON.stringify({
        error: paystackData?.message || "Paystack initialization failed",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // 8. Return only { authorization_url, reference }. Never return the secret.
  return new Response(
    JSON.stringify({
      authorization_url: paystackData.data.authorization_url,
      reference,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

if (typeof Deno !== "undefined" && typeof Deno?.serve === "function") {
  Deno.serve(handlePaymentInitialize);
}
