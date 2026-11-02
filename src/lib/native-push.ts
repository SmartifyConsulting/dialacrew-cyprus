import { isDespiaRuntime } from "@/lib/native";
import { supabase } from "@/integrations/supabase/client";

const storageKey = "bookacrew-native-push-device";
type Device = { id: string; alias: string; userId: string };
export type NativePushStatus = "web" | "enabled" | "disabled" | "unavailable";

function readDevice(): Device | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return value && typeof value.id === "string" && typeof value.alias === "string" && typeof value.userId === "string" ? value : null;
  } catch { return null; }
}

/** Opaque per-install aliases avoid exposing a user's login ID to the push service. */
export async function linkNativePush(userId: string): Promise<void> {
  if (typeof window === "undefined" || !isDespiaRuntime()) return;
  const saved = readDevice();
  if (!saved || saved.userId !== userId) return;
  const { data, error } = await supabase.from("native_push_devices").select("alias,enabled").eq("id", saved.id).eq("user_id", userId).maybeSingle();
  if (error || !data?.enabled || data.alias !== saved.alias) return;
  const { default: despia } = await import("despia-native");
  await despia(`setonesignalplayerid://?user_id=${encodeURIComponent(saved.alias)}`);
}

export async function nativePushStatus(): Promise<NativePushStatus> {
  if (typeof window === "undefined" || !isDespiaRuntime()) return "web";
  try {
    const { default: despia } = await import("despia-native");
    const result = await despia("checkNativePushPermissions://", ["nativePushEnabled"]);
    return result.nativePushEnabled === true ? "enabled" : "disabled";
  } catch { return "unavailable"; }
}

export async function enableNativePush(userId: string): Promise<NativePushStatus> {
  if (typeof window === "undefined" || !isDespiaRuntime()) return "web";
  const { default: despia } = await import("despia-native");
  // Despia automatic registration must be disabled in build settings for this opt-in flow.
  await despia("registerpush://");
  const status = await nativePushStatus();
  if (status !== "enabled") return status;
  let device = readDevice();
  if (device?.userId !== userId) device = null;
  if (device) {
    const { data } = await supabase.from("native_push_devices").select("enabled").eq("id",device.id).maybeSingle();
    if (!data?.enabled) device = null;
  }
  if (!device) {
    const { data, error } = await supabase.rpc("register_native_push_device");
    if (error) throw error;
    if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.id !== "string" || typeof data.alias !== "string") throw new Error("Device registration failed");
    device = { id: data.id, alias: data.alias, userId };
    try { localStorage.setItem(storageKey, JSON.stringify(device)); }
    catch {
      await supabase.rpc("revoke_native_push_device", { p_id: device.id });
      throw new Error("Device storage is unavailable; alerts were not enabled.");
    }
  }
  await linkNativePush(userId);
  return "enabled";
}

export async function disableNativePush(): Promise<void> {
  if (typeof window === "undefined") return;
  const device = readDevice();
  if (!device) return;
  const { error } = await supabase.rpc("revoke_native_push_device", { p_id: device.id });
  if (error) throw error;
  localStorage.removeItem(storageKey);
  // No undocumented OneSignal logout command: revoke this alias server-side instead.
}

export async function openNativeNotificationSettings(): Promise<void> {
  if (!isDespiaRuntime()) return;
  const { default: despia } = await import("despia-native");
  await despia("settingsapp://");
}