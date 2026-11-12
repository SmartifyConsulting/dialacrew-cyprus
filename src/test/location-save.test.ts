import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, update: vi.fn(), insert: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = { eq: (...args: unknown[]) => { state.eq(...args); return chain; }, select: () => ({ single: async () => state.result }) };
  return { supabase: { from: () => ({ update: (payload: unknown) => { state.update(payload); return chain; }, insert: (payload: unknown) => { state.insert(payload); return chain; } }) } };
});
import { persistLocation } from "@/lib/location-save";
beforeEach(() => { vi.clearAllMocks(); state.result = { data: null, error: null }; });
it("does not claim a save when RLS returns no row", async () => {
  await expect(persistLocation("p1", "loc1", { label: "Studio" })).rejects.toThrow("not saved");
  expect(state.eq).toHaveBeenCalledWith("production_id", "p1");
});
it("returns the persisted row and production-scopes new locations", async () => {
  state.result.data = { id: "loc1", production_id: "p1", label: "Studio" };
  await expect(persistLocation("p1", null, { label: "Studio" })).resolves.toMatchObject({ id: "loc1" });
  expect(state.insert).toHaveBeenCalledWith({ production_id: "p1", label: "Studio" });
});
it("preserves errors from persistence", async () => {
  state.result.error = new Error("Write denied");
  await expect(persistLocation("p1", "loc1", { label: "Studio" })).rejects.toThrow("Write denied");
});
