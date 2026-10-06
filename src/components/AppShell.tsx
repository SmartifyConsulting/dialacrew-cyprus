import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";

// Public Dial a Crew menu — exact labels and order from the original site.
const siteNav = [
  { label: "HOME", to: "/", hash: undefined },
  { label: "ABOUT", to: "/", hash: "about" },
  { label: "SERVICES", to: "/", hash: "services" },
  { label: "BOOK", to: "/book", hash: undefined },
  { label: "GALLERY", to: "/", hash: "gallery" },
  { label: "RATES", to: "/rates", hash: undefined },
  { label: "CONTACT", to: "/", hash: "contact" },
] as const;

// Signed-in production tools, per the actual workflow each role uses.
const navByRole = {
  producer: [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/productions", label: "Productions" },
    { to: "/crew", label: "Find Crew" },
    { to: "/memory", label: "AI MemoryBank" },
    { to: "/profile", label: "My company" },
  ],
  crew: [
    { to: "/profile", label: "My Profile" },
    { to: "/crew", label: "Directory" },
  ],
  client: [
    { to: "/profile", label: "My Profile" },
  ],
  admin: [
    { to: "/admin", label: "Admin" },
    { to: "/memory", label: "AI MemoryBank" },
    { to: "/profile", label: "My Profile" },
  ],
} as const;

export function TopNav() {
  const { session, ready } = useSession();
  const role = useRole(session?.user.id);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-30">
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4">
          <button className="font-display text-sm uppercase tracking-wider lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? "Close" : "Menu"}
          </button>
          <nav className={`${open ? "flex" : "hidden"} absolute left-0 right-0 top-full flex-col bg-primary px-4 pb-4 lg:static lg:flex lg:flex-1 lg:flex-row lg:justify-center lg:gap-[10px] lg:p-0`}>
            {siteNav.map((n) => (
              <Link
                key={n.label}
                to={n.to}
                {...(n.hash ? { hash: n.hash } : {})}
                onClick={() => setOpen(false)}
                activeOptions={{ exact: true, includeHash: true }}
                className="border-y border-primary-foreground/80 py-3 text-center font-sans text-[15px] font-light uppercase text-primary-foreground/80 hover:text-primary-foreground lg:w-[70px]"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 lg:ml-0">
            {ready && !session && (
              <Link to="/auth" className="rounded-sm bg-primary-foreground px-3 py-1.5 font-display text-xs uppercase tracking-widest text-primary">Sign in</Link>
            )}
          </div>
        </div>
      </div>
      {ready && session && (
        <div className="border-b border-border bg-sidebar">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-1.5">
            {(navByRole[role.data ?? "client"] ?? navByRole.client).map((n) => (
              <Link key={n.to} to={n.to} className="rounded-sm px-3 py-1 font-display text-xs uppercase tracking-widest text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>
                {n.label}
              </Link>
            ))}
            <div className="ml-auto flex items-center gap-3">
              <NotificationBell userId={session.user.id} />
              <span className="hidden text-xs font-semibold uppercase tracking-widest text-muted-foreground md:block">{role.data ? `${role.data} view` : ""}</span>
              <button onClick={signOut} className="rounded-sm border border-border px-3 py-1 font-display text-xs uppercase tracking-widest text-foreground hover:text-primary">Sign out</button>
            </div>
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
