-- Storyboard Audio Credits: a prepaid wallet per production for paid AI audio generation
-- (music/SFX/ambience/narration in Sound Design mode). The storyboard itself, illustrations and
-- basic editing stay free — this wallet is only ever touched by audio generation.
--
-- The ledger table (storyboard_audio_transactions) is the authoritative financial record; the
-- wallet's running totals are a cache kept in sync by the same atomic functions that write the
-- ledger, never updated directly by application code.

CREATE TABLE IF NOT EXISTS public.storyboard_audio_wallets (
  production_id text PRIMARY KEY REFERENCES public.productions(id) ON DELETE CASCADE,
  available_credits integer NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
  reserved_credits integer NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  total_purchased integer NOT NULL DEFAULT 0,
  total_consumed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.storyboard_audio_wallets TO authenticated;
GRANT ALL ON public.storyboard_audio_wallets TO service_role;
ALTER TABLE public.storyboard_audio_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read audio wallet" ON public.storyboard_audio_wallets FOR SELECT TO authenticated USING (public.is_site_member(production_id));
-- No INSERT/UPDATE/DELETE policy for authenticated: every balance change goes through the
-- SECURITY DEFINER functions below, which run as the table owner.

CREATE TABLE IF NOT EXISTS public.storyboard_audio_packages (
  key text PRIMARY KEY,
  name text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  price_cents integer NOT NULL CHECK (price_cents > 0), -- smallest ZAR unit (cents)
  currency text NOT NULL DEFAULT 'ZAR',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.storyboard_audio_packages TO authenticated, anon;
GRANT ALL ON public.storyboard_audio_packages TO service_role;
ALTER TABLE public.storyboard_audio_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads active audio packages" ON public.storyboard_audio_packages FOR SELECT USING (active);
CREATE POLICY "admins manage audio packages" ON public.storyboard_audio_packages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.storyboard_audio_packages (key, name, credits, price_cents, sort_order) VALUES
  ('starter', 'Starter', 100, 4900, 1),
  ('creator', 'Creator', 250, 9900, 2),
  ('studio', 'Studio', 600, 19900, 3)
ON CONFLICT (key) DO NOTHING;

-- Flat credit cost per generation kind. Deliberately simple for now (not the full provider-cost /
-- margin engine) so pricing is still admin-editable without a code change; a fuller margin
-- calculator can compute and write these same rows later without changing how they're charged.
CREATE TABLE IF NOT EXISTS public.storyboard_audio_pricing (
  generation_kind text PRIMARY KEY CHECK (generation_kind IN ('music', 'sfx', 'ambience', 'narration')),
  credits_per_generation integer NOT NULL CHECK (credits_per_generation > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.storyboard_audio_pricing TO authenticated;
GRANT ALL ON public.storyboard_audio_pricing TO service_role;
ALTER TABLE public.storyboard_audio_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read audio pricing" ON public.storyboard_audio_pricing FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage audio pricing" ON public.storyboard_audio_pricing FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.storyboard_audio_pricing (generation_kind, credits_per_generation) VALUES
  ('music', 50), ('sfx', 10), ('ambience', 15), ('narration', 15)
ON CONFLICT (generation_kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.storyboard_audio_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  package_key text NOT NULL REFERENCES public.storyboard_audio_packages(key),
  credits integer NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  paystack_reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
GRANT SELECT, INSERT ON public.storyboard_audio_purchases TO authenticated;
GRANT ALL ON public.storyboard_audio_purchases TO service_role;
ALTER TABLE public.storyboard_audio_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read audio purchases" ON public.storyboard_audio_purchases FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers create audio purchases" ON public.storyboard_audio_purchases FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id) AND created_by = auth.uid());
-- Status only ever flips pending -> paid/failed inside allocate_storyboard_audio_credits (SECURITY DEFINER); no client UPDATE policy.

-- The authoritative ledger. "credits" is always a positive magnitude; the kind says which way it
-- moved. idempotency_key makes every write-once: a purchase can only ever be allocated once (keyed
-- by its id), and a given generation attempt can only be reserved/charged/released once each.
CREATE TABLE IF NOT EXISTS public.storyboard_audio_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('purchase', 'reserve', 'charge', 'release', 'refund', 'adjustment')),
  credits integer NOT NULL CHECK (credits > 0),
  idempotency_key text NOT NULL,
  purchase_id uuid REFERENCES public.storyboard_audio_purchases(id),
  cue_id uuid REFERENCES public.storyboard_audio_cues(id),
  balance_after integer NOT NULL,
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, idempotency_key)
);
GRANT SELECT ON public.storyboard_audio_transactions TO authenticated;
GRANT ALL ON public.storyboard_audio_transactions TO service_role;
ALTER TABLE public.storyboard_audio_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers read audio ledger" ON public.storyboard_audio_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id));
-- No client write policy: every row is inserted by the SECURITY DEFINER functions below.

CREATE INDEX IF NOT EXISTS storyboard_audio_transactions_production_idx ON public.storyboard_audio_transactions (production_id, created_at DESC);

