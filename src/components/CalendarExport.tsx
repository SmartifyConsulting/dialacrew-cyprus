import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { toICS, type CalEvent } from "@/lib/calendar-events";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** One-off .ics download plus a private subscription link for Google Calendar / Outlook (read-only, refreshed by them). */
export function CalendarExport({ events, userId }: { events: CalEvent[]; userId: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const token = useQuery({
    queryKey: ["calendar-feed-token", userId],
    enabled: open && !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("calendar_feed_tokens").select("token").eq("user_id", userId!).maybeSingle();
      if (data) return data.token;
      const { data: created, error } = await supabase.from("calendar_feed_tokens").insert({ user_id: userId! }).select("token").single();
      if (error) throw error;
      return created.token;
    },
  });
  const feedUrl = token.data && typeof window !== "undefined" ? `${window.location.origin}/api/public/calendar/${token.data}.ics` : "";
  const webcal = feedUrl.replace(/^https?:/, "webcal:");

  async function resetLink() {
    const { error } = await supabase.from("calendar_feed_tokens").delete().eq("user_id", userId!);
    if (error) { toast.error("Could not reset the link"); return; }
    await qc.invalidateQueries({ queryKey: ["calendar-feed-token", userId] });
    toast.success("New link created — the old one no longer works");
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => downloadBlob(new Blob([toICS(events)], { type: "text/calendar;charset=utf-8" }), "book-a-crew.ics")}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
          <Download className="h-3.5 w-3.5" /> Download .ics (one-off copy)
        </button>
        <button onClick={() => setOpen(!open)} className="rounded-md border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">
          {open ? "Hide subscription" : "Subscribe in Google / Outlook"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p><strong className="text-foreground">Download</strong> is a snapshot — it won't change after you import it. <strong className="text-foreground">Subscribe</strong> keeps your calendar app updated automatically (Google and Outlook refresh every few hours). It's read-only: changes made in Google or Outlook don't come back here.</p>
          {token.isPending ? <p>Creating your private link…</p> : token.isError ? <p className="text-destructive">Couldn't create your link.</p> : (
            <>
              <div className="flex gap-2">
                <input readOnly value={feedUrl} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]" onFocus={(e) => e.target.select()} />
                <button aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(feedUrl); toast.success("Link copied"); }} className="rounded-md border border-border px-2"><Copy className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 font-semibold text-foreground hover:bg-muted" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}>Add to Google Calendar</a>
                <a target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 font-semibold text-foreground hover:bg-muted" href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent("Book a Crew")}`}>Add to Outlook.com</a>
                <a className="rounded-md border border-border px-2 py-1 font-semibold text-foreground hover:bg-muted" href={webcal}>Apple / desktop Outlook</a>
              </div>
              <p>Google: Other calendars → "+" → From URL → paste the link. Outlook: Add calendar → Subscribe from web → paste the link.</p>
              <p>Keep this link private — anyone with it can see your schedule. <button onClick={resetLink} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><RefreshCw className="h-3 w-3" /> Reset link</button></p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
