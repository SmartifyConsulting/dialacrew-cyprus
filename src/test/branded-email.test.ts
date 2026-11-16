import { describe, it, expect, vi, afterEach } from 'vitest';
import { authEmails, renderEmail } from '../lib/email/brand';
import { sendBrandedEmail } from '../lib/email/resend.server';

afterEach(() => vi.unstubAllEnvs());
describe('branded emails', () => {
  it('escapes dynamic text, includes plain text and preserves HTTPS actions', () => {
    const email = renderEmail({ subject: 'Update', heading: '<script>bad</script>', paragraphs: ['A & B'], action: { label: 'View', url: 'https://bookacrew.film/productions/a?x=1&y=2' } });
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('x=1&amp;y=2');
    expect(email.text).toContain('A & B');
  });
  it('rejects script and credential links', () => {
    for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com']) {
      expect(() => renderEmail({ subject: 'x', heading: 'x', paragraphs: [], action: { label: 'x', url } })).toThrow();
    }
  });
  it('preserves provider-generated auth links and codes only in auth templates', () => {
    for (const content of Object.values(authEmails)) {
      const result = renderEmail(content, true);
      expect(result.html).toContain('Book');
      if (content.action) expect(result.html).toContain('href="{{ .ConfirmationURL }}"');
      if (content.code) expect(result.html).toContain('{{ .Token }}');
    }
    expect(() => renderEmail(authEmails['invite']!)).toThrow();
  });
  it('sends through Resend with the approved sender and stable retry key', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-secret');
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'email-fixture' }), { status: 200 }));
    const result = await sendBrandedEmail({ to: 'test@example.com', eventId: 'booking/fixture/approved', content: { subject: 'Booking approved', heading: 'Approved', paragraphs: ['Your booking was approved.'] } }, transport);
    expect(result.id).toBe('email-fixture');
    const [url, request] = transport.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(request.headers['Idempotency-Key']).toBe('bookacrew/booking/fixture/approved');
    const body = JSON.parse(request.body);
    expect(body.from).toBe('Book a Crew <noreply@bookacrew.film>');
    expect(body.text).toContain('Your booking was approved.');
    expect(body.html).toContain('#1550d5');
  });
  it('fails safely without leaking provider errors or secrets', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-secret');
    await expect(sendBrandedEmail({ to: 'test@example.com', eventId: 'fixture', content: { subject: 'x', heading: 'x', paragraphs: [] } }, vi.fn().mockResolvedValue(new Response('secret recipient detail', { status: 403 })))).rejects.toThrow('Email delivery was rejected (403).');
  });
});