-- Allocates a paid purchase's credits exactly once. Callable repeatedly (by both the redirect-verify
-- path and the webhook) with the same purchase id; only the first call that finds status='pending'
-- does anything, so a successful payment can never allocate credits twice.
CREATE OR REPLACE FUNCTION public.allocate_storyboard_audio_credits(_purchase_id uuid)
RETURNS TABLE (allocated boolean, production_id text, credits integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_purchase record;
  v_balance integer;
BEGIN
  UPDATE public.storyboard_audio_purchases
  SET status = 'paid', paid_at = now()
  WHERE id = _purchase_id AND status = 'pending'
  RETURNING * INTO v_purchase;

  IF NOT FOUND THEN
    SELECT p.production_id, p.credits INTO production_id, credits FROM public.storyboard_audio_purchases p WHERE p.id = _purchase_id;
    RETURN QUERY SELECT false, production_id, credits;
    RETURN;
  END IF;

  INSERT INTO public.storyboard_audio_wallets (production_id, available_credits, total_purchased)
  VALUES (v_purchase.production_id, 0, 0)
  ON CONFLICT (production_id) DO NOTHING;

  UPDATE public.storyboard_audio_wallets
  SET available_credits = available_credits + v_purchase.credits,
      total_purchased = total_purchased + v_purchase.credits,
      updated_at = now()
  WHERE public.storyboard_audio_wallets.production_id = v_purchase.production_id
  RETURNING available_credits INTO v_balance;

  INSERT INTO public.storyboard_audio_transactions (production_id, kind, credits, idempotency_key, purchase_id, balance_after, created_by)
  VALUES (v_purchase.production_id, 'purchase', v_purchase.credits, _purchase_id::text, _purchase_id, v_balance, v_purchase.created_by);

  RETURN QUERY SELECT true, v_purchase.production_id, v_purchase.credits;
END $$;
GRANT EXECUTE ON FUNCTION public.allocate_storyboard_audio_credits(uuid) TO authenticated, service_role;

-- Reserves credits for a generation attempt before the AI provider is called. Fails loudly (raises)
-- if there aren't enough available credits, or if this exact idempotency key was already reserved.
CREATE OR REPLACE FUNCTION public.reserve_storyboard_audio_credits(_production_id text, _credits integer, _idempotency_key text, _cue_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_balance integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'producer') AND public.is_site_member(_production_id)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF EXISTS (SELECT 1 FROM public.storyboard_audio_transactions WHERE kind = 'reserve' AND idempotency_key = _idempotency_key) THEN
    RAISE EXCEPTION 'already reserved';
  END IF;

  INSERT INTO public.storyboard_audio_wallets (production_id) VALUES (_production_id) ON CONFLICT (production_id) DO NOTHING;

  UPDATE public.storyboard_audio_wallets
  SET available_credits = available_credits - _credits, reserved_credits = reserved_credits + _credits, updated_at = now()
  WHERE production_id = _production_id AND available_credits >= _credits
  RETURNING available_credits INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient credits';
  END IF;

  INSERT INTO public.storyboard_audio_transactions (production_id, kind, credits, idempotency_key, cue_id, balance_after, created_by)
  VALUES (_production_id, 'reserve', _credits, _idempotency_key, _cue_id, v_balance, auth.uid());

  RETURN v_balance;
END $$;
GRANT EXECUTE ON FUNCTION public.reserve_storyboard_audio_credits(text, integer, text, uuid) TO authenticated, service_role;

-- Converts a reservation into a final charge once generation succeeds. No-ops (does not double
-- charge) if this idempotency key was already charged or released.
CREATE OR REPLACE FUNCTION public.finalize_storyboard_audio_charge(_idempotency_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reserve record;
  v_balance integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.storyboard_audio_transactions WHERE kind IN ('charge', 'release') AND idempotency_key = _idempotency_key) THEN
    RETURN false;
  END IF;
  SELECT * INTO v_reserve FROM public.storyboard_audio_transactions WHERE kind = 'reserve' AND idempotency_key = _idempotency_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no matching reservation';
  END IF;

  UPDATE public.storyboard_audio_wallets
  SET reserved_credits = reserved_credits - v_reserve.credits, total_consumed = total_consumed + v_reserve.credits, updated_at = now()
  WHERE production_id = v_reserve.production_id
  RETURNING available_credits INTO v_balance;

  INSERT INTO public.storyboard_audio_transactions (production_id, kind, credits, idempotency_key, cue_id, balance_after, created_by)
  VALUES (v_reserve.production_id, 'charge', v_reserve.credits, _idempotency_key, v_reserve.cue_id, v_balance, auth.uid());

  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.finalize_storyboard_audio_charge(text) TO authenticated, service_role;

-- Returns a reservation's credits to the available balance when generation fails. Same no-op guard.
CREATE OR REPLACE FUNCTION public.release_storyboard_audio_reservation(_idempotency_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reserve record;
  v_balance integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.storyboard_audio_transactions WHERE kind IN ('charge', 'release') AND idempotency_key = _idempotency_key) THEN
    RETURN false;
  END IF;
  SELECT * INTO v_reserve FROM public.storyboard_audio_transactions WHERE kind = 'reserve' AND idempotency_key = _idempotency_key;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.storyboard_audio_wallets
  SET reserved_credits = reserved_credits - v_reserve.credits, available_credits = available_credits + v_reserve.credits, updated_at = now()
  WHERE production_id = v_reserve.production_id
  RETURNING available_credits INTO v_balance;

  INSERT INTO public.storyboard_audio_transactions (production_id, kind, credits, idempotency_key, cue_id, balance_after, created_by)
  VALUES (v_reserve.production_id, 'release', v_reserve.credits, _idempotency_key, v_reserve.cue_id, v_balance, auth.uid());

  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.release_storyboard_audio_reservation(text) TO authenticated, service_role;
