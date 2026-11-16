# Book a Crew email rollout

Prepared 16 November 2026. **Not activated or live-delivery verified.**

**Required provider: Resend for every email, including authentication.** Georgia explicitly rejected splitting authentication onto Lovable Emails. Do not enable Lovable's built-in email delivery as a substitute or fallback. This records the target, not the current hosted auth configuration.

Sender selected by Georgia: **Book a Crew <noreply@bookacrew.film>**. No reply-to mailbox supplied; the footer says not to reply. The Resend dashboard shows bookacrew.film verified. Lovable Secrets lists RESEND_API_KEY; its value was not read.

## Ready in source

- Shared responsive HTML and plain text presentation: black header, blue accent/action, white card, grey background. Text branding stays readable when external images are blocked.
- Six authentication templates: confirmation, invite, recovery, magic link, email change, reauthentication. Seven account-security notification templates are also prepared, without enabling previously disabled notification types.
- Preserves the auth provider's ConfirmationURL and Token placeholders. No new token generation or alternative authentication flow.
- Server-only Resend transport with sender above, stable event idempotency keys, HTTPS links, escaping, timeout and safe provider errors. This is a prepared internal helper, **not connected to application events** and not exposed as a public send endpoint.
- Generate the HTML/text and Supabase configuration payload with `node scripts/preview-emails.mjs`. Never deploy that payload without checking supported configuration keys and backing up the existing templates.

## Activation required

1. Configure the existing auth provider's custom SMTP: host smtp.resend.com, port 465, username resend, password from the existing Resend API key, sender noreply@bookacrew.film, name Book a Crew. The key must be entered through secure settings, never chat, source control or a public client variable.
2. Apply the corresponding subjects/HTML from auth-templates.json through the provider's supported template controls. Preserve existing signup, confirmation, secure-change, expiry and redirect policies. Leave link tracking disabled for auth email links.
3. Verify password recovery and an invitation using only the isolated QA account before general activation. A Resend accepted response is not proof of inbox delivery.
4. Any new booking, inventory, task, payment or marketing emails require an agreed recipient/event policy and authorized integration with retries. Existing in-app notifications are not automatically emails.

Lovable More → Emails currently shows an Enable screen; More → Users → Settings → Email exposes sign-in policy/rate limits but no SMTP/template controls. Those controls were inspected without changing settings. Do not use the AI builder to configure this. A supported auth SMTP/template configuration surface is still needed; a GitHub push cannot change those hosted settings.

Supabase documents a Send Email hook as another way to replace its built-in delivery with Resend while keeping provider-managed authentication. A hook must be enabled in the hosted auth service, authenticate its requests, and handle secure email-change delivery correctly. Its availability/configuration for this Lovable Cloud project has not been established. Do not replace the auth flows with browser-generated tokens or silently weaken confirmation rules to work around this limitation.

### Support request draft (not sent)

Project: d42b3a01-4a4e-4c1d-b4f3-31f55ff96cf6, MOI - Book a Crew.

We use Lovable Cloud and require every authentication email to be delivered through our own Resend account, from Book a Crew <noreply@bookacrew.film>. The domain is verified in Resend and RESEND_API_KEY is already stored in project Secrets. We do not have a separate Supabase dashboard. Please identify or enable a supported way to configure Resend custom SMTP or a signed Send Email hook for this project's managed authentication, including branded templates. Preserve existing confirmation, secure email-change, token expiry and redirect policies. We need password recovery, invitations, confirmations, magic links, email changes and reauthentication routed through Resend, plus any enabled auth security notifications. We do not authorize switching to Lovable's email provider, an AI build, or consuming AI build credits. Please do not request the API key by email or support chat; it must stay in secure configuration.

## Verification

Focused transport/rendering tests cover escaped dynamic text, unsafe URL rejection, preserved auth placeholders, HTML/plaintext parity, sender, stable retry key and provider error redaction. Local browser preview checked; Outlook/Gmail inbox rendering and actual Resend/auth delivery remain unverified.

Primary references:
- https://resend.com/docs/send-with-supabase-smtp
- https://resend.com/docs/api-reference/emails/send-email
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- https://docs.lovable.dev/features/custom-emails.md
