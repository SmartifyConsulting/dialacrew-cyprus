import { afterEach, describe, expect, it, vi } from "vitest";
import { isDespiaRuntime, nativeFeedback } from "@/lib/native";

const bridge = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("despia-native", () => ({ default: bridge }));

afterEach(() => { vi.restoreAllMocks(); bridge.mockClear(); bridge.mockResolvedValue(undefined); });

describe("Despia bridge", () => {
  it("recognizes Despia on both platforms, not ordinary browsers", () => {
    expect(isDespiaRuntime("Mozilla iPhone Despia/21")).toBe(true);
    expect(isDespiaRuntime("Mozilla Android despia/21")).toBe(true);
    expect(isDespiaRuntime("Mozilla iPhone Safari")).toBe(false);
  });
  it("does not invoke native commands in a web browser", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Chrome");
    await nativeFeedback("success");
    expect(bridge).not.toHaveBeenCalled();
  });
  it("sends the documented success and warning commands in Despia", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android Despia");
    await nativeFeedback("success");
    await nativeFeedback("warning");
    expect(bridge.mock.calls).toEqual([["successhaptic://"], ["warninghaptic://"]]);
  });
  it("does not reject a saved action when native feedback fails", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone Despia");
    bridge.mockRejectedValue(new Error("Bridge unavailable"));
    await expect(nativeFeedback("success")).resolves.toBeUndefined();
    expect(bridge).toHaveBeenCalledWith("successhaptic://");
  });
});