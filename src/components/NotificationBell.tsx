import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function NotificationBell({ userId }: { userId: string }) {
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
  const unread = list.filter((n) => !n.read).length;

  async function markAll() {
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    qc.invalidateQueries({ queryKey: ["notifications", userId] });
  }

  return (
    <div className="relative">
      <button aria-label="Notifications" onClick={() => setOpen(!open)} className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-primary-foreground/10">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-sm border border-border bg-card text-card-foreground shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs uppercase tracking-widest">
            <span className="text-primary">Notifications</span>
            {unread > 0 && <button onClick={markAll} className="text-muted-foreground hover:text-foreground">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-auto">
            {list.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>}
            {list.map((n) => (
              <Link key={n.id} to="/productions/$id" params={{ id: n.production_id ?? "" }} onClick={() => setOpen(false)}
                className={`block border-b border-border px-3 py-2 text-sm hover:bg-muted ${n.read ? "opacity-60" : ""}`}>
                <div className="font-semibold">{n.title}</div>
                <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
