import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAiBalance, startAiTopup, verifyAiTopup } from "@/lib/ai-balance.functions";
import { friendlyError } from "@/lib/errors";
import type { Production } from "@/lib/demo-data";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";

export function AiBalance({ production, currency = "USD", embedded = false, showLedger = false }: { production?: Pick<Production, "id" | "currency">; currency?: string; embedded?: boolean; showLedger?: boolean }) {
  const localCurrency = production?.currency || currency;
  const [page, setPage] = useState(0);
  const { session } = useSession();
  const load = useServerFn(getAiBalance);
  const checkout = useServerFn(startAiTopup);
  const verify = useServerFn(verifyAiTopup);
  const balance = useQuery({ queryKey: ["ai-balance", session?.user.id, localCurrency], enabled: !!session, queryFn: () => load({ data: { currency: localCurrency } }), refetchOnWindowFocus: true });
  const ledger = useQuery({ queryKey: ["personal-ai-ledger", session?.user.id, page], enabled: showLedger && !!session, queryFn: async () => {
    const { data, error } = await supabase.from("ai_balance_ledger").select("id, kind, amount_micros, activity, created_at").eq("user_id", session!.user.id).order("created_at", { ascending: false }).order("id").range(page * 20, page * 20 + 19);
    if (error) throw error; return data ?? [];
  } });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ai_topup") ?? "");
  const usd = Number(amount || balance.data?.minimumUsd || 0);
  const money = (n: number, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  async function verifyPayment() {
    setBusy(true);
    try { const result = await verify({ data: { reference } }); if (result.paid) { toast.success("AI balance topped up"); setReference(""); await balance.refetch(); await ledger.refetch(); } }
    catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  return <section className={`space-y-3 p-4 text-sm ${embedded ? "border-t border-border" : "rounded border border-border bg-card"}`}>
    <h3 className="font-semibold">AI balance · {balance.data ? money(balance.data.usd, "USD") : "…"}</h3>
    {balance.isError && <p role="alert">AI balance is unavailable. <button className="underline" onClick={() => void balance.refetch()}>Try again</button></p>}
    {balance.data && <>
      <p className="text-xs text-muted-foreground">Total paid contributions: <strong className="text-foreground">{money(balance.data.contributedUsd, "USD")}</strong></p>
      <p className="text-xs text-muted-foreground">Local equivalent: {money(balance.data.usd * balance.data.localPerUsd, balance.data.currency)}. Minimum top-up {money(balance.data.minimumUsd, "USD")} ≈ {money(balance.data.minimumUsd * balance.data.localPerUsd, balance.data.currency)} (R200 equivalent). Exchange rates are indicative; checkout confirms the local amount.</p>
      <div className="flex flex-wrap items-center gap-3"><label>Top-up (USD) <input type="number" min={balance.data.minimumUsd} step="0.01" aria-label="AI balance top-up in USD" value={amount || balance.data.minimumUsd} onChange={(e) => setAmount(e.target.value)} className="w-24 rounded border border-input bg-background p-2" /></label>
      <span>{money(usd * balance.data.localPerUsd, balance.data.currency)}</span>
      <button disabled={busy || !balance.data.paymentsConnected || usd < balance.data.minimumUsd} className="rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50" onClick={async () => { setBusy(true); try { const result = await checkout({ data: { ...(production ? { productionId: production.id } : {}), currency: balance.data!.currency, usd } }); window.location.assign(result.url); } catch (error) { toast.error(friendlyError(error)); setBusy(false); } }}>Top up AI balance</button></div>
      {!balance.data.paymentsConnected && <p role="status" className="text-xs text-destructive">AI top-up checkout is not connected yet. Please contact your administrator.</p>}
      <p className="text-xs text-muted-foreground">USD charges: breakdown {money(balance.data.prices.breakdown, "USD")}; references {money(balance.data.prices.references, "USD")}; illustration or regeneration {money(balance.data.prices.image, "USD")}; PDF extraction {money(balance.data.prices.pdf, "USD")}. Failed operations are refunded.</p>
      <p className="text-xs text-muted-foreground">Local-currency checkout requires that currency to be enabled on the payment account. Rates supplied by <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" className="underline">ExchangeRate-API</a>.</p>
    </>}
    {showLedger && <div className="space-y-2 border-t border-border pt-3">
      <h4 className="font-semibold">Your AI/token ledger</h4><p className="text-xs text-muted-foreground">AI credit transactions in USD.</p>
      {ledger.isPending && <p role="status">Loading transactions…</p>}
      {ledger.isError && <p role="alert">Could not load transactions. <button className="underline" onClick={() => void ledger.refetch()}>Retry</button></p>}
      {ledger.isSuccess && <><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">Date / time</th><th>Activity</th><th>Type</th><th className="text-right">Amount (USD)</th></tr></thead><tbody>
        {ledger.data.map(row => <tr key={row.id} className="border-t border-border"><td className="whitespace-nowrap py-2 pr-3">{new Date(row.created_at).toLocaleString()}</td><td className="pr-3">{row.activity}</td><td className="pr-3">{row.kind === "topup" ? "Top-up" : row.kind === "charge" ? "Usage" : "Refund"}</td><td className="text-right">{row.kind === "charge" ? "−" : "+"}{money(Number(row.amount_micros) / 1_000_000,"USD")}</td></tr>)}
        {!ledger.data.length && <tr><td colSpan={4} className="py-3 text-muted-foreground">No transactions yet.</td></tr>}
      </tbody></table></div><div className="flex items-center justify-between text-xs"><button disabled={page === 0} onClick={() => setPage(p => p-1)} className="underline disabled:opacity-40">Previous</button><span>Page {page+1}</span><button disabled={ledger.data.length < 20} onClick={() => setPage(p => p+1)} className="underline disabled:opacity-40">Next</button></div></>}
    </div>}
    {reference && <button disabled={busy} onClick={verifyPayment} className="underline">Verify returned AI payment</button>}
  </section>;
}
