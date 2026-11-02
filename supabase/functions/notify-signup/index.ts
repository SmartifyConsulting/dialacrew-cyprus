// Emails the team whenever a new user signs up. Called by the `on_auth_user_created_notify`
// Postgres trigger (see drizzle/migrations/0059_notify_new_signup.sql) via pg_net right after a row
// lands in auth.users — not by the client, so it fires for every signup path (password, Google, invite).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_TO = "marios@moi.co.za";
const NOTIFY_FROM = Deno.env.get("SIGNUP_NOTIFY_FROM") || "Book a Crew <onboarding@resend.dev>";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!RESEND_API_KEY) {
    console.error("[notify-signup] RESEND_API_KEY is not set");
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), { status: 500 });
  }

  let body: { email?: string; full_name?: string; role?: string; created_at?: string };
  try { body = await req.json(); } catch { body = {}; }
  const { email, full_name, role, created_at } = body;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: [NOTIFY_TO],
      subject: `New Book a Crew sign-up: ${full_name || email || "unknown"}`,
      html: `
        <p>A new user just signed up.</p>
        <ul>
          <li><b>Name:</b> ${full_name || "—"}</li>
          <li><b>Email:</b> ${email || "—"}</li>
          <li><b>Role:</b> ${role || "—"}</li>
          <li><b>When:</b> ${created_at || new Date().toISOString()}</li>
        </ul>
      `,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[notify-signup] Resend error", res.status, text);
    return new Response(JSON.stringify({ error: text }), { status: 502 });
  }

  return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
