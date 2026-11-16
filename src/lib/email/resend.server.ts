import { renderEmail, type EmailContent } from './brand';

/** Server-only transport. Call only after authorizing the recipient in the owning workflow. */
export async function sendBrandedEmail(input: {
  to: string;
  content: EmailContent;
  /** Stable per business event, reused for retries. */
  eventId: string;
}, transport: typeof fetch = fetch) {
  const key = process.env['RESEND_API_KEY'];
  if (!key) throw new Error('RESEND_API_KEY is not configured.');
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input.to)) throw new Error('Invalid email recipient.');
  if (!/^[a-zA-Z0-9_:/.-]{1,240}$/.test(input.eventId)) throw new Error('A stable email event ID is required.');
  const email = renderEmail(input.content);
  let response: Response;
  try {
    response = await transport('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `bookacrew/${input.eventId}` },
      body: JSON.stringify({ from: 'Book a Crew <noreply@bookacrew.film>', to: [input.to], ...email }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Email delivery could not be confirmed. Retry with the same event ID.');
  }
  // Provider payloads can contain recipient details. Never echo them or the key in errors/logs.
  if (!response.ok) throw new Error(`Email delivery was rejected (${response.status}).`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error('Email delivery could not be confirmed. Retry with the same event ID.');
  return { id: result.id };
}
