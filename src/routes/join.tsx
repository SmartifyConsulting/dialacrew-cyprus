import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { SitePage } from "@/components/SitePage";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "JOIN | dialacrew" },
      { name: "description", content: "Join Dial a Crew — film and video crew in Cyprus." },
      { property: "og:title", content: "Join Dial a Crew" },
      { property: "og:description", content: "Apply to join the Dial a Crew books." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Join,
});

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(255),
  job_description: z.string().trim().max(200),
  phone: z.string().trim().max(40),
  message: z.string().trim().max(2000),
});

const field = "w-full border border-primary bg-transparent px-2 py-1.5 text-foreground placeholder:text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

function Join() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("website")) return; // honeypot
    const parsed = schema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setState("sending");
    const { error } = await supabase.from("join_requests" as never).insert(parsed.data as never);
    setState(error ? "error" : "sent");
  }

  return (
    <SitePage title="Join Dial a Crew">
      {state === "sent" ? (
        <p className="mt-12 text-center text-xl text-foreground">Thanks for submitting!</p>
      ) : (
        <form onSubmit={submit} noValidate className="mx-auto mt-12 max-w-[890px] space-y-3">
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <input name="name" placeholder="Name *" className={field} />
          {errors["name"] && <p className="text-sm text-destructive">{errors["name"]}</p>}
          <input name="email" type="email" placeholder="Email *" className={field} />
          {errors["email"] && <p className="text-sm text-destructive">{errors["email"]}</p>}
          <input name="job_description" placeholder="Job Description" className={field} />
          <input name="phone" type="tel" placeholder="Phone" className={field} />
          <textarea name="message" placeholder="Message" rows={5} className={field} />
          {state === "error" && <p className="text-sm text-destructive">Something went wrong — please try again.</p>}
          <div className="text-center">
            <button disabled={state === "sending"} className="-mt-6 w-[150px] bg-primary py-4 font-script text-xl text-primary-foreground hover:opacity-90 disabled:opacity-60">
              Send
            </button>
          </div>
        </form>
      )}
    </SitePage>
  );
}
