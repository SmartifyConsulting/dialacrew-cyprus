import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const S = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props });
const str = { type: "string" };
const strs = { type: "array", items: str };

async function assertProducer(db: SupabaseClient, userId: string) {
  const [p, a] = await Promise.all([
    db.rpc("has_role", { _user_id: userId, _role: "producer" }),
    db.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!p.data && !a.data) throw new Error("Only producers can use the MemoryBank.");
}

const MEMORY_SCHEMA = S({
  summary: str,
  style_preferences: strs,
  trusted_crew: { type: "array", items: S({ name: str, reason: str }) },
  avoid: strs,
  risks: strs,
  budget_tendencies: str,
});

// Rebuilds a client's memory from every retrospective, crew rating and booking on its productions.
async function rebuildMemory(db: SupabaseClient, client: string) {
  const { data: prods } = await db.from("productions").select("id, name, type, days, budget, location, summary, status").eq("client", client);
  const ids = (prods ?? []).map((p) => p.id);
  if (!ids.length) return null;
  const [retros, reviews, bookings, crew] = await Promise.all([
    db.from("production_retrospectives").select("production_id, form, lessons").in("production_id", ids),
    db.from("crew_reviews").select("crew_id, production_id, rating, comment").in("production_id", ids),
    db.from("bookings").select("crew_id, production_id, role, status").in("production_id", ids),
    db.from("crew_members").select("id, name, role"),
  ]);
  const names = Object.fromEntries((crew.data ?? []).map((c) => [c.id, `${c.name} (${c.role})`]));
  const sources = (retros.data?.length ?? 0) + (reviews.data?.length ?? 0);
  const input = JSON.stringify({
    client,
    productions: prods,
    retrospectives: retros.data ?? [],
    crew_ratings: (reviews.data ?? []).map((r) => ({ ...r, crew: names[r.crew_id] })),
    bookings: (bookings.data ?? []).map((b) => ({ ...b, crew: names[b.crew_id] })),
  });
  const mem = await aiJson<Record<string, unknown> & { summary: string }>({
    name: "company_memory",
    schema: MEMORY_SCHEMA,
    instructions:
      "You maintain the MemoryBank for one production client. From their past productions, the human post-shoot retrospectives and the human crew ratings, infer their preferences, styles and choices. Weight human ratings and retrospective notes most heavily; recent and repeated signals beat one-offs. trusted_crew = people rated 4-5 or praised; avoid = people/vendors rated <=2 or tagged Do Not Rehire. Be concise and factual; never invent facts not in the data. summary: 2-3 sentences.",
    input,
  });
  await db.from("company_memory").upsert({ client, summary: mem.summary, profile: mem, sources, updated_at: new Date().toISOString() });
  return mem;
}

async function aiJson<T>(o: Parameters<typeof import("./ai.server").aiJson>[0]) {
  const { aiJson: run } = await import("./ai.server");
  return run<T>(o);
}

export const refreshMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ client: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await assertProducer(db, context.userId);
    const mem = await rebuildMemory(db, data.client);
    return { ok: !!mem };
  });

const retroForm = z.object({
  type: z.string().max(40), shootDays: z.number().min(0).max(1000), crewSize: z.string().max(10), locationsCount: z.number().min(0).max(500),
  budgetPlanned: z.number().min(0), budgetActual: z.number().min(0),
  otPlanned: z.number().min(0), otActual: z.number().min(0),
  postPlanned: z.number().min(0), postActual: z.number().min(0),
  deltaCause: z.string().max(60),
  ratings: z.record(z.string().max(60), z.number().min(1).max(5)),
  rootTags: z.record(z.string().max(60), z.array(z.string().max(40)).max(10)),
  locations: z.array(z.object({ name: z.string().max(120), tags: z.array(z.string().max(40)).max(10) })).max(10),
  vendors: z.array(z.object({ name: z.string().max(120), tags: z.array(z.string().max(40)).max(10) })).max(10),
  win: z.string().max(280), risk: z.string().max(280), warning: z.string().max(280),
});
export type RetroForm = z.infer<typeof retroForm>;

