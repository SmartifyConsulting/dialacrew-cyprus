import { createFileRoute } from "@tanstack/react-router";
import { SitePage } from "@/components/SitePage";
import rates from "@/content/rates.json";

export const Route = createFileRoute("/rates")({
  head: () => ({
    meta: [
      { title: "RATES | dialacrew" },
      { name: "description", content: "Guideline daily and weekly crew rates by department." },
      { property: "og:title", content: "Crew Rates — Dial a Crew" },
      { property: "og:description", content: "Guideline daily and weekly crew rates by department." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Rates,
});

function Rates() {
  return (
    <SitePage>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-foreground">
          <thead>
            <tr className="font-display uppercase tracking-wider text-primary">
              <th className="py-2">As at April 2018</th>
              <th colSpan={2} className="text-center">Daily Rates</th>
              <th colSpan={2} className="text-center">Weekly Rates<div className="text-xs normal-case text-muted-foreground">(based on a 6 day week)</div></th>
            </tr>
            <tr className="border-b border-primary/60 font-semibold">
              <th className="py-2">Designation</th><th>Minimum</th><th>Maximum</th><th>Minimum</th><th>Maximum</th>
            </tr>
          </thead>
          <tbody>
            {rates.groups.map((g) => (
              <>
                <tr key={g.dept}><td colSpan={5} className="pt-6 pb-2 font-display text-base font-semibold uppercase tracking-widest text-primary">{g.dept}</td></tr>
                {g.rows.map((r) => (
                  <tr key={g.dept + r[0]} className="border-b border-border">
                    {r.map((c, i) => <td key={i} className={`py-1.5 ${i ? "whitespace-nowrap pr-4" : "pr-4"}`}>{c}</td>)}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-10 font-display text-lg font-semibold uppercase tracking-widest text-primary">NOTES:</h2>
      {rates.notes.map((n) => <p key={n} className="mt-3 text-foreground">{n}</p>)}
    </SitePage>
  );
}
