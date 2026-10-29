import { useState } from "react";
import terms from "@/content/terms.txt?raw";

export function JobTermsDialog({ jobName, role, onAccept, onClose, busy = false }: {
  jobName: string; role: string; onAccept: () => void; onClose: () => void; busy?: boolean;
}) {
  const [agreed, setAgreed] = useState(false);
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="job-terms-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
      <header className="border-b border-border p-5">
        <h2 id="job-terms-title" className="text-xl font-bold">Accept terms & conditions for this job</h2>
        <p className="mt-1 text-sm text-muted-foreground"><strong>{jobName}</strong> · {role}</p>
        <p className="mt-2 text-xs text-muted-foreground">You must accept the terms separately for every job. Your acceptance, identity and date/time will be recorded.</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-relaxed" tabIndex={0} aria-label="Terms and conditions">{terms}</div>
      <footer className="space-y-4 border-t border-border p-5">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>I have read and agree to the terms and conditions for <strong>{jobName}</strong>.</span>
        </label>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
          <button type="button" onClick={onAccept} disabled={!agreed || busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Recording acceptance…" : "Agree & accept job"}</button>
        </div>
      </footer>
    </section>
  </div>;
}
