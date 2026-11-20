import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handlePaymentInitialize } from "./index";

describe("payment-initialize edge function", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  const mockUserId = "12345678-1111-2222-3333-444455556666";
  const mockUserEmail = "nurse.student@example.com";
  const validToken = "valid-test-jwt-token";

  let paymentsDb: Array<{
    user_id: string;
    reference: string;
    amount_minor: number;
    currency: string;
    status: string;
  }> = [];

  let profileIsActive = false;
  let paystackFailMode: "none" | "http-error" | "network-error" | "invalid-data" = "none";
  let lastPaystackCall: { url: string; headers: HeadersInit; body: Record<string, unknown> } | null = null;

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://mock.supabase.co";
    process.env.SUPABASE_ANON_KEY = "mock-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";
    process.env.PAYSTACK_SECRET_KEY = "sk_test_mock_secret_12345";
    process.env.PAYMENT_AMOUNT_MINOR = "105000";
    process.env.PAYMENT_CURRENCY = "NGN";
    process.env.APP_BASE_URL = "https://nursingprep.ng";

    paymentsDb = [];
    profileIsActive = false;
    paystackFailMode = "none";
    lastPaystackCall = null;

    // Mock fetch for Supabase Auth, PostgREST DB, and Paystack API
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");

      // 1. Supabase Auth: /auth/v1/user
      if (urlStr.includes("/auth/v1/user")) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : {}));
        const auth = headers.get("Authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "");

        if (token === validToken) {
          return new Response(
            JSON.stringify({
              id: mockUserId,
              email: mockUserEmail,
              role: "authenticated",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ message: "Invalid JWT token" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      // 2. Supabase PostgREST: /rest/v1/profiles
      if (urlStr.includes("/rest/v1/profiles")) {
        return new Response(
          JSON.stringify({
            is_active: profileIsActive,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Content-Range": "0-0/1",
            },
          }
        );
      }

      // 3. Supabase PostgREST: /rest/v1/payments
      if (urlStr.includes("/rest/v1/payments")) {
        if (method === "POST") {
          const bodyText = typeof init?.body === "string" ? init.body : "";
          const parsed = JSON.parse(bodyText);
          paymentsDb.push(parsed);
          return new Response(JSON.stringify(parsed), {
            status: 201,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (method === "PATCH") {
          const bodyText = typeof init?.body === "string" ? init.body : "";
          const updates = JSON.parse(bodyText);
          const refMatch = urlStr.match(/reference=eq\.([^&]+)/);
          const ref = refMatch ? decodeURIComponent(refMatch[1]) : null;
          if (ref) {
            const found = paymentsDb.find((p) => p.reference === ref);
            if (found) {
              Object.assign(found, updates);
            }
          }
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // 4. Paystack: api.paystack.co/transaction/initialize
      if (urlStr.includes("api.paystack.co/transaction/initialize")) {
        const bodyText = typeof init?.body === "string" ? init.body : "";
        lastPaystackCall = {
          url: urlStr,
          headers: init?.headers ?? {},
          body: JSON.parse(bodyText),
        };

        if (paystackFailMode === "network-error") {
          throw new Error("Paystack network connectivity error");
        }
        if (paystackFailMode === "http-error") {
          return new Response(
            JSON.stringify({
              status: false,
              message: "Cannot initialize transaction with invalid currency",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (paystackFailMode === "invalid-data") {
          return new Response(
            JSON.stringify({
              status: true,
              message: "OK",
              data: {}, // Missing authorization_url
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            status: true,
            message: "Authorization URL created",
            data: {
              authorization_url: "https://checkout.paystack.com/test-auth-url-123",
              access_code: "access-code-123",
              reference: lastPaystackCall.body.reference,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("Not Found", { status: 404 });
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("handles CORS OPTIONS preflight request", async () => {
    const req = new Request("https://mock.supabase.co/functions/v1/payment-initialize", {
      method: "OPTIONS",
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const allowHeaders = res.headers.get("Access-Control-Allow-Headers")?.toLowerCase() || "";
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).toContain("content-type");
  });

  it("rejects 401 if missing Authorization header (no JWT)", async () => {
    const req = new Request("https://mock.supabase.co/functions/v1/payment-initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("rejects 401 if JWT is invalid or expired", async () => {
    const req = new Request("https://mock.supabase.co/functions/v1/payment-initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-token",
      },
      body: JSON.stringify({}),
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(401);
  });

  it("rejects 409 if profiles.is_active is already true", async () => {
    profileIsActive = true;

    const req = new Request("https://mock.supabase.co/functions/v1/payment-initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({}),
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already active/i);

    // Ensure no payment record was created
    expect(paymentsDb).toHaveLength(0);
  });

  it("ignores client-sent amount and uses PAYMENT_AMOUNT_MINOR from env", async () => {
    profileIsActive = false;

    // Client attempts to send an altered amount in body
    const req = new Request("https://mock.supabase.co/functions/v1/payment-initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        amount: 1,
        amount_minor: 1,
      }),
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    // Only { authorization_url, reference } returned. Never secret key!
    expect(data).toHaveProperty("authorization_url", "https://checkout.paystack.com/test-auth-url-123");
    expect(data).toHaveProperty("reference");
    expect(Object.keys(data).sort()).toEqual(["authorization_url", "reference"].sort());
    expect(JSON.stringify(data)).not.toContain("sk_test_");

    // Reference starts with nursing-<first 8 of user id>-
    const userPrefix = mockUserId.slice(0, 8);
    expect(data.reference).toMatch(new RegExp(`^nursing-${userPrefix}-[0-9a-f-]{36}$`));

    // Verify Paystack call received amountMinor from env (105000), not client value
    expect(lastPaystackCall).not.toBeNull();
    expect(lastPaystackCall?.body.amount).toBe(105000);
    expect(lastPaystackCall?.body.currency).toBe("NGN");
    expect(lastPaystackCall?.body.email).toBe(mockUserEmail);
    expect(lastPaystackCall?.body.callback_url).toBe("https://nursingprep.ng/pay/return");
    expect(lastPaystackCall?.body.metadata).toEqual({ user_id: mockUserId });

    // Verify payment record in DB has amount_minor: 105000 and status: 'pending'
    expect(paymentsDb).toHaveLength(1);
    expect(paymentsDb[0]).toMatchObject({
      user_id: mockUserId,
      reference: data.reference,
      amount_minor: 105000,
      currency: "NGN",
      status: "pending",
    });
  });

  it("returns 502 and marks payment row failed on Paystack HTTP error", async () => {
    profileIsActive = false;
    paystackFailMode = "http-error";

    const req = new Request("https://mock.supabase.co/functions/v1/payment-initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({}),
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(502);

    expect(paymentsDb).toHaveLength(1);
    expect(paymentsDb[0].status).toBe("failed");
  });

  it("returns 502 and marks payment row failed on Paystack network failure", async () => {
    profileIsActive = false;
    paystackFailMode = "network-error";

    const req = new Request("https://mock.supabase.co/functions/v1/payment-initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({}),
    });

    const res = await handlePaymentInitialize(req);
    expect(res.status).toBe(502);

    expect(paymentsDb).toHaveLength(1);
    expect(paymentsDb[0].status).toBe("failed");
  });
});
