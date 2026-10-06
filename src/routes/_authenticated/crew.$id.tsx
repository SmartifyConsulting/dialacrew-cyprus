import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Award, Briefcase, Camera, Mail, MapPin, Package, Phone, Plus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Page } from "@/components/AppShell";
import { Avatar } from "@/components/site/SiteTabs";
import { useRole, useSession } from "@/lib/auth";
import { zar } from "@/lib/demo-data";
import { uploadFile, useInvalidate, useReviews } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/crew/$id")({
  head: () => ({
    meta: [
      { title: "Crew profile — Book a Crew" },
      { name: "description", content: "Service provider profile: skills, certifications, projects, kit and reviews." },
      { property: "og:title", content: "Crew profile — Book a Crew" },
      { property: "og:description", content: "Skills, certifications, kit and ratings." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CrewProfile,
});

type Cert = { name: string; issuer: string; date: string };
const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground";
const TABS = ["About", "Certifications", "Projects", "Reviews", "Kit & props"] as const;

function CrewProfile() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const inv = useInvalidate();
  const [tab, setTab] = useState<(typeof TABS)[number]>("About");
  const [editing, setEditing] = useState(false);

  const c = useQuery({
    queryKey: ["crew-profile", id],
    queryFn: async () => { const { data, error } = await supabase.from("crew_members").select("*").eq("id", id).maybeSingle(); if (error) throw error; return data; },
  });
  const jobs = useQuery({
    queryKey: ["crew-jobs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, role, status, days, production_id, productions(name, client, date, status)").eq("crew_id", id);
      if (error) throw error; return data ?? [];
    },
  });
  const assets = useQuery({
    queryKey: ["crew-assets", id],
    queryFn: async () => { const { data, error } = await supabase.from("crew_assets").select("*").eq("crew_id", id).order("name"); if (error) throw error; return data ?? []; },
  });
  const reviews = useReviews(id).data ?? [];

  const m = c.data;
  if (!m) return <Page open title={c.isLoading ? "Loading…" : "Profile not found"}>{null}</Page>;
  const canEdit = role.data === "producer" || m.user_id === session?.user.id;
  const certs = (Array.isArray(m.certifications) ? m.certifications : []) as Cert[];
  const done = (jobs.data ?? []).filter((j) => (j.productions as { status?: string } | null)?.status === "Wrapped").length;
  const refresh = () => inv(["crew-profile", id], ["crew"], ["crew-assets", id], ["crew-assets"]);

  async function update(patch: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("crew_members").update(patch as any).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    refresh(); return true;
  }
  async function photo(file?: File) {
    if (!file) return;
    try { const path = await uploadFile(`crew/${id}`, file, file.name); await update({ photo_url: path }); toast.success("Photo updated"); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Page open title="Profile">
      <div className="mx-auto max-w-3xl rounded-sm border border-border bg-card">
        <div className="p-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar name={m.name} path={m.photo_url} size={88} />
              {canEdit && <label className="absolute bottom-0 right-0 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Change photo"><Camera className="h-3.5 w-3.5" /><input type="file" accept="image/*" hidden onChange={(e) => photo(e.target.files?.[0])} /></label>}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">{m.name}</h2>
              <div className="text-muted-foreground">{m.role} · {m.department}</div>
              <div className="mt-1 flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-primary text-primary" /> <strong>{Number(m.rating).toFixed(1)}</strong> <span className="text-muted-foreground">({reviews.length} reviews)</span></div>
            </div>
            {canEdit && <button onClick={() => setEditing(!editing)} className="ml-auto text-xs uppercase text-primary hover:underline">{editing ? "Close" : "Edit profile"}</button>}
          </div>
          {editing ? <EditForm m={m} onSave={async (patch) => { if (await update(patch)) { toast.success("Profile saved"); setEditing(false); } }} /> : (
            <div className="mt-5 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-3"><Mail className="h-4 w-4" /> {m.email || "No email"}</div>
              <div className="flex items-center gap-3"><Phone className="h-4 w-4" /> {m.phone || "No phone"}</div>
              <div className="flex items-center gap-3"><MapPin className="h-4 w-4" /> {m.location || "No location"}</div>
            </div>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto border-y border-border px-4">
          {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{t}</button>)}
        </nav>

        <div className="p-6">
          {tab === "About" && (
            <div className="space-y-6">
              <section><h3 className="mb-2 flex items-center gap-2 font-semibold"><Award className="h-4 w-4" /> Skills & Expertise</h3>
                {m.skills.length ? <div className="flex flex-wrap gap-2">{m.skills.map((s) => <span key={s} className="rounded-sm bg-primary/15 px-2 py-1 text-xs text-primary">{s}</span>)}</div> : <p className="text-sm text-muted-foreground">No skills added yet</p>}
              </section>
              <section className="border-t border-border pt-5"><h3 className="mb-2 flex items-center gap-2 font-semibold"><Briefcase className="h-4 w-4" /> Experience</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.experience_notes || m.bio || "No experience added yet"}</p>
              </section>
              <section className="grid grid-cols-3 gap-4 border-t border-border pt-5">
                {[[String(done), "Projects completed"], [String(m.team_led), "Team members led"], [`${m.safety_record}%`, "Safety record"]].map(([v, l]) => (
                  <div key={l}><div className="font-display text-3xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
                ))}
              </section>
            </div>
          )}
          {tab === "Certifications" && <Certifications certs={certs} canEdit={canEdit} onChange={(next) => update({ certifications: next })} />}
          {tab === "Projects" && (
            <ul className="divide-y divide-border">
              {(jobs.data ?? []).length === 0 && <li className="py-3 text-sm text-muted-foreground">No projects yet.</li>}
              {(jobs.data ?? []).map((j) => {
                const pr = j.productions as { name: string; client: string; date: string | null; status: string } | null;
                return (
                  <li key={j.id} className="flex items-center justify-between py-3">
                    <div><Link to="/productions/$id" params={{ id: j.production_id }} className="font-semibold hover:text-primary">{pr?.name}</Link><div className="text-xs text-muted-foreground">{j.role} · {pr?.client} · {pr?.date}</div></div>
                    <span className="text-xs uppercase text-muted-foreground">{pr?.status}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {tab === "Reviews" && (
            <ul className="space-y-4">
              {reviews.length === 0 && <li className="text-sm text-muted-foreground">No reviews yet. Producers can rate crew from a production's Overview tab after the job.</li>}
              {reviews.map((r) => (
                <li key={r.id} className="border-b border-border pb-3">
                  <div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}<span className="ml-2 text-xs text-muted-foreground">{r.reviewer_name} · {new Date(r.created_at).toLocaleDateString("en-ZA")}</span></div>
                  {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
          {tab === "Kit & props" && <Kit crewId={id} items={assets.data ?? []} canEdit={canEdit} onChange={refresh} />}
        </div>
      </div>
    </Page>
  );
}

function EditForm({ m, onSave }: { m: { name: string; role: string; department: string; email: string; phone: string; location: string; bio: string; skills: string[]; experience_notes: string; team_led: number; safety_record: number }; onSave: (p: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ ...m, skills: m.skills.join(", ") });
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="block"><span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <input type={type} className={`${input} mt-1 w-full`} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {field("name", "Name")}{field("role", "Role")}{field("department", "Department")}{field("location", "Location")}
      {field("email", "Email", "email")}{field("phone", "Phone", "tel")}
      <div className="sm:col-span-2">{field("skills", "Skills (comma separated)")}</div>
      <label className="block sm:col-span-2"><span className="text-xs uppercase tracking-wider text-muted-foreground">Experience</span>
        <textarea rows={4} className={`${input} mt-1 w-full`} value={f.experience_notes} onChange={(e) => setF({ ...f, experience_notes: e.target.value })} /></label>
      {field("team_led", "Team members led", "number")}{field("safety_record", "Safety record %", "number")}
      <div className="sm:col-span-2"><button className={btn} onClick={() => onSave({
        name: f.name, role: f.role, department: f.department, location: f.location, email: f.email, phone: f.phone,
        experience_notes: f.experience_notes, team_led: Number(f.team_led) || 0, safety_record: Math.min(100, Math.max(0, Number(f.safety_record) || 0)),
        skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
      })}>Save profile</button></div>
    </div>
  );
}

function Certifications({ certs, canEdit, onChange }: { certs: Cert[]; canEdit: boolean; onChange: (c: Cert[]) => void }) {
  const [n, setN] = useState<Cert>({ name: "", issuer: "", date: "" });
  return (
    <div className="space-y-3">
      {certs.length === 0 && <p className="text-sm text-muted-foreground">No certifications added yet</p>}
      {certs.map((c, i) => (
        <div key={i} className="flex items-center justify-between rounded-sm border border-border p-3">
          <div><div className="font-semibold">{c.name}</div><div className="text-xs text-muted-foreground">{c.issuer} · {c.date}</div></div>
          {canEdit && <button aria-label="Remove" onClick={() => onChange(certs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} placeholder="Certification" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <input className={input} placeholder="Issued by" value={n.issuer} onChange={(e) => setN({ ...n, issuer: e.target.value })} />
          <input type="date" className={input} value={n.date} onChange={(e) => setN({ ...n, date: e.target.value })} />
          <button className={btn} onClick={() => { if (n.name.trim()) { onChange([...certs, n]); setN({ name: "", issuer: "", date: "" }); } }}><Plus className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

function Kit({ crewId, items, canEdit, onChange }: { crewId: string; items: { id: string; name: string; category: string; daily_fee: number }[]; canEdit: boolean; onChange: () => void }) {
  const [n, setN] = useState({ name: "", category: "Equipment", fee: "" });
  async function add() {
    if (!n.name.trim()) return;
    const { error } = await supabase.from("crew_assets").insert({ crew_id: crewId, name: n.name.trim(), category: n.category, daily_fee: Number(n.fee) || 0 });
    if (error) return toast.error(error.message);
    setN({ name: "", category: "Equipment", fee: "" }); onChange();
  }
  async function remove(id: string) { const { error } = await supabase.from("crew_assets").delete().eq("id", id); if (error) toast.error(error.message); onChange(); }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Equipment and props this provider can bring. Dial a Crew selects items per job and the fees are added to the provider's total.</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">No kit or props captured yet.</p>}
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-sm border border-border p-3">
          <Package className="h-4 w-4 text-primary" /><span className="flex-1 text-sm">{a.name} <span className="text-xs text-muted-foreground">· {a.category}</span></span>
          <span className="text-sm">{zar(Number(a.daily_fee))}/day</span>
          {canEdit && <button aria-label="Remove" onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} placeholder="Item (e.g. ARRI Alexa Mini)" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <select className={input} value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })}>{["Equipment", "Prop", "Vehicle", "Lighting", "Sound", "Wardrobe"].map((c) => <option key={c}>{c}</option>)}</select>
          <input type="number" className={`${input} w-32`} placeholder="Fee / day (R)" value={n.fee} onChange={(e) => setN({ ...n, fee: e.target.value })} />
          <button className={btn} onClick={add}>Add</button>
        </div>
      )}
    </div>
  );
}
