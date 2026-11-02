import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyPushFailure, pushPayload } from "@/lib/push-payload";
import { disableNativePush, enableNativePush, linkNativePush, nativePushStatus } from "@/lib/native-push";

const mocks = vi.hoisted(() => ({ bridge: vi.fn(), rpc: vi.fn(), single: vi.fn() }));
vi.mock("despia-native", () => ({ default: mocks.bridge }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.single }), maybeSingle: mocks.single }) }) }),
} }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear(); });

describe("Native job alerts", () => {
  it.each(["gig_offer", "schedule_change", "booking_update"])("targets only the opaque device alias for %s", (kind) => {
    const payload = pushPayload({ id: "send-id", alias: "opaque-device", notificationId: "notice", productionId: "job", kind });
    expect(payload.include_aliases.external_id).toEqual(["opaque-device"]);
    expect(payload.data.path).toBe("/productions/job");
    expect(payload.idempotency_key).toBe("send-id");
    expect(payload.contents.en).toBe("Open Book a Crew to view your update.");
  });
  it("backs off only for rate limits and provider outages", () => {
    expect(classifyPushFailure(429)).toBe("retry");
    expect(classifyPushFailure(503)).toBe("retry");
    expect(classifyPushFailure(401)).toBe("failed");
    expect(classifyPushFailure(400)).toBe("failed");
  });
  it("does not request native permission or create a device in browsers", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Chrome");
    expect(await enableNativePush("user")).toBe("web");
    expect(mocks.bridge).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not register a device when permission is denied", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Despia Android");
    mocks.bridge.mockResolvedValue({ nativePushEnabled: false });
    expect(await enableNativePush("user")).toBe("disabled");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the documented permission watch variable", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Despia iPhone");
    mocks.bridge.mockResolvedValue({ nativePushEnabled: true });
    expect(await nativePushStatus()).toBe("enabled");
    expect(mocks.bridge).toHaveBeenCalledWith("checkNativePushPermissions://", ["nativePushEnabled"]);
  });
  it("never links another account's saved device", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Despia iPhone");
    localStorage.setItem("bookacrew-native-push-device", JSON.stringify({ id: "device", alias: "opaque", userId: "first" }));
    await linkNativePush("second");
    expect(mocks.bridge).not.toHaveBeenCalled();
  });
  it("revokes the device before clearing its local association", async () => {
    localStorage.setItem("bookacrew-native-push-device", JSON.stringify({ id: "device", alias: "opaque", userId: "user" }));
    mocks.rpc.mockResolvedValue({ error: null });
    await disableNativePush();
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_native_push_device", { p_id: "device" });
    expect(localStorage.getItem("bookacrew-native-push-device")).toBeNull();
  });
  it("retains the association if revocation fails, preventing unsafe sign-out", async () => {
    localStorage.setItem("bookacrew-native-push-device", JSON.stringify({ id: "device", alias: "opaque", userId: "user" }));
    mocks.rpc.mockResolvedValue({ error: new Error("offline") });
    await expect(disableNativePush()).rejects.toThrow("offline");
    expect(localStorage.getItem("bookacrew-native-push-device")).not.toBeNull();
  });
});