import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import logo from "@/assets/bookacrew-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";

const nav = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/productions", label: "Productions" },
  { to: "/crew", label: "Crew" },
  { to: "/profile", label: "My profile" },
] as const;

export function TopNav() {
  const { session, ready } = useSession();
  const role = useRole(session?.user.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-2">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-background p-1">
            <img src={logo.url} alt="Book a Crew" className="h-full w-full object-contain" />
          </span>
        </Link>
        <nav className="flex flex-1 justify-center gap-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="border-y border-primary-foreground/40 px-4 py-2 font-display text-sm uppercase tracking-wider hover:bg-primary-foreground/10"
              activeProps={{ className: "bg-primary-foreground text-primary" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {ready && session ? (
            <>
              <NotificationBell userId={session.user.id} />
              <span className="hidden text-xs font-semibold uppercase tracking-widest md:block">{role.data ? `${role.data} view` : ""}</span>
              <button onClick={signOut} className="rounded-sm border border-primary-foreground/50 px-3 py-1.5 font-display text-xs uppercase tracking-widest hover:bg-primary-foreground/10">Sign out</button>
            </>
          ) : ready ? (
            <Link to="/auth" className="rounded-sm bg-primary-foreground px-3 py-1.5 font-display text-xs uppercase tracking-widest text-primary">Sign in</Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function RoleGate({ children, open }: { children: ReactNode; open?: boolean }) {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  if (!session || role.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (role.data !== "producer" && !open)
    return (
      <div className="rounded-sm border border-border bg-card p-8 text-center">
        <h2 className="font-script text-4xl text-primary">You're signed in as {role.data === "crew" ? "crew" : "a client"}</h2>
        <p className="mt-3 text-muted-foreground">This area is for producers. Your own {role.data === "crew" ? "job offers and availability" : "productions and quotes"} will appear here soon.</p>
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
  Confirmed: "bg-success/20 text-success",
  "On set": "bg-success/20 text-success",
  Active: "bg-success/20 text-success",
  Pencil: "bg-primary/20 text-primary",
  Upcoming: "bg-primary/20 text-primary",
  Pending: "bg-chart-3/20 text-chart-3",
  Late: "bg-primary/20 text-primary",
  Declined: "bg-destructive/20 text-destructive",
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
