// Role-based rating rubrics. Each framework has four category groups; every criterion is scored 1–5.
export type FrameworkId = "cast" | "creative" | "crew";
export type Category = { name: string; criteria: string[] };
export type Framework = { id: FrameworkId; name: string; blurb: string; categories: Category[] };

export const FRAMEWORKS: Record<FrameworkId, Framework> = {
  cast: {
    id: "cast", name: "Cast & Performers", blurb: "On-camera and on-stage talent",
    categories: [
      { name: "Professionalism & Reliability", criteria: ["Punctuality & Call Time Compliance", "Line & Material Readiness", "Attendance & Consistency", "Equipment & Costume Discipline"] },
      { name: "Performance Quality & Execution", criteria: ["Artistic Delivery & Consistency", "Directability & Adaptability"] },
      { name: "Collaboration & Team Player", criteria: ["Ensemble Synergy", "Egoless Collaboration", "Set Awareness & Etiquette", "Community Culture"] },
      { name: "Proactivity & Engagement", criteria: ["Creative Contribution", "The Extra Mile"] },
    ],
  },
  creative: {
    id: "creative", name: "Creative Artists", blurb: "Designers, directors, choreographers, writers",
    categories: [
      { name: "Professionalism & Reliability", criteria: ["Deadline & Delivery Precision", "Budgetary & Scope Discipline", "Contractual Follow-Through"] },
      { name: "Technical Skill & Execution", criteria: ["Vision Translation", "Technical Troubleshooting"] },
      { name: "Collaboration & Team Player", criteria: ["Interdepartmental Alignment", "Collaborative Flexibility", "Mentorship & Accessibility", "Shared Success Mindset"] },
      { name: "Proactivity & Engagement", criteria: ["Conceptual Leadership", "The Extra Mile"] },
    ],
  },
  crew: {
    id: "crew", name: "Crew & Technical Staff", blurb: "Camera, sound, grip, electric, stagehands",
    categories: [
      { name: "Professionalism & Reliability", criteria: ["Call Time & Shift Compliance", "Gear & Kit Readiness", "Safety & Protocol Adherence", "Accountability & Trust"] },
      { name: "Technical Skill & Execution", criteria: ["Discipline Proficiency", "Speed & Efficiency", "Asset Maintenance"] },
      { name: "Collaboration & Team Player", criteria: ["Cross-Department Collaboration", "Communication Clarity", "Egoless Support", "Unifying Presence"] },
      { name: "Proactivity & Engagement", criteria: ["Preventative Troubleshooting", "The Extra Mile"] },
    ],
  },
};

const has = (s: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}`, "i").test(s));

/** Best rubric for a member's role/department, or null when it's ambiguous and the reviewer must choose. */
export function inferFramework(role: string | null | undefined, department?: string | null): FrameworkId | null {
  const s = `${role ?? ""} ${department ?? ""}`;
  if (has(s, ["director of photography", "dop", "dp\\b", "assistant director", "1st ad", "2nd ad", "camera", "focus", "gaffer", "grip", "electric", "spark", "sound", "boom", "stagehand", "lighting", "rigger", "runner", "driver", "technician", "operator", "dit", "loader"])) return "crew";
  if (has(s, ["actor", "actress", "cast", "performer", "talent", "dancer", "singer", "presenter", "host", "model", "extra", "stunt", "voice"])) return "cast";
  if (has(s, ["director", "designer", "choreographer", "writer", "screenwriter", "composer", "art director", "creative"])) return "creative";
  return null;
}

export type Scores = Record<string, number>;
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Category averages and an overall score from rated criteria only; null = not rated. */
export function summarize(fw: FrameworkId, scores: Scores) {
  const categories = FRAMEWORKS[fw].categories.map((c) => {
    const vals = c.criteria.map((k) => scores[k]).filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5);
    return { name: c.name, score: avg(vals), rated: vals.length, total: c.criteria.length };
  });
  const all = FRAMEWORKS[fw].categories.flatMap((c) => c.criteria).map((k) => scores[k]).filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5);
  return { categories, overall: avg(all), rated: all.length, total: FRAMEWORKS[fw].categories.reduce((n, c) => n + c.criteria.length, 0) };
}

export const WORK_AGAIN = [{ v: "yes", label: "Yes" }, { v: "maybe", label: "Maybe" }, { v: "no", label: "No" }] as const;
export type WorkAgain = (typeof WORK_AGAIN)[number]["v"];
