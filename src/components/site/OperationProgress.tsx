import { useEffect, useState } from "react";
export function OperationProgress({ label, completed, total }: { label: string; completed?: number; total?: number }) {
  const [estimated, setEstimated] = useState(5);
  useEffect(() => { setEstimated(5); const timer = setInterval(() => setEstimated((value) => Math.min(90, value + Math.max(0.2, (90 - value) / 18))), 1000); return () => clearInterval(timer); }, [completed]);
  const measured = total != null && total > 0;
  const done = completed ?? 0;
  const value = measured ? done >= total ? 100 : Math.min(99, Math.round(100 * (done + estimated / 100) / total)) : Math.round(estimated);
  return <div role="status" className="space-y-2 rounded border border-primary/30 bg-primary/5 p-3 text-xs">
    <div>{label} · {measured ? `${completed} / ${total} finished · estimated progress` : "Working — estimated progress"}</div>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext="Estimated progress; completion confirmed when saved" className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary transition-all duration-1000" style={{ width: `${value}%` }} /></div>
    {!measured && <p className="text-muted-foreground">The provider does not report a percentage. This estimate stops below completion until the result is saved.</p>}
  </div>;
}
