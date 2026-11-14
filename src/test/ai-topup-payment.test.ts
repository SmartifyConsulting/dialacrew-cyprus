import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  fetch: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(),
  purchase: null as Record<string, unknown> | null,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => {
        validate = fn;
        return builder;
      },
      handler: (fn: (arg: Record<string, unknown>) => unknown) => (arg: Record<string, unknown>) =>
        fn({ ...arg, data: validate(arg["data"]) }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: () => "http://localhost:5178",
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: mock.insert,
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mock.purchase, error: null }) }),
      }),
    }),
    rpc: mock.rpc,
  },
}));
vi.mock("@/lib/ai-balance.server", () => ({ storyboardPrices: async () => ({}) }));
let payment: typeof import("@/lib/ai-balance.functions");
const reference = "aib_test_fixture";
const context = { userId: "test-user", claims: { email: "qa@example.com" } };
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ status: status === 200, data }), { status });
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture_not_a_real_key");
  vi.stubEnv("APP_URL", "");
  vi.stubGlobal("fetch", mock.fetch);
  mock.fetch.mockReset();
  mock.rpc.mockReset().mockResolvedValue({ error: null });
  mock.insert.mockReset().mockResolvedValue({ error: null });
  mock.purchase = {
    reference,
    user_id: "test-user",
    status: "pending",
    currency: "ZAR",
    amount_minor: 20000,
    usd_micros: 10000000,
  };
  payment = await import("@/lib/ai-balance.functions");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function start(currency = "ZAR", usd = 10) {
  return (payment.startAiTopup as unknown as (arg: unknown) => Promise<Record<string, unknown>>)({
    data: { currency, usd },
    context,
  });
}
function rates() {
  mock.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ result: "success", rates: { USD: 1, ZAR: 20, EUR: 0.9 } })),
  );
}
describe("AI top-up payment contracts (isolated test provider)", () => {
  it("initializes the exact selected currency and minimum amount with the account return URL", async () => {
    rates();
    mock.fetch.mockResolvedValueOnce(
      response({ authorization_url: "https://checkout.paystack.com/test_fixture" }),
    );
    const result = await start();
    expect(result).toMatchObject({ amount: 20000, currency: "ZAR" });
    const request = JSON.parse(mock.fetch.mock.calls[1]![1].body);
    expect(request).toMatchObject({
      amount: 20000,
      currency: "ZAR",
      callback_url: expect.stringContaining("/profile?tab=Account&ai_topup=aib_"),
    });
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "test-user", usd_micros: 10000000 }),
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects an under-minimum top-up before creating a purchase or provider request", async () => {
    rates();
    await expect(start("ZAR", 9)).rejects.toThrow("at least");
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not silently substitute a different checkout currency", async () => {
    rates();
    mock.fetch.mockResolvedValueOnce(response(null, 400));
    await expect(start("EUR")).rejects.toThrow("currency or request");
    expect(JSON.parse(mock.fetch.mock.calls[1]![1].body).currency).toBe("EUR");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["https://wrong.example/checkout", "http://checkout.paystack.com/test"])("rejects an unsafe checkout destination: %s", async (authorization_url) => {
    rates();
    mock.fetch.mockResolvedValueOnce(
      response({ authorization_url }),
    );
    await expect(start()).rejects.toThrow("destination");
  });
  it("credits only an independently verified matching payment", async () => {
    mock.fetch.mockResolvedValueOnce(
      response({ status: "success", reference, currency: "ZAR", amount: 20000 }),
    );
    await expect(payment.settleAiTopup(reference, "test-user")).resolves.toBe(true);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("credit_ai_purchase", {
      p_reference: reference,
    });
  });
  it.each([
    { amount: 19999 },
    { currency: "USD" },
    { reference: "aib_someone_else" },
    { status: "failed" },
  ])("does not credit a mismatched provider response: %j", async (patch) => {
    mock.fetch.mockResolvedValueOnce(
      response({ status: "success", reference, currency: "ZAR", amount: 20000, ...patch }),
    );
    await expect(payment.settleAiTopup(reference, "test-user")).rejects.toThrow("not confirmed");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("blocks a different account before contacting the provider", async () => {
    await expect(payment.settleAiTopup(reference, "other-user")).rejects.toThrow("does not belong");
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("handles an already-paid callback without a second credit", async () => {
    mock.purchase!["status"] = "paid";
    await expect(payment.settleAiTopup(reference, "test-user")).resolves.toBe(true);
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("allows retry when a verified payment could not update the ledger", async () => {
    mock.fetch.mockResolvedValueOnce(
      response({ status: "success", reference, currency: "ZAR", amount: 20000 }),
    );
    mock.rpc.mockResolvedValueOnce({ error: { message: "temporary" } });
    await expect(payment.settleAiTopup(reference, "test-user")).rejects.toThrow("verify again");
  });
});
