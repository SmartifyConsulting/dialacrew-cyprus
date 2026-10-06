import { createFileRoute, Link } from "@tanstack/react-router";
import { TopNav } from "@/components/AppShell";
import logo from "@/assets/bookacrew-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Book a Crew — Book crew direct, run your production" },
      { name: "description", content: "Find, pencil and book professional film and commercial crew directly. Budgets, attendance and payments in one place." },
      { property: "og:title", content: "Book a Crew — Book crew direct" },
      { property: "og:description", content: "Production and crew management for producers, crew and clients." },
    ],
  }),
  component: Index,
});

const services = ["Directors", "Director of Photography", "1st AC", "Gaffers", "Sparks", "Grips", "Art Department", "Wardrobe", "Make Up Artists", "Sound", "DIT", "Data Wranglers", "Line Producers", "Assistant Directors", "Casting", "Location Scouts", "Stills Photographers", "Editors", "Colourists", "VFX Supervisors"];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <section className="relative overflow-hidden bg-sidebar">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_30%,var(--muted)_0,transparent_40%),radial-gradient(circle_at_80%_70%,var(--secondary)_0,transparent_45%)]" />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 py-16 text-center">
          <img src={logo.url} alt="Book a Crew" className="w-72 md:w-96" />
          <p className="mt-6 max-w-xl font-display text-xl uppercase tracking-[0.25em] text-muted-foreground">Producers book crew direct</p>
          <Link to="/dashboard" className="mt-8 rounded-sm bg-primary px-8 py-3 font-display text-sm font-semibold uppercase tracking-widest text-primary-foreground hover:opacity-90">
            Open producer dashboard
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h2 className="font-script text-6xl text-primary">Our Story</h2>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          Crew shouldn't depend on agents to get work, and producers shouldn't run 50-person shoots from spreadsheets and WhatsApp.
          Book a Crew connects producers directly with professional crew — with control over selection, rates, availability, budgets,
          bookings, attendance and payment, all in one record of the production.
        </p>
      </section>

      <section className="bg-primary py-16 text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center font-script text-6xl">Service offering</h2>
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {services.map((s) => (
              <div key={s} className="border-b border-primary-foreground/30 pb-2 font-display text-sm font-semibold uppercase tracking-wider">{s}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-px bg-border px-0 md:grid-cols-3">
        {[
          ["Producers", "Break down a brief, pencil and confirm crew, approve overtime and track every rand."],
          ["Crew", "Get offers directly, manage availability and get paid promptly for days worked."],
          ["Clients", "See the production and your quote — never the producer's internal crew rates."],
        ].map(([t, d]) => (
          <div key={t} className="bg-background p-10 text-center">
            <h3 className="font-script text-4xl text-primary">{t}</h3>
            <p className="mt-3 text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-xs uppercase tracking-widest text-muted-foreground">© 2026 Book a Crew</footer>
    </div>
  );
}
