import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Heart, Trash2, Users } from "lucide-react";
import { Page } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { zar } from "@/lib/demo-data";
import { useTranslation } from "react-i18next";
import { useCreateCrewGroup, useCreatePencil, useCrewSearch, useDeleteCrewGroup, useCrewGroups, useDepartments, useFavourites, useProductions, useProductionTypes, useToggleFavourite } from "@/lib/db";

function monthMatrix(year: number, month: number) {
  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(startDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function AvailabilityCalendar({ crewId }: { crewId: string }) {
  const { t, i18n } = useTranslation();
  const blocked = useQuery({
    queryKey: ["crew-availability", crewId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("booking_date, days, status").eq("crew_id", crewId).neq("status", "cancelled");
      if (error) throw error;
      const set = new Set<string>();
      for (const b of data ?? []) {
        if (!b.booking_date) continue;
        const start = new Date(`${b.booking_date}T00:00:00`);
        for (let i = 0; i < Math.max(1, b.days || 1); i++) {
          const d = new Date(start);
          d.setDate(d.getDate() + i);
          set.add(d.toISOString().slice(0, 10));
        }
      }
      return set;
    },
  }).data ?? new Set<string>();

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("directory.availability")}</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-muted" /> {t("directory.available")}</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-destructive/60" /> {t("payments.stage.Booked")}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {months.map(({ year, month }) => (
          <div key={`${year}-${month}`} className="rounded-sm border border-border p-2">
            <div className="mb-1 text-center text-xs font-semibold">{new Date(year, month, 1).toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}</div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-muted-foreground">
              {Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 7 + index).toLocaleDateString(i18n.language, { weekday: "narrow" })).map((day, index) => <div key={index}>{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {monthMatrix(year, month).map((day, i) => {
                if (day == null) return <div key={i} />;
                const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isBlocked = blocked.has(iso);
                return (
                  <div key={i} title={isBlocked ? `Booked ${iso}` : iso}
                    className={`grid aspect-square place-items-center rounded-sm text-[9px] ${isBlocked ? "bg-destructive/60 text-destructive-foreground" : "bg-muted/50 text-foreground"} ${iso === todayIso ? "ring-1 ring-primary" : ""}`}>
                    {day}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/crew/")({
  head: () => ({
    meta: [
      { title: "Crew Directory — Book a Crew" },
      { name: "description", content: "Search professional film and commercial crew by role, department, location and availability." },
      { property: "og:title", content: "Crew Directory — Book a Crew" },
      { property: "og:description", content: "Find and pencil the right crew directly." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CrewPage,
});

const PAGE_SIZE = 24;

function CrewPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isProducer = role.data === "producer" || (role.data as string) === "admin";
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("All");
  const [availOnly, setAvailOnly] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [pencilling, setPencilling] = useState<{ id: string; name: string; role: string; dayRate: number } | null>(null);
  const [open, setOpen] = useState<NonNullable<ReturnType<typeof useCrewSearch>["data"]>["rows"][number] | null>(null);
  const [mixOpen, setMixOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [mixName, setMixName] = useState("");
  const [mixType, setMixType] = useState("");
  const productionTypes = useProductionTypes().data ?? [];
  const departments = useDepartments().data ?? ["All"];
  const favourites = useFavourites(session?.user.id);
  const toggleFav = useToggleFavourite();
  const groups = useCrewGroups();
  const createGroup = useCreateCrewGroup();
  const deleteGroup = useDeleteCrewGroup();
  const search = useCrewSearch({ q, department: dept, availableOnly: availOnly, favouritesOnly: favOnly, favouriteIds: favourites.data, page });
  const list = search.data?.rows ?? [];
  const total = search.data?.total ?? 0;

  useEffect(() => { setPage(0); }, [q, dept, availOnly, favOnly]);

  async function toggleFavourite(id: string) {
    const on = !(favourites.data ?? []).includes(id);
    try { await toggleFav.mutateAsync({ crewId: id, on }); } catch (e) { toast.error(friendlyError(e)); }
  }

  function startPicking() { setPicking(true); setPicked([]); setMixName(""); setMixType(""); setMixOpen(false); }
  function cancelPicking() { setPicking(false); setPicked([]); setMixName(""); setMixType(""); }
  async function saveMix() {
    if (!mixName.trim()) { toast.error("Name this combo"); return; }
    if (picked.length < 2) { toast.error("Pick at least two crew members"); return; }
    try {
      await createGroup.mutateAsync({ name: mixName.trim(), crewIds: picked, productionType: mixType || null });
      toast.success(`"${mixName.trim()}" saved — pick it from Crew Combos next time you're crewing a job`);
      cancelPicking();
    } catch (e) { toast.error(friendlyError(e)); }
  }

  return (
    <Page title={t("nav.crew")} subtitle={t("directory.subtitle", { count: total })}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("directory.search")} className="min-w-64 flex-1 rounded-sm border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring" />
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-sm border border-input bg-card px-3 py-2 text-sm">
          {departments.map((d) => <option key={d} value={d}>{d === "All" ? t("directory.all") : t(`roles.${d}`, d)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={availOnly} onChange={(e) => setAvailOnly(e.target.checked)} className="accent-primary" /> {t("directory.availableOnly")}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} className="accent-primary" /> {t("directory.favouritesOnly")}</label>
        {isProducer && !picking && (
          <div className="relative ml-auto">
            <button onClick={() => setMixOpen(!mixOpen)} className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-2 text-sm font-semibold hover:border-primary" aria-label="Crew Combos">
              <Users className="h-4 w-4" /> {t("directory.combos")}
            </button>
            {mixOpen && (
              <div className="absolute right-0 z-20 mt-1 w-72 rounded-sm border border-border bg-card shadow-md">
                <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                  {(groups.data ?? []).length === 0 && <li className="p-3 text-xs text-muted-foreground">{t("directory.noCombos")}</li>}
                  {(groups.data ?? []).map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{g.name} <span className="text-xs text-muted-foreground">({g.memberIds.length}){g.productionType ? ` · ${g.productionType}` : ""}</span></span>
                      <button onClick={() => deleteGroup.mutate(g.id)} className="shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Delete ${g.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
                <button onClick={startPicking} className="block w-full border-t border-border px-3 py-2 text-left text-xs font-semibold text-primary hover:underline">+ {t("directory.createCombo")}</button>
              </div>
            )}
          </div>
        )}
        {picking && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{picked.length} selected</span>
            <input value={mixName} onChange={(e) => setMixName(e.target.value)} placeholder="Name this combo" className="rounded-sm border border-input bg-card px-2 py-1.5 text-sm" />
            <select value={mixType} onChange={(e) => setMixType(e.target.value)} className="rounded-sm border border-input bg-card px-2 py-1.5 text-sm" aria-label="Production type this combo is for">
              <option value="">{t("directory.anyType")}</option>
              {productionTypes.map((type) => <option key={type} value={type}>{t(`productionTypes.${type}`, type)}</option>)}
            </select>
            <button onClick={saveMix} disabled={createGroup.isPending} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">{createGroup.isPending ? "Saving…" : "Save mix"}</button>
            <button onClick={cancelPicking} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const isFav = (favourites.data ?? []).includes(c.id);
          const isPicked = picked.includes(c.id);
          return (
            <div key={c.id} role="button" tabIndex={0}
              onClick={() => picking ? setPicked((s) => isPicked ? s.filter((x) => x !== c.id) : [...s, c.id]) : setOpen(c)}
              onKeyDown={(e) => e.key === "Enter" && (picking ? setPicked((s) => isPicked ? s.filter((x) => x !== c.id) : [...s, c.id]) : setOpen(c))}
              className={`cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition ${picking ? (isPicked ? "border-primary bg-primary/5" : "border-border hover:border-primary") : "border-border hover:border-primary"}`}>
              <div className="flex items-start gap-3">
                {picking && <input type="checkbox" checked={isPicked} onChange={() => {}} className="mt-1 h-4 w-4 accent-primary" />}
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-lg font-bold text-primary">
                  {c.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="text-sm text-primary">{c.role}</div>
                  <div className="truncate text-xs text-muted-foreground">{c.department} · {c.location} · {c.experience} yrs</div>
                </div>
                {!picking && (
                  <button aria-label={isFav ? "Remove favourite" : "Add favourite"} onClick={(e) => { e.stopPropagation(); toggleFavourite(c.id); }}>
                    <Heart className={`h-5 w-5 ${isFav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.available ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>● {t(c.available ? "directory.available" : "payments.stage.Booked")}</span>
                <span className="text-xs text-muted-foreground">★ {c.rating}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div className="text-sm"><span className="font-display text-lg font-semibold">{zar(c.dayRate)}</span><span className="text-muted-foreground"> /day</span></div>
                {!picking && (
                  <button onClick={(e) => { e.stopPropagation(); setPencilling({ id: c.id, name: c.name, role: c.role, dayRate: c.dayRate }); }}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{t("directory.pencil")}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-foreground/30" onClick={() => setOpen(null)}>
          <aside className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-card p-6 shadow-xl animate-in slide-in-from-right" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setOpen(null)} className="float-right text-sm text-muted-foreground">{t("common.close")} ✕</button>
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
            {open.kit && <div className="mt-5"><div className="text-xs font-semibold text-muted-foreground">Equipment</div><p className="mt-1 text-sm">{open.kit}</p></div>}
            <div className="mt-6 flex gap-2">
              <button onClick={() => { setPencilling({ id: open.id, name: open.name, role: open.role, dayRate: open.dayRate }); setOpen(null); }} className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Pencil</button>
              <Link to="/crew/$id" params={{ id: open.id }} className="flex-1 rounded-md border border-border px-4 py-2 text-center text-sm font-semibold">{t("directory.fullProfile")}</Link>
            </div>
            <AvailabilityCalendar crewId={open.id} />
          </aside>
        </div>
      )}
      {list.length === 0 && !search.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">{t("directory.empty")}</p>}
      {total > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-center gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-sm border border-border px-3 py-1.5 disabled:opacity-40">{t("directory.previous")}</button>
          <span className="text-muted-foreground">{t("directory.page", { current: page + 1, total: Math.ceil(total / PAGE_SIZE) })}</span>
          <button disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)} className="rounded-sm border border-border px-3 py-1.5 disabled:opacity-40">{t("directory.next")}</button>
        </div>
      )}
      {pencilling && <PencilDialog crew={pencilling} onClose={() => setPencilling(null)} />}
    </Page>
  );
}

function PencilDialog({ crew, onClose }: { crew: { id: string; name: string; role: string; dayRate: number }; onClose: () => void }) {
  const { t } = useTranslation();
  const productions = useProductions().data ?? [];
  const create = useCreatePencil();
  const active = productions.filter((p) => p.status !== "Wrapped");
  const [f, setF] = useState({ productionId: active[0]?.id ?? "", role: crew.role, date: active[0]?.date ?? "", callTime: "", wrapTime: "", days: 1, priority: 1 as 1 | 2 });
  const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

  async function submit() {
    if (!f.productionId || !f.date) { toast.error(t("pencilDialog.required")); return; }
    try {
      await create.mutateAsync({
        productionId: f.productionId, crewId: crew.id, role: f.role, bookingDate: f.date,
        callTime: f.callTime, wrapTime: f.wrapTime, crewRate: crew.dayRate, clientCharge: crew.dayRate, days: f.days, priority: f.priority,
      });
      toast.success(t("pencilDialog.sent", { priority: f.priority, name: crew.name }));
      onClose();
    } catch (e) { toast.error(friendlyError(e)); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-script text-3xl text-primary">{t("pencilDialog.title", { name: crew.name })}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("pencilDialog.expiry")}</p>
        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            {([1, 2] as const).map((n) => (
              <button key={n} type="button" onClick={() => setF({ ...f, priority: n })}
                className={`rounded-md border px-3 py-2 text-left text-sm ${f.priority === n ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                <span className="block font-semibold">{t("pencilDialog.priority", { priority: n })}</span>
                <span className="text-xs text-muted-foreground">{t(n === 1 ? "pencilDialog.first" : "pencilDialog.backup")}</span>
              </button>
            ))}
          </div>
          <label className="block"><span className="text-xs text-muted-foreground">{t("productionList.columns.Production")}</span>
            <select className={`${field} mt-1`} value={f.productionId} onChange={(e) => { const p = active.find((x) => x.id === e.target.value); setF({ ...f, productionId: e.target.value, date: p?.date ?? f.date }); }}>
              {active.length === 0 && <option value="">{t("pencilDialog.noProductions")}</option>}
              {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs text-muted-foreground">{t("pencilDialog.role")}</span>
            <input className={`${field} mt-1`} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-xs text-muted-foreground">{t("productionList.columns.Date")}</span>
              <input type="date" className={`${field} mt-1`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-muted-foreground">{t("pencilDialog.call")}</span>
              <input type="time" className={`${field} mt-1`} value={f.callTime} onChange={(e) => setF({ ...f, callTime: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-muted-foreground">{t("pencilDialog.wrap")}</span>
              <input type="time" className={`${field} mt-1`} value={f.wrapTime} onChange={(e) => setF({ ...f, wrapTime: e.target.value })} /></label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-muted-foreground">{t("common.cancel")}</button>
          <button disabled={create.isPending} onClick={submit} className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
            {create.isPending ? t("recovery.sending") : t("pencilDialog.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
