import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Briefcase, Building2, Home, Search, Shield, Star, User, type LucideIcon, Wallet, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, useRole, useSession } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { useSignedUrl } from "@/lib/site";
import logo from "@/assets/bookacrew-sa-logo.png.asset.json";

function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["nav-avatar", userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name, email, avatar_url").eq("id", userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function NavAvatar({ name, path, size = 40 }: { name: string; path?: string | null; size?: number }) {
  const url = useSignedUrl(path).data;
  return url
    ? <img src={url} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-full border-2 border-white object-cover" />
    : <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full border-2 border-white bg-primary text-sm font-bold text-primary-foreground">{initials(name)}</span>;
}

type NavItem = { to: string; label: string; icon: LucideIcon };
// One menu definition per role, used by both the top bar and the phone bottom bar.
export const navByRole: Record<string, NavItem[]> = {
  producer: [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/productions", label: "Productions", icon: Briefcase },
    { to: "/crew", label: "Crew", icon: Search },
    { to: "/payments", label: "Payments", icon: Wallet },
  ],
  crew: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/gigs", label: "Find Gigs", icon: Search },
    { to: "/earnings", label: "Earnings", icon: Wallet },
    { to: "/profile", label: "Profile", icon: User },
    { to: "/reviews", label: "Reviews", icon: Star },
  ],
  client: [{ to: "/profile", label: "My Profile", icon: User }],
  admin: [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/productions", label: "Productions", icon: Briefcase },
    { to: "/crew", label: "Crew", icon: Search },
    { to: "/payments", label: "Payments", icon: Wallet },
    { to: "/profile", label: "Profile", icon: Building2 },
    { to: "/admin", label: "Admin", icon: Shield },
  ],
};

function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-nav text-nav-foreground md:hidden" aria-label="Main menu">
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
  const me = useMyProfile(session?.user.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const company = useCompany(session?.user.id);
  const companyName = company.data?.companies?.name;
  const baseItems = navByRole[role.data ?? "client"] ?? navByRole["client"]!;
  const isTeam = role.data === "producer" || role.data === "admin";
  const items = baseItems.map((n) => (isTeam && n.to === "/profile" && companyName ? { ...n, label: `${companyName} Settings` } : n));

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
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-nav text-nav-foreground md:flex" aria-label="Main menu">
          <Link to="/dashboard" className="flex justify-center px-5 py-5"><img src={logo.url} alt="Book a Crew" className="h-[157px] w-auto" /></Link>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {items.map((n) => (
              <Link key={n.label} to={n.to} className="flex items-center gap-3 rounded-xl px-4 py-3 font-sans text-[15px] font-medium text-nav-foreground/85 transition-colors hover:bg-nav-foreground/10 hover:text-nav-foreground" activeProps={{ className: "bg-nav-foreground/15 !text-nav-foreground font-semibold" }}>
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            ))}
          </nav>
          <div className="p-4">
            <Link to="/profile" className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-nav-foreground/10">
              <NavAvatar name={me.data?.full_name || me.data?.email || "?"} path={me.data?.avatar_url ?? null} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-nav-foreground">{me.data?.full_name || me.data?.email || "Your account"}</p>
                <p className="truncate text-xs font-medium capitalize text-nav-foreground/60">{role.data ? `${role.data}` : ""}</p>
              </div>
            </Link>
            <button onClick={signOut} className="mt-3 w-full rounded-xl border border-nav-foreground/30 px-3 py-2 font-sans text-sm font-medium text-nav-foreground hover:bg-nav-foreground/10">Sign out</button>
          </div>
        </aside>
      )}
      <header className={`sticky top-0 z-30 ${signedIn ? "md:pl-60" : ""}`}>
        <div className={signedIn ? "bg-nav text-nav-foreground md:hidden" : "bg-nav text-nav-foreground"}>
          <div className={`flex items-center gap-4 px-4 py-8 ${signedIn ? "" : "mx-auto max-w-7xl"}`}>
            {signedIn && <Link to="/dashboard" className="shrink-0"><img src={logo.url} alt="Book a Crew" className="h-20 w-auto" /></Link>}
            <div className="ml-auto flex items-center gap-3">
              {signedIn && <button onClick={signOut} className="rounded-sm border border-nav-foreground/30 px-3 py-1 font-display text-xs font-semibold text-nav-foreground">Sign out</button>}
            </div>
          </div>
        </div>
        {signedIn && <BottomNav items={items.slice(0, 5)} />}
      </header>
      {/* A single bell, pinned to the grey canvas (not a white header bar) at every breakpoint. */}
      {signedIn && (
        <div className="fixed right-4 top-4 z-30 md:right-6">
          <NotificationBell userId={session.user.id} />
        </div>
      )}
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

export function Page({ title, subtitle, actions, children, open }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="md:pl-60">
      <main className="mx-auto max-w-7xl px-4 py-8 pb-36 md:pb-6 md:pt-12">
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
  pencil: "bg-primary/20 text-primary",
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

// Friendly display text for raw status values shown verbatim in some tables — the tone lookup above
// still keys off the raw value, this only changes what's printed.
const statusLabel: Record<string, string> = {
  awaiting_crew_confirmation: "Pending confirmation",
  pencil: "Confirmed",
};

export function Badge({ children }: { children: string }) {
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${tone[children] ?? "bg-muted text-muted-foreground"}`}>{statusLabel[children] ?? children}</span>;
}

// Fixed palette so each client name always lands on the same color — makes client identity scannable at a glance.
// Deliberately one color per hue family (not red+rose+pink+fuchsia all at once) so neighbors are easy to
// tell apart at a glance, not just technically different. Blue is excluded: it matches the app's primary
// brand color, so a client badge would be mistaken for a primary-styled element (buttons, active status, links).
const CLIENT_COLORS = [
  "bg-orange-500 text-white", "bg-red-700 text-white", "bg-fuchsia-600 text-white", "bg-violet-600 text-white",
  "bg-indigo-600 text-white", "bg-cyan-700 text-white", "bg-amber-700 text-white", "bg-stone-600 text-white",
];

// Every client name seen anywhere in the app is registered here up front (alphabetically), so the same
// name always gets the same color on every screen and every reload — not just within one page's render
// order. A name not yet registered falls back to a hash, then gets registered at that slot.
const clientColorAssignments = new Map<string, string>();
let nextSlot = 0;

function registerClient(name: string) {
  if (clientColorAssignments.has(name)) return;
  clientColorAssignments.set(name, CLIENT_COLORS[nextSlot % CLIENT_COLORS.length]!);
  nextSlot++;
}

// Known clients, kept alphabetical — add a new client's name here so it gets a stable, unique color
// everywhere instead of relying on a hash (which can collide or drift if the palette changes).
["Atlas Pictures", "Coastline Tourism", "Kinetic Bank", "Savanna Drinks Co.", "Urban Beat Records", "Velvet Studio"]
  .sort()
  .forEach(registerClient);

export function clientColor(name: string) {
  const existing = clientColorAssignments.get(name);
  if (existing) return existing;
  // Unregistered client (added after this list was last updated): hash into the palette so it's at
  // least consistent for itself, and register it so every other screen now agrees too.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const color = CLIENT_COLORS[h % CLIENT_COLORS.length]!;
  clientColorAssignments.set(name, color);
  return color;
}

export function ClientBadge({ name }: { name: string }) {
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${clientColor(name)}`}>{name}</span>;
}

export function Panel({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-primary">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
