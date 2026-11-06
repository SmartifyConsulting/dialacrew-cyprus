import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { Coins, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { fmtMoney } from "@/lib/demo-data";
import { startAudioCreditsCheckout, verifyAudioCreditsCheckout } from "@/lib/storyboard-credits.functions";

const btn = "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Package = { key: string; name: string; credits: number; price_cents: number; currency: string };

export function useAudioWalletBalance(productionId: string) {
  return useQuery({
    queryKey: ["storyboard-audio-wallet", productionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("storyboard_audio_wallets").select("*").eq("production_id", productionId).maybeSingle();
      if (error) throw error;
      return data ?? { available_credits: 0, reserved_credits: 0, total_purchased: 0, total_consumed: 0 };
    },
  });
}

// Handles the ?audio_ref=<reference> Paystack returns with — verifies server-side and reports the
// outcome, then cleans the param out of the URL.
function usePaystackReturn(productionId: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { audio_ref?: string };
  const verify = useServerFn(verifyAudioCreditsCheckout);
  useEffect(() => {
    if (!search.audio_ref) return;
    const reference = search.audio_ref;
    (async () => {
      try {
        const result = await verify({ data: { reference } });
        if (result.credited) toast.success(`Payment successful! ${result.credits} Storyboard Audio Credits have been added to your account.`);
        qc.invalidateQueries({ queryKey: ["storyboard-audio-wallet", productionId] });
      } catch (e) { toast.error(friendlyError(e)); }
      finally {
        navigate({ to: ".", search: (prev) => { const next = { ...prev }; delete next.audio_ref; return next; }, replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.audio_ref]);
}

export function TopUpAudioCredits({ productionId }: { productionId: string }) {
  usePaystackReturn(productionId);
  const wallet = useAudioWalletBalance(productionId).data;
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const startCheckout = useServerFn(startAudioCreditsCheckout);
  const packages = useQuery({
    queryKey: ["storyboard-audio-packages"],
    queryFn: async () => { const { data, error } = await supabase.from("storyboard_audio_packages").select("*").eq("active", true).order("sort_order"); if (error) throw error; return (data ?? []) as Package[]; },
  }).data ?? [];

  async function buy(pkg: Package) {
    setBusyKey(pkg.key);
    try {
      const { url } = await startCheckout({ data: { productionId, packageKey: pkg.key as "starter" | "creator" | "studio" } });
      window.location.href = url;
    } catch (e) { toast.error(friendlyError(e)); setBusyKey(null); }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">
          <Coins className="h-3.5 w-3.5 text-primary" /> {wallet?.available_credits ?? 0} Storyboard Audio Credits
        </span>
        <button onClick={() => setOpen(true)} className="rounded-sm border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">Top Up Storyboard Audio</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-sm border border-border bg-card p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Top Up Storyboard Audio</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Credits are only used for AI-generated music, sound effects, ambience and narration. Creating storyboard frames, editing shots, uploading your own audio and everything else in Storyboard Studio stays free — no subscription required.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {packages.map((pkg) => (
                <div key={pkg.key} className="flex flex-col items-center gap-1 rounded-sm border border-border p-4 text-center">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pkg.name}</span>
                  <span className="font-display text-2xl font-bold">{pkg.credits}</span>
                  <span className="text-xs text-muted-foreground">credits</span>
                  <span className="mt-1 font-semibold">{fmtMoney(pkg.price_cents / 100, pkg.currency)}</span>
                  <button onClick={() => buy(pkg)} disabled={!!busyKey} className={`${btn} mt-2 w-full justify-center`}>{busyKey === pkg.key ? "Redirecting…" : "Buy"}</button>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11px] text-muted-foreground">Paid securely via Paystack. Prices in ZAR.</p>
          </div>
        </div>
      )}
    </>
  );
}
