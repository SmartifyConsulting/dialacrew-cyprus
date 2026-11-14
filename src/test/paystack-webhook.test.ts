import { webcrypto, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ settle: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
vi.mock("@/lib/ai-balance.functions", () => ({ settleAiTopup: mock.settle }));
import { Route } from "@/routes/api/public/paystack-webhook";
const secret = "sk_test_webhook_fixture_only";
const handler = (
  Route as unknown as {
    server: { handlers: { POST: (arg: { request: Request }) => Promise<Response> } };
  }
).server.handlers.POST;
function send(body: string, signature = createHmac("sha512", secret).update(body).digest("hex")) {
  return handler({
    request: new Request("https://example.test/api/public/paystack-webhook", {
      method: "POST",
      body,
      headers: { "x-paystack-signature": signature },
    }),
  });
}
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", secret);
  vi.stubGlobal("crypto", webcrypto);
  mock.settle.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Paystack signed webhook routing", () => {
  it("rejects an unsigned or altered body before credit processing", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "aib_test" } });
    expect((await send(body, "invalid")).status).toBe(401);
    const original = createHmac("sha512", secret).update(body).digest("hex");
    expect((await send(body + " ", original)).status).toBe(401);
    expect(mock.settle).not.toHaveBeenCalled();
  });
  it("routes a signed AI top-up to independent payment verification", async () => {
    const body = JSON.stringify({ event: "charge.success", data: { reference: "aib_test" } });
    expect((await send(body)).status).toBe(200);
    expect(mock.settle).toHaveBeenCalledExactlyOnceWith("aib_test");
  });
  it("asks the provider to retry when ledger processing fails", async () => {
    mock.settle.mockRejectedValueOnce(new Error("Temporary ledger failure"));
    expect(
      (await send(JSON.stringify({ event: "charge.success", data: { reference: "aib_test" } })))
        .status,
    ).toBe(500);
  });
  it("ignores non-success events and rejects malformed signed JSON", async () => {
    expect(
      (await send(JSON.stringify({ event: "charge.failed", data: { reference: "aib_test" } })))
        .status,
    ).toBe(200);
    expect((await send("{bad json")).status).toBe(400);
    expect(mock.settle).not.toHaveBeenCalled();
  });
  it("does not accept callbacks when the payment secret is missing", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "");
    expect((await send("{}")).status).toBe(503);
    expect(mock.settle).not.toHaveBeenCalled();
  });
});
