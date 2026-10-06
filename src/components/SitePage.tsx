import type { ReactNode } from "react";
import { TopNav } from "@/components/AppShell";

/** Public Dial a Crew page frame: yellow menu, charcoal body, yellow footer band. */
export function SitePage({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16">
        {title && <h1 className="text-center font-script text-6xl text-foreground md:text-8xl">{title}</h1>}
        {children}
      </main>
      <div className="h-20 bg-primary" />
    </div>
  );
}
