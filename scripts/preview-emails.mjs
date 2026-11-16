import { mkdir, writeFile } from 'node:fs/promises';
import { authEmails, renderEmail } from '../src/lib/email/brand.ts';

const directory = new URL('../docs/email-previews/', import.meta.url);
await mkdir(directory, { recursive: true });
const config = {};
for (const [name, content] of Object.entries(authEmails)) {
  const email = renderEmail(content, true);
  config[`mailer_subjects_${name}`] = email.subject;
  config[`mailer_templates_${name}_content`] = email.html;
  await writeFile(new URL(`${name}.html`, directory), email.html);
  await writeFile(new URL(`${name}.txt`, directory), email.text);
}
await writeFile(new URL('auth-templates.json', directory), JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared ${Object.keys(authEmails).length} branded auth templates. No settings changed and no emails sent.`);
