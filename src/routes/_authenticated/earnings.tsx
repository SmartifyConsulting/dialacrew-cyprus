import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge, Page, Panel } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { useMyCrewId } from "@/lib/site";
import { zar } from "@/lib/demo-data";

const PAID = ["payment_released", "completed", "resolved"];

function payLabel(status: string) {
  if (PAID.includes(status)) return "Paid to crew";
  if (["awaiting_release", "release_authorised", "awaiting_review"].includes(status)) return "Awaiting payment";
  if (status === "payment_required") return "Client payment awaited";
  return "Upcoming";
}

function EarningsPage() {
  const { session } = useSession();
  const uid = session?.user.id;
  const crewId = useMyCrewId(true).data;
  const jobs = useQuery({
    queryKey: ["crew-earnings", crewId], enabled: !!crewId,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, role, status, booking_date, crew_rate, days, productions(name, client)").eq("crew_id", crewId!).order("booking_date", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  }).data ?? [];
  const gigs = useQuery({
    queryKey: ["crew-gig-earnings", uid], enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("community_gigs").select("id, title, role, status, amount, event_date, posted_by").eq("secured_by", uid!).order("event_date", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  }).data ?? [];

  const total = (b: { crew_rate: number | null; days: number | null }) => Number(b.crew_rate ?? 0) * Number(b.days ?? 1);
  const month = new Date().toISOString().slice(0, 7);
  const monthName = new Date().toLocaleString("en-ZA", { month: "long" });
  const paidMonth = jobs.filter((j) => PAID.includes(j.status) && (j.booking_date ?? "").startsWith(month)).reduce((a, j) => a + total(j), 0)
    + gigs.filter((g) => g.status === "completed" && (g.event_date ?? "").startsWith(month)).reduce((a, g) => a + Number(g.amount ?? 0), 0);
  const toCome = jobs.filter((j) => !PAID.includes(j.status) && j.status !== "cancelled").reduce((a, j) => a + total(j), 0)
    + gigs.filter((g) => g.status === "secured").reduce((a, g) => a + Number(g.amount ?? 0), 0);
  const gigEarned = gigs.filter((g) => g.status === "completed").reduce((a, g) => a + Number(g.amount ?? 0), 0);

  return (
    <Page open title="Earnings" subtitle="What you've been paid and what's coming">
      <section className="mb-5 rounded-2xl bg-success p-5 text-primary-foreground">
        <div className="text-sm opacity-90">Paid in {monthName}</div>
        <div className="font-display text-4xl font-semibold">{zar(paidMonth)}</div>
        <div className="mt-1 text-sm opacity-90">{zar(toCome)} still to come</div>
      </section>
      <div className="mb-5"><Panel title="Gigs from the network (Find Gigs)">
        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Gigs secured</div><div className="mt-1 font-display text-2xl font-semibold">{gigs.length}</div></div>
          <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Money earned</div><div className="mt-1 font-display text-2xl font-semibold text-success">{zar(gigEarned)}</div></div>
        </div>
      </Panel></div>
      <Panel title="Coming from gigs">
        <ul className="divide-y divide-border text-sm">
          {gigs.filter((g) => g.status === "secured" && (g.event_date ?? "") >= new Date().toISOString().slice(0, 10)).sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? "")).map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><div className="font-semibold">{g.title}</div><div className="text-xs text-muted-foreground">{g.role} · {g.event_date}</div></div>
              <div className="text-right"><div className="font-semibold">{zar(Number(g.amount ?? 0))}</div><Badge>Upcoming</Badge></div>
            </li>
          ))}
          {gigs.filter((g) => g.status === "secured" && (g.event_date ?? "") >= new Date().toISOString().slice(0, 10)).length === 0 && <li className="p-4 text-muted-foreground">No gigs booked ahead.</li>}
        </ul>
      </Panel>
      <Panel title="Jobs">
        <ul className="divide-y divide-border text-sm">
          {jobs.length + gigs.length === 0 && <li className="p-4 text-muted-foreground">No earnings yet.</li>}
          {jobs.filter((j) => j.status !== "cancelled").map((j) => {
            const pr = j.productions as { name?: string; client?: string } | null;
            return (
              <li key={j.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><div className="font-semibold">{pr?.name ?? "Production"}</div><div className="text-xs text-muted-foreground">{j.role} · {j.booking_date ?? ""}</div></div>
                <div className="text-right"><div className="font-semibold">{zar(total(j))}</div><Badge>{payLabel(j.status)}</Badge></div>
              </li>
            );
          })}
          {gigs.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><div className="font-semibold">{g.title}</div><div className="text-xs text-muted-foreground">Network gig · {g.role} · {g.event_date ?? ""}</div></div>
              <div className="text-right"><div className="font-semibold">{zar(Number(g.amount ?? 0))}</div><Badge>{g.status === "completed" ? "Paid to crew" : g.status === "secured" ? "Upcoming" : g.status}</Badge></div>
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}

export const Route = createFileRoute("/_authenticated/earnings")({
  head: () => ({ meta: [
    { title: "Earnings · Book a Crew" },
    { name: "description", content: "Your crew earnings from bookings and network gigs." },
    { property: "og:title", content: "Earnings · Book a Crew" },
    { property: "og:description", content: "Your crew earnings from bookings and network gigs." },
  ] }),
  component: EarningsPage,
});
