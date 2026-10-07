import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Briefcase, Building2, Home, Search, Shield, Star, User, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";

type NavItem = { to: string; label: string; icon: LucideIcon };
// One menu definition per role, used by both the top bar and the phone bottom bar.
export const navByRole: Record<string, NavItem[]> = {
  producer: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/crew", label: "Find Crew", icon: Search },
    { to: "/productions", label: "Projects", icon: Briefcase },
    { to: "/profile", label: "My Company", icon: Building2 },
  ],
  crew: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/gigs", label: "Find Gigs", icon: Search },
    { to: "/reviews", label: "Reviews", icon: Star },
    { to: "/profile", label: "My Profile", icon: User },
  ],
  client: [{ to: "/profile", label: "My Profile", icon: User }],
  admin: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/crew", label: "Find Crew", icon: Search },
    { to: "/productions", label: "Projects", icon: Briefcase },
    { to: "/profile", label: "My Company", icon: Building2 },
    { to: "/admin", label: "Admin", icon: Shield },
  ],
};

function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar md:hidden" aria-label="Main menu">
      <ul className="flex">
        {items.map((n) => (
          <li key={n.label} className="flex-1">
            <Link to={n.to} className="flex flex-col items-center gap-0.5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" activeProps={{ className: "text-primary" }}>
              <n.icon className="h-5 w-5" />{n.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TopNav() {
  const { session, ready } = useSession();
  const role = useRole(session?.user.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const items = navByRole[role.data ?? "client"] ?? navByRole["client"]!;

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
        <div className="hidden border-b border-border bg-sidebar md:block">
          <nav className="mx-auto flex max-w-7xl flex-wrap gap-1 px-4 py-1.5">
            {items.map((n) => (
              <Link key={n.label} to={n.to} className="rounded-sm px-3 py-1 font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
      {ready && session && <BottomNav items={items} />}
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
  Draft: "bg-chart-3/20 text-chart-3",
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
