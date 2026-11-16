import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_HOST = /(^|\.)bookacrew\.(film|lovable\.app)$|\.lovable\.app$|^localhost(:\d+)?$/;

/** Sends a branded reset email through Resend. Always reports success so emails can't be probed. */
export const sendPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().trim().email().max(255), origin: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    const origin = new URL(data.origin);
    if (!ALLOWED_HOST.test(origin.host)) throw new Error("Invalid origin.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendBrandedEmail } = await import("@/lib/email/resend.server");
    const { authEmails } = await import("@/lib/email/brand");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email.toLowerCase(),
      options: { redirectTo: `${origin.origin}/reset-password` },
    });
    if (error || !link?.properties?.action_link) return { ok: true }; // unknown email: stay silent
    await sendBrandedEmail({
      to: data.email,
      content: { ...authEmails['recovery']!, action: { label: "Reset password", url: link.properties.action_link } },
      eventId: `recovery:${link.user?.id ?? "u"}:${Date.now()}`,
    });
    return { ok: true };
  });
