import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell({ userId, requireAcknowledgement = false }: { userId: string; requireAcknowledgement?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  useEffect(() => {
    const ch = supabase.channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", userId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);
  const list = q.data ?? [];
  const pending = list.filter((n) => !n.acknowledged_at);
  const unread = requireAcknowledgement ? pending.length : list.filter((n) => !n.read).length;

  const [ackBusy, setAckBusy] = useState(false);
  const [ackError, setAckError] = useState("");
  const current = requireAcknowledgement ? pending[0] : undefined;
  async function acknowledge() {
    if (!current || ackBusy) return;
    setAckBusy(true);
    setAckError("");
    const { error } = await supabase.rpc("acknowledge_notification", { p_notification_id: current.id });
    if (error) setAckError(error.message);
    else await qc.invalidateQueries({ queryKey: ["notifications", userId] });
    setAckBusy(false);
  }

  async function markAll() {
    if (requireAcknowledgement) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <div className="relative">
      {current && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
        <section role="alertdialog" aria-modal="true" aria-labelledby="notification-title" className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-2xl">
          <p className="mb-2 text-xs font-semibold uppercase text-primary">Crew notification — acknowledgement required</p>
          <h2 id="notification-title" className="mb-3 text-xl font-bold">{current.title}</h2>
          <p className="mb-4 whitespace-pre-wrap text-sm">{current.body}</p>
          <p className="mb-4 text-xs text-muted-foreground">Sent {new Date(current.created_at).toLocaleString("en-ZA")}. Your acknowledgement is recorded in the audit trail.</p>
          {ackError && <p role="alert" className="mb-3 text-sm text-destructive">{ackError}</p>}
          <button disabled={ackBusy} onClick={acknowledge} className="w-full rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{ackBusy ? "Recording..." : "OK, Acknowledge"}</button>
          {pending.length > 1 && <p className="mt-3 text-center text-xs text-muted-foreground">{pending.length - 1} more awaiting acknowledgement</p>}
        </section>
      </div>}
      <button aria-label="Notifications" onClick={() => setOpen(!open)} className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-primary-foreground/10">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-sm border border-border bg-card text-card-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs">
            <span className="text-sm font-bold text-primary">Notifications</span>
            {unread > 0 && !requireAcknowledgement && <button onClick={markAll} className="text-muted-foreground hover:text-foreground">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-auto">
            {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>}
            {list.map((n) => (
              <Link key={n.id} to="/productions/$id" params={{ id: n.production_id ?? "" }} onClick={() => setOpen(false)}
                className={`block border-b border-border px-3 py-2 text-sm hover:bg-muted ${n.read ? "opacity-60" : ""}`}>
                <div className="font-bold">{n.title}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
