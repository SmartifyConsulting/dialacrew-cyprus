import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { Page } from "@/components/AppShell";
import { useSession } from "@/lib/auth";
import { zar } from "@/lib/demo-data";
import { useCreatePencil, useCrewSearch, useDepartments, useFavourites, useProductions, useToggleFavourite } from "@/lib/db";

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

const PAGE_SIZE = 24;

function CrewPage() {
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [availOnly, setAvailOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [pencilling, setPencilling] = useState<{ id: string; name: string; role: string; dayRate: number } | null>(null);
  const [open, setOpen] = useState<NonNullable<ReturnType<typeof useCrewSearch>["data"]>["rows"][number] | null>(null);
  const departments = useDepartments().data ?? ["All"];
  const favourites = useFavourites(session?.user.id);
  const toggleFav = useToggleFavourite();
  const search = useCrewSearch({ q, department: dept, availableOnly: availOnly, favouritesOnly: favOnly, favouriteIds: favourites.data, page });
  const list = search.data?.rows ?? [];
  const total = search.data?.total ?? 0;

  useEffect(() => { setPage(0); }, [q, dept, availOnly, favOnly]);

  async function toggleFavourite(id: string) {
    const on = !(favourites.data ?? []).includes(id);
    try { await toggleFav.mutateAsync({ crewId: id, on }); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Page title="Crew" subtitle={`${total} professional${total === 1 ? "" : "s"} · rates shown are internal and never visible to clients`}>
      <div className="mb-4 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, location…" className="min-w-64 flex-1 rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-sm border border-input bg-card px-3 py-2 text-sm">
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={availOnly} onChange={(e) => setAvailOnly(e.target.checked)} className="accent-primary" /> Available only</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} className="accent-primary" /> Favourites only</label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const isFav = (favourites.data ?? []).includes(c.id);
          return (
            <div key={c.id} role="button" tabIndex={0} onClick={() => setOpen(c)} onKeyDown={(e) => e.key === "Enter" && setOpen(c)}
              className="cursor-pointer rounded-xl border border-border bg-card p-4 shadow-sm transition hover:border-primary">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-lg font-bold text-primary">
                  {c.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="text-sm text-primary">{c.role}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.department} · {c.location} · {c.experience} yrs</div>
                </div>
                <button aria-label={isFav ? "Remove favourite" : "Add favourite"} onClick={(e) => { e.stopPropagation(); toggleFavourite(c.id); }}>
                  <Heart className={`h-5 w-5 ${isFav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.available ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{c.available ? "● Available" : "● Booked"}</span>
                <span className="text-xs text-muted-foreground">★ {c.rating}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div className="text-sm"><span className="font-display text-lg font-semibold">{zar(c.dayRate)}</span><span className="text-muted-foreground"> /day</span></div>
                <button onClick={(e) => { e.stopPropagation(); setPencilling({ id: c.id, name: c.name, role: c.role, dayRate: c.dayRate }); }}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Pencil</button>
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-foreground/30" onClick={() => setOpen(null)}>
          <aside className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-card p-6 shadow-xl animate-in slide-in-from-right" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(null)} className="float-right text-sm text-muted-foreground">Close ✕</button>
            <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 font-display text-2xl font-bold text-primary">{open.name.split(" ").map((n) => n[0]).join("")}</div>
            <h2 className="mt-3 font-display text-2xl font-semibold">{open.name}</h2>
            <div className="text-primary">{open.role}</div>
            <div className="mt-1 text-sm text-muted-foreground">{open.department} · {open.location}</div>
            <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${open.available ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{open.available ? "Available" : "Booked"}</span>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[["Day rate", zar(open.dayRate)], ["Rating", `★ ${open.rating}`], ["Experience", `${open.experience} yrs`]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-muted p-3"><dt className="text-[11px] text-muted-foreground">{l}</dt><dd className="mt-1 font-semibold">{v}</dd></div>
              ))}
            </dl>
            {open.kit && <div className="mt-5"><div className="text-xs font-semibold text-muted-foreground">Kit</div><p className="mt-1 text-sm">{open.kit}</p></div>}
            <div className="mt-6 flex gap-2">
              <button onClick={() => { setPencilling({ id: open.id, name: open.name, role: open.role, dayRate: open.dayRate }); setOpen(null); }} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Pencil</button>
              <Link to="/crew/$id" params={{ id: open.id }} className="flex-1 rounded-md border border-border px-4 py-2 text-center text-sm font-semibold">Full profile</Link>
            </div>
          </aside>
        </div>
      )}
      {list.length === 0 && !search.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">No crew match these filters.</p>}
      {total > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-sm border border-border px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span className="text-muted-foreground">Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="rounded-sm border border-border px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      )}
      {pencilling && <PencilDialog crew={pencilling} onClose={() => setPencilling(null)} />}
    </Page>
  );
}

function PencilDialog({ crew, onClose }: { crew: { id: string; name: string; role: string; dayRate: number }; onClose: () => void }) {
  const productions = useProductions().data ?? [];
  const create = useCreatePencil();
  const active = productions.filter((p) => p.status !== "Wrapped");
  const [f, setF] = useState({ productionId: active[0]?.id ?? "", role: crew.role, date: active[0]?.date ?? "", callTime: "", wrapTime: "", days: 1, priority: 1 as 1 | 2 });
  const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

  async function submit() {
    if (!f.productionId || !f.date) { toast.error("Pick a production and date"); return; }
    try {
      await create.mutateAsync({
        productionId: f.productionId, crewId: crew.id, role: f.role, bookingDate: f.date,
        callTime: f.callTime, wrapTime: f.wrapTime, crewRate: crew.dayRate, clientCharge: crew.dayRate, days: f.days, priority: f.priority,
      });
      toast.success(`${f.priority === 1 ? "1st" : "2nd"} pencil sent to ${crew.name} — expires in 3 days unless confirmed`);
      onClose();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-script text-3xl text-primary">Pencil {crew.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Expires automatically after 3 days unless the crew member confirms.</p>
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((n) => (
              <button key={n} type="button" onClick={() => setF({ ...f, priority: n })}
                className={`rounded-md border px-3 py-2 text-left text-sm ${f.priority === n ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                <span className="block font-semibold">{n === 1 ? "1st pencil" : "2nd pencil"}</span>
                <span className="text-xs text-muted-foreground">{n === 1 ? "First choice, they're on hold for you" : "Backup if your first choice falls through"}</span>
              </button>
            ))}
          </div>
          <label className="block"><span className="text-xs text-muted-foreground">Production</span>
            <select className={`${field} mt-1`} value={f.productionId} onChange={(e) => { const p = active.find((x) => x.id === e.target.value); setF({ ...f, productionId: e.target.value, date: p?.date ?? f.date }); }}>
              {active.length === 0 && <option value="">No open productions</option>}
              {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs text-muted-foreground">Role on this job</span>
            <input className={`${field} mt-1`} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-xs text-muted-foreground">Date</span>
              <input type="date" className={`${field} mt-1`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-muted-foreground">Call time</span>
              <input type="time" className={`${field} mt-1`} value={f.callTime} onChange={(e) => setF({ ...f, callTime: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-muted-foreground">Wrap time</span>
              <input type="time" className={`${field} mt-1`} value={f.wrapTime} onChange={(e) => setF({ ...f, wrapTime: e.target.value })} /></label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-muted-foreground">Cancel</button>
          <button disabled={create.isPending} onClick={submit} className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
            {create.isPending ? "Sending…" : "Send pencil"}
          </button>
        </div>
      </div>
    </div>
  );
}
