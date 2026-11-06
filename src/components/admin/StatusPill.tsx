import { ChevronDown } from "lucide-react";

// Compact, colour-coded status pill that still lets an admin change the value.
export function statusTone(s: string) {
  if (/(released|confirmed|completed|paid|received|secured|authorised|approved)/.test(s)) return "bg-success/15 text-success";
  if (/(failed|disputed|cancelled|rejected|expired)/.test(s)) return "bg-destructive/10 text-destructive";
  if (/(required|held|awaiting|pending|pencil|draft|sent)/.test(s)) return "bg-warning/15 text-warning-foreground";
  if (/(open|in_progress|review)/.test(s)) return "bg-primary/10 text-primary";
  return "bg-muted text-muted-foreground";
}

export function StatusPill<T extends string>({ value, options, label, onChange, ariaLabel }: {
  value: T; options: readonly T[]; label: (s: T) => string; onChange: (s: T) => void; ariaLabel?: string;
}) {
  return (
    <span className={`relative inline-flex items-center rounded-full ${statusTone(value)}`}>
      <select aria-label={ariaLabel ?? "Change status"} value={value} onChange={(e) => onChange(e.target.value as T)}
        className="cursor-pointer appearance-none whitespace-nowrap rounded-full bg-transparent py-0.5 pl-2.5 pr-6 text-[11px] font-medium text-current outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {options.map((s) => <option key={s} value={s} className="bg-background text-foreground">{label(s)}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 opacity-70" />
    </span>
  );
}
