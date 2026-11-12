import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRedirect } from "@tanstack/react-router";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: mocks.getUser } },
}));
import { Route } from "@/routes/_authenticated/route";

const guard = Route.options.beforeLoad as () => Promise<unknown>;
beforeEach(() => mocks.getUser.mockReset());
describe("authenticated route guard (mocked auth service)", () => {
  it.each([
    { data: { user: null }, error: null },
    { data: { user: null }, error: { message: "Expired token" } },
    { data: { user: { id: "untrusted" } }, error: { message: "Invalid token" } },
  ])("redirects an unauthenticated or invalid session", async (result) => {
    mocks.getUser.mockResolvedValue(result);
    let failure: unknown;
    try {
      await guard();
    } catch (error) {
      failure = error;
    }
    expect(isRedirect(failure)).toBe(true);
    expect((failure as { options: { to: string } }).options.to).toBe("/auth");
  });
  it("passes the verified user to authenticated pages", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "test-crew" } }, error: null });
    await expect(guard()).resolves.toEqual({ user: { id: "test-crew" } });
  });
});
