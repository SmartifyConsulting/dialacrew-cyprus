import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Page } from "@/components/AppShell";
import { zar } from "@/lib/demo-data";
import { useCrew, useTogglePencil } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/crew/")({
  head: () => ({
    meta: [
      { title: "Crew Directory — Book a Crew" },
      { name: "description", content: "Search professional film and commercial crew by role, department, location and availability." },
      { property: "og:title", content: "Crew Directory — Book a Crew" },
      { property: "og:description", content: "Find and pencil the right crew directly." },
    ],
  }),
  component: CrewPage,
});

function CrewPage() {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [availOnly, setAvailOnly] = useState(false);
  const crew = useCrew().data ?? [];
  const toggle = useTogglePencil();
  const departments = ["All", ...Array.from(new Set(crew.map((c) => c.department)))];
  const list = useMemo(() => crew.filter((c) =>
    (dept === "All" || c.department === dept) && (!availOnly || c.available) &&
    `${c.name} ${c.role} ${c.location}`.toLowerCase().includes(q.toLowerCase())), [crew, q, dept, availOnly]);

  return (
    <Page title="Crew" subtitle={`${crew.length} professionals · rates shown are internal and never visible to clients`}>
      <div className="mb-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, location…" className="min-w-64 flex-1 rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-sm border border-input bg-card px-3 py-2 text-sm">
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={availOnly} onChange={(e) => setAvailOnly(e.target.checked)} className="accent-primary" /> Available only</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const p = c.pencilled;
          return (
            <div key={c.id} className="rounded-sm border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary font-display text-lg font-bold text-primary-foreground">
                  {c.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="flex-1">
                  <Link to="/crew/$id" params={{ id: c.id }} className="font-semibold hover:text-primary hover:underline">{c.name}</Link>
                  <div className="text-sm text-primary">{c.role}</div>
                  <div className="text-xs text-muted-foreground">{c.department} · {c.location} · {c.experience} yrs</div>
                </div>
                <span className={`text-xs font-semibold uppercase ${c.available ? "text-success" : "text-destructive"}`}>{c.available ? "Available" : "Booked"}</span>
              </div>
              {c.kit && <div className="mt-3 text-xs text-muted-foreground">Kit: {c.kit}</div>}
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div className="text-sm"><span className="font-display text-lg font-semibold">{zar(c.dayRate)}</span><span className="text-muted-foreground"> /day · ★ {c.rating}</span></div>
                <button
                  onClick={() => toggle.mutate({ id: c.id, pencilled: !p })}
                  className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${p ? "border border-primary text-primary" : "bg-primary text-primary-foreground"}`}>
                  {p ? "Pencilled ✓" : "Pencil"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}
