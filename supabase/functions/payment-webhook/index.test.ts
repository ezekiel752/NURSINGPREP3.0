import { describe, it, expect, beforeEach, vi } from "vitest";
import { handlePaymentWebhook, computeHmacSha512Hex } from "./index";

describe("payment-webhook edge function", () => {
  const testSecretKey = "sk_test_paystack_secret_key_12345";
  const liveSecretKey = "sk_live_paystack_secret_key_67890";
  const testAmountMinor = 500000;
  const testCurrency = "NGN";
  const testUserId = "11111111-1111-1111-1111-111111111111";
  const testEmail = "student@example.com";
  const testRef = "nursing-11111111-uuid-1234";

  let paymentsDb: Array<{
    user_id: string;
    reference: string;
    amount_minor: number;
    currency: string;
    status: string;
  }> = [];

  let rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = [];

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://mock.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";
    process.env.PAYSTACK_SECRET_KEY = testSecretKey;
    process.env.PAYMENT_AMOUNT_MINOR = String(testAmountMinor);
    process.env.PAYMENT_CURRENCY = testCurrency;

    paymentsDb = [
      {
        user_id: testUserId,
        reference: testRef,
        amount_minor: testAmountMinor,
        currency: testCurrency,
        status: "pending",
      },
    ];

    rpcCalls = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");

      // 1. Supabase PostgREST: /rest/v1/payments
      if (urlStr.includes("/rest/v1/payments")) {
        const refMatch = urlStr.match(/reference=eq\.([^&]+)/);
        const ref = refMatch ? decodeURIComponent(refMatch[1]) : null;

        if (method === "GET") {
          const payment = paymentsDb.find((p) => p.reference === ref);
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
          const accept = headers.get("Accept") || "";

          if (accept.includes("application/vnd.pgrst.object+json")) {
            if (!payment) {
              return new Response(JSON.stringify({ message: "Not found", code: "PGRST116" }), {
                status: 406,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify(payment), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify(payment ? [payment] : []), {
            status: 200,
            headers: { "Content-Type": "application/json", "Content-Range": payment ? "0-0/1" : "0-0/0" },
          });
        }

        if (method === "PATCH") {
          const bodyText = typeof init?.body === "string" ? init.body : "";
          const updates = JSON.parse(bodyText);
          const payment = paymentsDb.find((p) => p.reference === ref);
          if (payment) {
            Object.assign(payment, updates);
          }
          return new Response(JSON.stringify(payment || {}), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // 2. Supabase Auth Admin: /auth/v1/admin/users/:userId
      if (urlStr.includes("/auth/v1/admin/users/")) {
        const segments = urlStr.split("/");
        const requestedId = segments[segments.length - 1];

        if (requestedId === testUserId) {
          return new Response(
            JSON.stringify({
              id: testUserId,
              email: testEmail,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        return new Response(
          JSON.stringify({ message: "User not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // 3. Supabase PostgREST RPC: /rest/v1/rpc/activate_payment
      if (urlStr.includes("/rest/v1/rpc/activate_payment")) {
        const bodyText = typeof init?.body === "string" ? init.body : "";
        const parsed = JSON.parse(bodyText);
        rpcCalls.push({ name: "activate_payment", params: parsed });
        return new Response(JSON.stringify(true), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Unhandled mock route" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  const createWebhookRequest = async (
    body: Record<string, unknown>,
    options?: {
      signature?: string | null;
      secret?: string;
      rawString?: string;
    }
  ) => {
    const rawBody = options?.rawString ?? JSON.stringify(body);
    const secret = options?.secret ?? testSecretKey;
    let signature = options?.signature;

    if (signature === undefined) {
      signature = await computeHmacSha512Hex(secret, rawBody);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (signature !== null) {
      headers["x-paystack-signature"] = signature;
    }

    return new Request("https://mock.supabase.co/functions/v1/payment-webhook", {
      method: "POST",
      headers,
      body: rawBody,
    });
  };

  const getValidPayload = () => ({
    event: "charge.success",
    data: {
      status: "success",
      reference: testRef,
      amount: testAmountMinor,
      currency: testCurrency,
      customer: {
        email: testEmail,
      },
      metadata: {
        user_id: testUserId,
      },
    },
  });

  // 1. no signature -> 401
  it("rejects request with 401 when signature header is missing", async () => {
    const req = await createWebhookRequest(getValidPayload(), { signature: null });
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
    expect(rpcCalls).toHaveLength(0);
  });

  // 2. wrong signature -> 401
  it("rejects request with 401 when signature is incorrect", async () => {
    const req = await createWebhookRequest(getValidPayload(), { signature: "invalid-signature-hex-12345" });
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
    expect(rpcCalls).toHaveLength(0);
  });

  // 3. valid signature wrong event -> 200 no action
  it("returns 200 with no action when event is not charge.success", async () => {
    const payload = {
      event: "transfer.success",
      data: { reference: testRef },
    };
    const req = await createWebhookRequest(payload);
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ignored).toBe(true);
    expect(rpcCalls).toHaveLength(0);
  });

  // 4. wrong amount -> marked failed, not activated
  it("marks payment as failed and does not activate when amount does not match", async () => {
    const payload = getValidPayload();
    payload.data.amount = 250000; // wrong amount

    const req = await createWebhookRequest(payload);
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(false);
    expect(body.reason).toMatch(/amount mismatch/i);

    // Payment marked failed in DB
    const payment = paymentsDb.find((p) => p.reference === testRef);
    expect(payment?.status).toBe("failed");
    expect(rpcCalls).toHaveLength(0);
  });

  // 5. wrong user -> not activated
  it("marks payment as failed and does not activate when user_id does not match", async () => {
    const payload = getValidPayload();
    payload.data.metadata.user_id = "99999999-9999-9999-9999-999999999999";

    const req = await createWebhookRequest(payload);
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(false);
    expect(body.reason).toMatch(/user id mismatch/i);

    const payment = paymentsDb.find((p) => p.reference === testRef);
    expect(payment?.status).toBe("failed");
    expect(rpcCalls).toHaveLength(0);
  });

  // 6. already success -> 200, activate not called twice
  it("returns 200 and does not call activate_payment when payment is already success", async () => {
    paymentsDb[0].status = "success";

    const req = await createWebhookRequest(getValidPayload());
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("already_processed");
    expect(rpcCalls).toHaveLength(0);
  });

  // 7. valid -> activate called once
  it("successfully verifies payment and calls activate_payment once for valid payload", async () => {
    const req = await createWebhookRequest(getValidPayload());
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.activated).toBe(true);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toEqual({
      name: "activate_payment",
      params: { p_reference: testRef },
    });
  });

  // 8. live-style key (sk_live_...) works for HMAC
  it("verifies signature and processes webhook successfully with a live-style secret key (sk_live_...)", async () => {
    process.env.PAYSTACK_SECRET_KEY = liveSecretKey;

    const req = await createWebhookRequest(getValidPayload(), { secret: liveSecretKey });
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.activated).toBe(true);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toEqual({
      name: "activate_payment",
      params: { p_reference: testRef },
    });
  });

  // Additional check: case-insensitive email match
  it("accepts customer email case-insensitively", async () => {
    const payload = getValidPayload();
    payload.data.customer.email = "STUDENT@EXAMPLE.COM";

    const req = await createWebhookRequest(payload);
    const res = await handlePaymentWebhook(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(rpcCalls).toHaveLength(1);
  });
});