export const saveRetrospective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1).max(100), form: retroForm }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await assertProducer(db, context.userId);
    const { data: p } = await db.from("productions").select("id, name, client").eq("id", data.productionId).single();
    if (!p) throw new Error("Production not found.");
    const out = await aiJson<{ lessons_learned_alert: string; payload: Record<string, string | string[]> }>({
      name: "retro_memory",
      schema: S({
        lessons_learned_alert: str,
        payload: S({ project_type: str, variance_summary: str, friction_hotspots: strs, location_insights: strs, vendor_insights: strs, future_warnings: strs }),
      }),
      instructions: "Turn this post-shoot retrospective into memory for future production planning. lessons_learned_alert: 1-3 punchy sentences a producer should read before a similar shoot. payload: structured, terse, factual, from the data only.",
      input: JSON.stringify({ production: p.name, client: p.client, ...data.form }),
    });
    const { error } = await db.from("production_retrospectives").upsert(
      { production_id: p.id, client: p.client, form: data.form, lessons: out.lessons_learned_alert, memory: out.payload, updated_at: new Date().toISOString() },
      { onConflict: "production_id" },
    );
    if (error) throw new Error(error.message);
    await rebuildMemory(db, p.client);
    return { lessons: out.lessons_learned_alert, payload: out.payload };
  });

export type MatchResult = {
  analysis: string;
  memory_insights: string[];
  warnings: string[];
  crew: { crew_id: string; name: string; suggested_role: string; why: string }[];
  kit: { asset_id: string; name: string; owner: string; why: string }[];
};

export const matchBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ client: z.string().max(200), brief: z.string().min(10).max(4000), days: z.number().min(1).max(365), location: z.string().max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await assertProducer(db, context.userId);
    const [crew, assets, mem] = await Promise.all([
      db.from("crew_members").select("id, name, role, department, skills, bio, experience, experience_notes, location, day_rate, rating, available"),
      db.from("crew_assets").select("id, crew_id, name, category, daily_fee"),
      data.client ? db.from("company_memory").select("summary, profile").eq("client", data.client).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const crewList = crew.data ?? [];
    const names = Object.fromEntries(crewList.map((c) => [c.id, c.name]));
    const result = await aiJson<MatchResult>({
      name: "brief_match",
      schema: S({
        analysis: str, memory_insights: strs, warnings: strs,
        crew: { type: "array", items: S({ crew_id: str, name: str, suggested_role: str, why: str }) },
        kit: { type: "array", items: S({ asset_id: str, name: str, owner: str, why: str }) },
      }),
      instructions:
        "You are a production planner. Recommend crew and kit for the brief ONLY from the provided roster and kit lists (use their exact ids). Prefer available crew, strong ratings and matching skills. Use the client's MemoryBank (if any) to honour their known preferences, favour their trusted crew, avoid people they flagged, and raise their known risks; cite it in memory_insights. Keep 'why' to one sentence. analysis: 2-3 sentences. Pick a sensible crew size for the brief.",
      input: JSON.stringify({
        brief: data.brief, client: data.client, shoot_days: data.days, location: data.location,
        memory_bank: mem.data ?? null,
        roster: crewList,
        kit: (assets.data ?? []).map((a) => ({ ...a, owner: names[a.crew_id] })),
      }),
    });
    const crewIds = new Set(crewList.map((c) => c.id));
    const assetIds = new Set((assets.data ?? []).map((a) => a.id));
    result.crew = result.crew.filter((c) => crewIds.has(c.crew_id));
    result.kit = result.kit.filter((k) => assetIds.has(k.asset_id));
    await db.from("brief_matches").insert({ client: data.client, brief: data.brief, result });
    return result;
  });
