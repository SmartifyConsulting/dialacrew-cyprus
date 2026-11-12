BEGIN;
CREATE TABLE public.ai_balances(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,balance_micros bigint NOT NULL DEFAULT 0 CHECK(balance_micros>=0));
CREATE TABLE public.ai_balance_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),reference text NOT NULL UNIQUE,amount_minor bigint NOT NULL CHECK(amount_minor>0),currency text NOT NULL,usd_micros bigint NOT NULL CHECK(usd_micros>0),fx_rate numeric NOT NULL CHECK(fx_rate>0),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.ai_balance_ledger(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),operation_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('topup','charge','refund')),amount_micros bigint NOT NULL CHECK(amount_micros>0),activity text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(operation_id,kind));
ALTER TABLE public.ai_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_balance_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_balance_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_balances,public.ai_balance_purchases,public.ai_balance_ledger FROM anon,authenticated;
GRANT SELECT ON public.ai_balances,public.ai_balance_purchases,public.ai_balance_ledger TO authenticated;
GRANT ALL ON public.ai_balances,public.ai_balance_purchases,public.ai_balance_ledger TO service_role;
CREATE POLICY "own ai balance" ON public.ai_balances FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "own ai purchases" ON public.ai_balance_purchases FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY "own ai ledger" ON public.ai_balance_ledger FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.change_ai_balance(p_user uuid,p_operation text,p_kind text,p_amount bigint,p_activity text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE balance bigint; charged bigint;
BEGIN
 IF p_kind NOT IN ('charge','refund') OR p_amount<=0 THEN RAISE EXCEPTION 'Invalid balance change'; END IF;
 INSERT INTO public.ai_balances(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT balance_micros INTO balance FROM public.ai_balances WHERE user_id=p_user FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.ai_balance_ledger WHERE operation_id=p_operation AND kind=p_kind) THEN RETURN balance; END IF;
 IF p_kind='refund' THEN
  SELECT amount_micros INTO charged FROM public.ai_balance_ledger WHERE operation_id=p_operation AND kind='charge' AND user_id=p_user;
  IF charged IS NULL OR charged<>p_amount THEN RAISE EXCEPTION 'Charge not found'; END IF;
  balance:=balance+p_amount;
 ELSE
  IF balance<p_amount THEN RAISE EXCEPTION 'Insufficient AI balance. Please top up before generating.'; END IF;
  balance:=balance-p_amount;
 END IF;
 UPDATE public.ai_balances SET balance_micros=balance WHERE user_id=p_user;
 INSERT INTO public.ai_balance_ledger(user_id,operation_id,kind,amount_micros,activity) VALUES(p_user,p_operation,p_kind,p_amount,p_activity);
 RETURN balance;
END $$;
CREATE OR REPLACE FUNCTION public.credit_ai_purchase(p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE purchase public.ai_balance_purchases;
BEGIN
 SELECT * INTO purchase FROM public.ai_balance_purchases WHERE reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
 IF purchase.status='paid' THEN RETURN; END IF;
 INSERT INTO public.ai_balances(user_id,balance_micros) VALUES(purchase.user_id,purchase.usd_micros) ON CONFLICT(user_id) DO UPDATE SET balance_micros=ai_balances.balance_micros+excluded.balance_micros;
 INSERT INTO public.ai_balance_ledger(user_id,operation_id,kind,amount_micros,activity) VALUES(purchase.user_id,p_reference,'topup',purchase.usd_micros,'AI balance top-up');
 UPDATE public.ai_balance_purchases SET status='paid' WHERE reference=p_reference;
END $$;
REVOKE ALL ON FUNCTION public.change_ai_balance(uuid,text,text,bigint,text),public.credit_ai_purchase(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.change_ai_balance(uuid,text,text,bigint,text),public.credit_ai_purchase(text) TO service_role;
INSERT INTO public.platform_settings(key,value) VALUES('storyboard_ai_prices_usd','{"breakdown":0.02,"references":0.02,"image":0.04,"pdf":0.10}'::jsonb) ON CONFLICT(key) DO NOTHING;
COMMIT;
