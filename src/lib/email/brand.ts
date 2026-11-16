/** Shared email presentation. No credentials or recipient lookup belongs here. */
export interface EmailContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  code?: string;
  footer?: string;
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function safeLink(value: string, authTemplate: boolean) {
  if (authTemplate && value === '{{ .ConfirmationURL }}') return value;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Email links must use HTTPS.');
  return escape(value);
}

export function renderEmail(content: EmailContent, authTemplate = false) {
  const action = content.action ? safeLink(content.action.url, authTemplate) : undefined;
  const footer = content.footer ?? 'This is an automated message from Book a Crew. Please do not reply to this address.';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;color:#111827;font-family:Manrope,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(content.heading)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e5e9;border-radius:12px;overflow:hidden">
<tr><td style="background:#050505;border-bottom:4px solid #009eff;padding:24px 28px"><a href="https://bookacrew.film" style="color:#ffffff;text-decoration:none;font-size:28px;font-weight:800">Book <span style="color:#009eff">a</span> Crew</a></td></tr>
<tr><td style="padding:32px 28px"><h1 style="margin:0 0 20px;font-family:Sora,Arial,sans-serif;font-size:24px;line-height:1.35;color:#111827">${escape(content.heading)}</h1>
${content.paragraphs.map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65">${escape(p)}</p>`).join('\n')}
${content.code ? `<p style="padding:16px;background:#f4f6f8;border-radius:6px;font-size:28px;font-weight:700;letter-spacing:6px;text-align:center">${escape(content.code)}</p>` : ''}
${action ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0"><tr><td bgcolor="#1550d5" style="border-radius:6px"><a href="${action}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">${escape(content.action!.label)}</a></td></tr></table><p style="font-size:12px;line-height:1.6;color:#64748b;overflow-wrap:anywhere">If the button does not work, open this link:<br><a href="${action}" style="color:#1550d5;word-break:break-all">${action}</a></p>` : ''}
</td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e2e5e9;background:#fafbfc;font-size:12px;line-height:1.6;color:#64748b">${escape(footer)}<br><a href="https://bookacrew.film" style="color:#1550d5;text-decoration:none">bookacrew.film</a></td></tr></table>
</td></tr></table></body></html>`;
  const text = ['Book a Crew', content.heading, ...content.paragraphs, content.code, content.action ? `${content.action.label}: ${content.action.url}` : undefined, footer, 'https://bookacrew.film'].filter(Boolean).join('\n\n');
  return { subject: content.subject, html, text };
}

const link = (label: string) => ({ label, url: '{{ .ConfirmationURL }}' });
export const authEmails: Record<string, EmailContent> = {
  confirmation: { subject: 'Confirm your Book a Crew account', heading: 'Welcome to Book a Crew', paragraphs: ['Confirm your email address to finish setting up your account.', 'If you did not create an account, you can ignore this email.'], action: link('Confirm email address') },
  invite: { subject: 'Your invitation to Book a Crew', heading: 'You’re invited', paragraphs: ['You have been invited to join Book a Crew. Accept your invitation to set up your account and connect with your production team.', 'If you were not expecting this invitation, you can ignore this email.'], action: link('Accept invitation') },
  recovery: { subject: 'Reset your Book a Crew password', heading: 'Reset your password', paragraphs: ['We received a request to reset your Book a Crew password. Use the button below to choose a new password.', 'If you did not request this, you can ignore this email. Your password will stay the same.'], action: link('Reset password') },
  magic_link: { subject: 'Your Book a Crew sign-in link', heading: 'Sign in to Book a Crew', paragraphs: ['Use this secure link to sign in to your account.', 'If you did not request this link, you can ignore this email.'], action: link('Sign in') },
  email_change: { subject: 'Confirm your Book a Crew email change', heading: 'Confirm your email address', paragraphs: ['Confirm this email address to complete the requested change to your Book a Crew account.', 'If you did not request this change, open Book a Crew directly and review your account security.'], action: link('Confirm email change') },
  reauthentication: { subject: 'Your Book a Crew verification code', heading: 'Verify it’s you', paragraphs: ['Enter this verification code in Book a Crew to continue.', 'Never share this code. If you did not request it, review your account security.'], code: '{{ .Token }}' },
  password_changed_notification: { subject: 'Your Book a Crew password changed', heading: 'Your password was changed', paragraphs: ['The password for your Book a Crew account was changed.', 'If you did not make this change, open Book a Crew directly and reset your password immediately.'] },
  email_changed_notification: { subject: 'Your Book a Crew email address changed', heading: 'Your email address was changed', paragraphs: ['The email address for your Book a Crew account was changed.', 'If you did not make this change, open Book a Crew directly and review your account security immediately.'] },
  phone_changed_notification: { subject: 'Your Book a Crew phone number changed', heading: 'Your phone number was changed', paragraphs: ['The phone number for your Book a Crew account was changed.', 'If you did not make this change, review your account security immediately.'] },
  mfa_factor_enrolled_notification: { subject: 'Book a Crew verification method added', heading: 'A verification method was added', paragraphs: ['A new verification method was added to your Book a Crew account.', 'If you did not make this change, review your account security immediately.'] },
  mfa_factor_unenrolled_notification: { subject: 'Book a Crew verification method removed', heading: 'A verification method was removed', paragraphs: ['A verification method was removed from your Book a Crew account.', 'If you did not make this change, review your account security immediately.'] },
  identity_linked_notification: { subject: 'Book a Crew sign-in method added', heading: 'A sign-in method was added', paragraphs: ['A new sign-in method was linked to your Book a Crew account.', 'If you did not make this change, review your account security immediately.'] },
  identity_unlinked_notification: { subject: 'Book a Crew sign-in method removed', heading: 'A sign-in method was removed', paragraphs: ['A sign-in method was removed from your Book a Crew account.', 'If you did not make this change, review your account security immediately.'] },
};
