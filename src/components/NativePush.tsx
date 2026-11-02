import { useEffect, useState } from "react";
import { BellRing, BellOff, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disableNativePush, enableNativePush, linkNativePush, nativePushStatus, openNativeNotificationSettings, type NativePushStatus } from "@/lib/native-push";
import { friendlyError } from "@/lib/errors";

export function NativePushSession({ userId }: { userId: string }) {
  useEffect(() => { void linkNativePush(userId).catch(() => { /* Optional bridge never blocks page navigation. */ }); }, [userId]);
  return null;
}

export function NativePushControls({ userId }: { userId: string }) {
  const [status, setStatus] = useState<NativePushStatus>("web");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void nativePushStatus().then((s) => { if (live) setStatus(s); }); return () => { live = false; }; }, []);
  if (status === "web") return null;
  async function enable() {
    setBusy(true);
    try {
      const next = await enableNativePush(userId); setStatus(next);
      if (next === "enabled") toast.success("Job alerts enabled on this device");
      else if (next === "disabled") toast.error("Allow notifications in your phone’s app settings");
      else toast.error("Notification settings are unavailable; try again in the native app");
    } catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true);
    try { await disableNativePush(); setStatus("disabled"); toast.success("Job alerts stopped on this device"); }
    catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
    <Button size="sm" variant="outline" disabled={busy} onClick={enable}><BellRing className="h-4 w-4" />{busy ? "Updating…" : "Enable job alerts"}</Button>
    <Button size="icon" variant="ghost" disabled={busy} title="Stop alerts on this device" aria-label="Stop alerts on this device" onClick={disable}><BellOff className="h-4 w-4" /></Button>
    <Button size="icon" variant="ghost" title="Phone notification settings" aria-label="Phone notification settings" onClick={() => void openNativeNotificationSettings().catch(() => toast.error("Could not open settings"))}><Settings className="h-4 w-4" /></Button>
  </div>;
}