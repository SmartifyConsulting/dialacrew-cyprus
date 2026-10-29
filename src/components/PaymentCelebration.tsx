import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyCrewId } from "@/lib/site";

const paidStatuses = ["paid", "payment_released", "completed", "resolved"];

export function PaymentCelebration() {
  const crewId = useMyCrewId(true).data;
  const qc = useQueryClient();
  const [celebration, setCelebration] = useState<{ id: string; number: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const q = useQuery({ queryKey: ["crew-paid-invoices", crewId], enabled: !!crewId, refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await supabase.from("invoices").select("id, invoice_number, status").eq("crew_id", crewId!);
    if (error) throw error; return data ?? [];
  } });
  useEffect(() => {
    initialized.current = false;
    seen.current.clear();
  }, [crewId]);
  useEffect(() => {
    if (!q.data || !crewId) return;
    const paid = q.data.filter((i) => paidStatuses.includes(i.status.toLowerCase()));
    if (!initialized.current) {
      paid.forEach((i) => seen.current.add(i.id));
      initialized.current = true;
      return;
    }
    const fresh = paid.find((i) => !seen.current.has(i.id));
    paid.forEach((i) => seen.current.add(i.id));
    if (fresh) setCelebration({ id: fresh.id, number: fresh.invoice_number });
  }, [q.data, crewId]);
  useEffect(() => {
    if (!crewId) return;
    const channel = supabase.channel(`crew-payment-${crewId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "invoices", filter: `crew_id=eq.${crewId}` }, () => { void qc.invalidateQueries({ queryKey: ["crew-paid-invoices", crewId] }); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [crewId, qc]);
  if (!celebration) return null;
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4" role="presentation">
    <section role="alertdialog" aria-modal="true" aria-labelledby="payment-celebration-title" className="relative w-full max-w-md overflow-hidden rounded-2xl bg-card p-8 text-center shadow-2xl">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 55 }, (_, index) => <span key={index} className="absolute top-0 block h-3 w-2 animate-[confetti-fall_2.8s_ease-out_forwards]" style={{ left: `${(index * 37) % 100}%`, animationDelay: `${(index % 15) * 0.11}s`, backgroundColor: ["#ffca28", "#18a999", "#ec4899", "#7c3aed", "#38bdf8"][index % 5], transform: `rotate(${index * 21}deg)` }} />)}
      </div>
      <div className="relative"><div className="mb-3 text-5xl" aria-hidden="true">🎉</div>
        <h2 id="payment-celebration-title" className="text-3xl font-extrabold">You've been paid!</h2>
        <p className="mt-3 text-sm text-muted-foreground">Payment recorded for invoice {celebration.number}.</p>
        <button onClick={() => setCelebration(null)} className="mt-6 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground">Wonderful! OK</button>
      </div>
    </section>
  </div>;
}
