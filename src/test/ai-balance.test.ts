import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), prices: { breakdown: 0.02, references: 0.02, image: 0.04, pdf: 0.10 } }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { value: mocks.prices }, error: null }) }) }) }),
  rpc: mocks.rpc,
} }));
import { billStoryboardAction } from "@/lib/ai-balance.server";
beforeEach(() => { mocks.rpc.mockReset().mockResolvedValue({ error: null }); });
describe("AI balance gate", () => {
  it("does not call the provider if the balance cannot be debited", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Insufficient AI balance" } });
    const work = vi.fn();
    await expect(billStoryboardAction("test-user", "image", work)).rejects.toThrow("Insufficient");
    expect(work).not.toHaveBeenCalled();
  });
  it("debits once and refunds a failed generation using the same operation identity", async () => {
    await expect(billStoryboardAction("test-user", "image", async () => { throw new Error("Provider failed"); })).rejects.toThrow("Provider failed");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    const charge = mocks.rpc.mock.calls[0]![1]; const refund = mocks.rpc.mock.calls[1]![1];
    expect(charge).toMatchObject({ p_kind: "charge", p_amount: 40000 });
    expect(refund).toMatchObject({ p_kind: "refund", p_amount: 40000, p_operation: charge.p_operation });
  });
  it("keeps a successful generation charged and returns its saved result", async () => {
    await expect(billStoryboardAction("test-user", "breakdown", async () => ({ saved: true }))).resolves.toEqual({ saved: true });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
