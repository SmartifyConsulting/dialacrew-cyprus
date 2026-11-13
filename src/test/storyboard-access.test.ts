import { describe, expect, it, vi } from "vitest";
import { assertProducerSiteMember } from "@/lib/storyboard-access";
function session(visible: boolean, roles: { producer?: boolean; admin?: boolean; member?: boolean } = {}) {
 const db = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visible ? { id: "production" } : null, error: null }) }) }) })), rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => ({ data: fn === "is_site_member" ? !!roles.member : args["_role"] === "admin" ? !!roles.admin : !!roles.producer, error: null })) };
 return { supabase: db, userId: "user" };
}
describe("storyboard privileged access", () => {
 it("denies a hidden production even for an admin, before generation or role bypass", async () => {
  const ctx = session(false, { admin: true });
  await expect(assertProducerSiteMember(ctx, "production")).rejects.toThrow("not accessible");
  expect(ctx.supabase.rpc).not.toHaveBeenCalled();
 });
 it("allows a visible production for its producer member", async () => {
  await expect(assertProducerSiteMember(session(true, { producer: true, member: true }), "production")).resolves.toBeUndefined();
 });
 it("retains access for an admin when caller-session visibility permits it", async () => {
  await expect(assertProducerSiteMember(session(true, { admin: true }), "production")).resolves.toBeUndefined();
 });
 it("denies crew members and producers outside the production", async () => {
  await expect(assertProducerSiteMember(session(true, { member: true }), "production")).rejects.toThrow("Only producers");
  await expect(assertProducerSiteMember(session(true, { producer: true }), "production")).rejects.toThrow("Not a member");
 });
});

