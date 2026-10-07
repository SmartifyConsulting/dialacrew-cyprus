import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";

// Signed-in production tools, per the actual workflow each role uses.
// The public marketing menu (Home, About, Services, Gallery, Rates, Contact) is intentionally hidden.
const navByRole = {
  producer: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/productions", label: "Productions" },
    { to: "/crew", label: "Find Crew" },
    { to: "/memory", label: "AI MemoryBank" },
    { to: "/profile", label: "My company" },
  ],
  crew: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/profile", label: "My Profile" },
    { to: "/profile", label: "Find Gigs", tab: "gigs" },
    { to: "/profile", label: "Kit", tab: "kit" },
  ],
  client: [
    { to: "/profile", label: "My Profile" },
  ],
  admin: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/productions", label: "Productions" },
    { to: "/crew", label: "Find Crew" },
    { to: "/memory", label: "AI MemoryBank" },
    { to: "/admin", label: "Admin" },
    { to: "/profile", label: "My Profile" },
  ],
} as const;

export function TopNav() {
  const { session, ready } = useSession();
  const role = useRole(session?.user.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = (navByRole[(role.data ?? "client") as keyof typeof navByRole] ?? navByRole.client) as readonly { to: string; label: string; tab?: string }[];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-30">
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link to={session ? "/dashboard" : "/"} className="font-script text-3xl leading-none">Book a Crew</Link>
          <div className="ml-auto flex items-center gap-3">
            {ready && session && (
              <>
                <NotificationBell userId={session.user.id} />
                <span className="hidden text-xs font-semibold uppercase tracking-widest md:block">{role.data ? `${role.data} view` : ""}</span>
                <button onClick={signOut} className="rounded-sm border border-primary-foreground/60 px-3 py-1 font-display text-xs uppercase tracking-widest hover:bg-primary-foreground/10">Sign out</button>
              </>
            )}
          </div>
        </div>
      </div>
      {ready && session && (
        <div className="border-b border-border bg-sidebar">
          <div className="mx-auto max-w-7xl px-4 py-1.5">
            <button className="font-display text-xs uppercase tracking-widest text-muted-foreground md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
              {open ? "Close menu" : "Menu"}
            </button>
            <nav className={`${open ? "flex" : "hidden"} flex-col gap-1 pt-1 md:flex md:flex-row md:flex-wrap md:pt-0`}>
              {items.map((n) => (
                <Link key={n.label} to={n.to} search={n.tab ? { tab: n.tab } : {}} activeOptions={{ includeSearch: true }} onClick={() => setOpen(false)} className="rounded-sm px-3 py-1 font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

function RoleGate({ children, open }: { children: ReactNode; open?: boolean | undefined }) {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  if (!session || role.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const isManager = role.data === "producer" || (role.data as string) === "admin";
  if (!isManager && !open)
    return (
      <div className="rounded-sm border border-border bg-card p-8 text-center">
        <h2 className="font-script text-4xl text-primary">You're signed in as {role.data === "crew" ? "crew" : (role.data ?? "a guest")}</h2>
        <p className="mt-3 text-muted-foreground">This area is for producers. Your own job offers and availability will appear here soon.</p>
      </div>
    );
  return <>{children}</>;
}

export function Page({ title, subtitle, actions, children, open }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <RoleGate open={open}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div>
              <h1 className="font-script text-5xl text-primary">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </RoleGate>
      </main>
    </div>
  );
}

const tone: Record<string, string> = {
  Confirmed: "bg-success/20 text-success", confirmed: "bg-success/20 text-success",
  "On set": "bg-success/20 text-success",
  Active: "bg-success/20 text-success",
  Pencil: "bg-primary/20 text-primary", pencil: "bg-primary/20 text-primary",
  Upcoming: "bg-primary/20 text-primary",
  Pending: "bg-chart-3/20 text-chart-3",
  awaiting_crew_confirmation: "bg-chart-3/20 text-chart-3",
  in_progress: "bg-success/20 text-success",
  awaiting_review: "bg-chart-3/20 text-chart-3",
  payment_released: "bg-success/20 text-success",
  completed: "bg-muted text-muted-foreground",
  disputed: "bg-destructive/20 text-destructive",
  draft: "bg-muted text-muted-foreground",
  Late: "bg-primary/20 text-primary",
  Declined: "bg-destructive/20 text-destructive", cancelled: "bg-destructive/20 text-destructive",
  "Not arrived": "bg-destructive/20 text-destructive",
  Wrapped: "bg-muted text-muted-foreground",
};

export function Badge({ children }: { children: string }) {
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${tone[children] ?? "bg-muted text-muted-foreground"}`}>{children}</span>;
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-primary">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
