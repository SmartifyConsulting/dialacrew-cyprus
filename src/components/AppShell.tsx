import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { FrameHeaderControls, useFramePinned } from "@/lib/frame-controls";
import { BarChart3, Briefcase, ChevronDown, Home, Search, Shield, Star, User, type LucideIcon, Wallet, ReceiptText, CalendarDays, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, useRole, useSession } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { PaymentCelebration } from "@/components/PaymentCelebration";
import { useSignedUrl } from "@/lib/site";
import { useCountryLogo } from "@/lib/country-logos";
import { NativePushSession } from "@/components/NativePush";
import { disableNativePush } from "@/lib/native-push";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TrialBanner } from "@/components/TrialAccount";
import { ThemeToggle } from "@/components/ThemeToggle";

const navKeys: Record<string, string> = {
  Dashboard: "dashboard", Home: "home", Calendar: "calendar", Productions: "productions",
  Crew: "crew", Payments: "payments", "Find Gigs": "findGigs", Earnings: "earnings",
  Invoices: "invoices", Profile: "profile", "My Profile": "myProfile", Admin: "admin", "Post a Gig": "postGig", Reports: "reports",
};

function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["nav-avatar", userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name, email, avatar_url, country").eq("id", userId!).maybeSingle();
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

type NavItem = { to: string; label: string; icon: LucideIcon; hash?: string };
// One menu definition per role, used by both the top bar and the phone bottom bar.
export const navByRole: Record<string, NavItem[]> = {
  producer: [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/productions", label: "Productions", icon: Briefcase },
    { to: "/crew", label: "Crew", icon: Search },
    { to: "/inventory", label: "Inventory", icon: Briefcase },
    { to: "/gigs", hash: "post", label: "Post a Gig", icon: Megaphone },
    { to: "/payments", label: "Payments", icon: Wallet },
    { to: "/reports", label: "Reports", icon: BarChart3 },
  ],
  crew: [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/gigs", label: "Gigs", icon: Megaphone },
    { to: "/inventory", label: "Inventory", icon: Briefcase },
    { to: "/earnings", label: "Earnings", icon: Wallet },
    { to: "/invoices", label: "Invoices", icon: ReceiptText },
  ],
  client: [{ to: "/profile", label: "My Profile", icon: User }],
  admin: [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    { to: "/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/productions", label: "Productions", icon: Briefcase },
    { to: "/crew", label: "Crew", icon: Search },
    { to: "/inventory", label: "Inventory", icon: Briefcase },
    { to: "/gigs", hash: "post", label: "Post a Gig", icon: Megaphone },
    { to: "/payments", label: "Payments", icon: Wallet },
    { to: "/reports", label: "Reports", icon: BarChart3 },
    { to: "/admin", label: "Admin", icon: Shield },
  ],
};

function BottomNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-nav text-nav-foreground md:hidden" aria-label="Main menu">
      <ul className="flex">
        {items.map((n) => (
          <li key={n.label} className="flex-1">
            <Link to={n.to} {...(n.hash ? { hash: n.hash } : {})} className={`flex flex-col items-center gap-1 py-5 font-sans text-sm font-medium text-nav-foreground/80`} activeProps={{ className: "!text-nav-foreground font-semibold" }}>
              <n.icon className="h-[1.6rem] w-[1.6rem]" /><span className="max-w-full break-words text-center">{t(`nav.${navKeys[n.label]}`, { defaultValue: n.label })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TopNav() {
  const { t } = useTranslation();
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
    try { await disableNativePush(); } catch { return void window.alert("Could not stop job alerts. Please retry sign out while connected."); }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const navLogo = useCountryLogo("nav", me.data?.country);
  const signedIn = ready && session;
  return (
    <>
      {signedIn && <NativePushSession userId={session.user.id} />}
      {signedIn && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-nav text-nav-foreground md:flex" aria-label="Main menu">
          <Link to="/dashboard" className="flex justify-center px-5 py-5"><img src={navLogo} alt="Book a Crew" className="h-[173px] w-auto max-w-full rounded-lg object-contain" /></Link>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {items.map((n) => (
              <Link key={n.label} to={n.to} {...(n.hash ? { hash: n.hash } : {})} activeOptions={{ includeHash: !!n.hash }} className={`flex items-center gap-3 rounded-xl px-4 py-3 font-sans text-[15px] font-medium text-nav-foreground/85 transition-colors hover:bg-nav-foreground/10 hover:text-nav-foreground`} activeProps={{ className: "bg-nav-foreground/15 !text-nav-foreground font-semibold" }}>
                <n.icon className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{t(`nav.${navKeys[n.label]}`, { defaultValue: n.label })}</span>
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
            <button onClick={signOut} className="mt-3 w-full rounded-xl border border-nav-foreground/30 px-3 py-2 font-sans text-sm font-medium text-nav-foreground hover:bg-nav-foreground/10">{t("common.signOut")}</button>
          </div>
        </aside>
      )}
      {signedIn && (
        <div className="relative z-30 hidden items-center justify-end gap-3 px-6 pt-4 text-foreground md:ml-60 md:flex">
          <ThemeToggle className="border-border bg-card text-foreground shadow-sm" />
          <LanguageSwitcher compact className="border-border bg-card text-foreground shadow-sm" />
          <div className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card shadow-sm"><NotificationBell userId={session.user.id} requireAcknowledgement={role.data === "crew"} /></div>
        </div>
      )}
      <header className={`relative z-30 ${signedIn ? "md:pl-60" : ""}`}>
        <div className={signedIn ? "bg-nav text-nav-foreground md:hidden" : "bg-nav text-nav-foreground"}>
          <div className={`flex items-center gap-4 px-4 py-8 ${signedIn ? "" : "mx-auto max-w-7xl"}`}>
            {signedIn && <Link to="/dashboard" className="shrink-0"><img src={navLogo} alt="Book a Crew" className="h-[7.5rem] w-auto rounded-lg object-contain" /></Link>}
            <div className="ml-auto flex items-center gap-3">
              <ThemeToggle className="border-nav-foreground/30 bg-transparent text-nav-foreground" />
              <LanguageSwitcher compact className="border-nav-foreground/30 bg-transparent text-nav-foreground" />
              {signedIn && <NotificationBell userId={session.user.id} requireAcknowledgement={role.data === "crew"} />}
              {signedIn && <button onClick={signOut} className="rounded-sm border border-nav-foreground/30 px-3 py-1 font-display text-xs font-semibold text-nav-foreground">{t("common.signOut")}</button>}
            </div>
          </div>
        </div>
        {signedIn && <BottomNav items={items.slice(0, 5)} />}
      </header>
      {/* No visual footprint until a payment actually lands — mounted once regardless of header layout. */}
      {signedIn && role.data === "crew" && <PaymentCelebration />}
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

export function Page({ title, subtitle, actions, children, open, compact }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; open?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const titleKey = typeof title === "string" ? navKeys[title] : undefined;
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="md:pl-60">
      <main className={`mx-auto max-w-7xl px-4 pb-36 md:pb-6 ${compact ? "py-4 md:pt-6" : "py-8 md:pt-12"}`}>
        <RoleGate open={open}>
          {!open && <TrialBanner />}
          <div className={`flex flex-wrap items-end justify-between gap-3 border-b border-border ${compact ? "mb-3 pb-2" : "mb-5 pb-4"}`}>
            <div>
              <h1 className={`font-sans font-bold normal-case tracking-tight text-foreground ${compact ? "text-xl md:text-2xl" : "text-3xl md:text-4xl"}`}>{titleKey ? t(`nav.${titleKey}`) : title}</h1>
              {subtitle && <p className={`text-muted-foreground ${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"}`}>{subtitle}</p>}
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
  completed: "bg-black text-white", Completed: "bg-black text-white",
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
  const { t } = useTranslation();
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${tone[children] ?? "bg-muted text-muted-foreground"}`}>{t(`statuses.${children}`, statusLabel[children] ?? children)}</span>;
}

// Fixed palette so each client name always lands on the same color — makes client identity scannable at a glance.
// Deliberately one color per hue family (not red+rose+pink+fuchsia all at once) so neighbors are easy to
// tell apart at a glance, not just technically different. Blue is excluded: it matches the app's primary
// brand color, so a client badge would be mistaken for a primary-styled element (buttons, active status, links).
// Black and purple are also excluded: the calendar reserves those for the Recce Day and Gear check chips
// (see EVENT_CHIP in lib/use-calendar-events.ts), so a client badge in either would be mistaken for one of those.
const CLIENT_COLORS = [
  "bg-orange-500 text-white", "bg-red-700 text-white", "bg-fuchsia-600 text-white", "bg-emerald-600 text-white",
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

export function Panel({ title, children, right, badge, collapsible, defaultCollapsed }: {
  title: ReactNode; children: ReactNode; right?: ReactNode; badge?: ReactNode; collapsible?: boolean; defaultCollapsed?: boolean;
}) {
  const [collapsedState, setCollapsed] = useState(!!collapsible && !!defaultCollapsed);
  const pinnedOpen = useFramePinned();
  const collapsed = collapsedState && !pinnedOpen;
  return (
    <section className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {collapsible && (
            <button type="button" disabled={pinnedOpen} onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand" : "Collapse"} className="shrink-0 text-muted-foreground hover:text-foreground">
              <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
            </button>
          )}
          <h2 className="truncate font-display text-sm font-semibold uppercase tracking-wide text-primary">{title}</h2>
          {badge}
        </div>
        <div className="flex shrink-0 items-center gap-2">{right}<FrameHeaderControls /></div>
      </div>
      {(!collapsible || !collapsed) && children}
    </section>
  );
}
