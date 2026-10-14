import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Briefcase, Building2, Home, Search, Shield, Star, User, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";
import logo from "@/assets/bookacrew-sa-logo.png.asset.json";

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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-nav text-nav-foreground md:hidden" aria-label="Main menu">
      <ul className="flex">
        {items.map((n) => (
          <li key={n.label} className="flex-1">
            <Link to={n.to} className="flex flex-col items-center gap-1 py-5 font-sans text-sm font-medium text-nav-foreground/80" activeProps={{ className: "!text-nav-foreground font-semibold" }}>
              <n.icon className="h-8 w-8" />{n.label}
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

  const signedIn = ready && session;
  return (
    <>
      {signedIn && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-nav-foreground/10 bg-nav text-nav-foreground md:flex" aria-label="Main menu">
          <Link to="/dashboard" className="px-5 py-5"><img src={logo.url} alt="Book a Crew" className="h-12 w-auto" /></Link>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {items.map((n) => (
              <Link key={n.label} to={n.to} className="flex items-center gap-3 rounded-xl px-4 py-3 font-sans text-[15px] font-medium text-nav-foreground/85 transition-colors hover:bg-nav-foreground/10 hover:text-nav-foreground" activeProps={{ className: "bg-nav-foreground/15 !text-nav-foreground font-semibold" }}>
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-nav-foreground/10 p-4">
            <p className="mb-2 text-xs font-medium capitalize text-nav-foreground/60">{role.data ? `${role.data} view` : ""}</p>
            <button onClick={signOut} className="w-full rounded-xl border border-nav-foreground/30 px-3 py-2 font-sans text-sm font-medium text-nav-foreground hover:bg-nav-foreground/10">Sign out</button>
          </div>
        </aside>
      )}
      <header className={`sticky top-0 z-30 ${signedIn ? "md:pl-60" : ""}`}>
        <div className={signedIn ? "border-b border-border bg-card md:bg-card" : "bg-nav text-nav-foreground"}>
          <div className={`flex items-center gap-4 px-4 py-8 ${signedIn ? "" : "mx-auto max-w-7xl"}`}>
            <Link to={session ? "/dashboard" : "/"} className={`shrink-0 ${signedIn ? "md:hidden" : ""}`}><img src={logo.url} alt="Book a Crew" className="h-20 w-auto" /></Link>
            <div className="ml-auto flex items-center gap-3">
              {signedIn && (
                <>
                  <NotificationBell userId={session.user.id} />
                  <button onClick={signOut} className="rounded-sm border border-border px-3 py-1 font-display text-xs font-semibold md:hidden">Sign out</button>
                </>
              )}
            </div>
          </div>
        </div>
        {signedIn && <BottomNav items={items} />}
      </header>
    </>
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
        <h2 className="font-display text-3xl font-bold text-primary">You're signed in as {role.data === "crew" ? "crew" : (role.data ?? "a guest")}</h2>
        <p className="mt-3 text-muted-foreground">This area is for producers. Your own job offers and availability will appear here soon.</p>
      </div>
    );
  return <>{children}</>;
}

export function Page({ title, subtitle, actions, children, open }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="md:pl-60">
      <main className="mx-auto max-w-7xl px-4 py-6 pb-36 md:pb-6">
        <RoleGate open={open}>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div>
              <h1 className="font-sans text-3xl font-bold normal-case tracking-tight text-foreground md:text-4xl">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </RoleGate>
      </main>
      </div>
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
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${tone[children] ?? "bg-muted text-muted-foreground"}`}>{children}</span>;
}

export function Panel({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-display text-sm font-semibold text-primary">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
