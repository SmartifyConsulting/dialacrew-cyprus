INSERT INTO public.platform_settings(key,value) VALUES('crew_refeature_price_usd','0'::jsonb) ON CONFLICT(key) DO NOTHING;

-- One credit charge and one in-app feature update in the same transaction.
CREATE FUNCTION public.buy_crew_refeature(p_operation uuid,p_expected_price_micros bigint) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE price numeric; micros bigint; operation text; featured timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'crew') THEN RAISE EXCEPTION 'Only crew can purchase re-featuring'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.crew_members WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Complete your crew profile first'; END IF;
  operation := 'crew-refeature:'||auth.uid()||':'||p_operation;
  PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.ai_balance_ledger WHERE user_id=auth.uid() AND operation_id=operation AND kind='charge') THEN
    SELECT spotlight_featured_at INTO featured FROM public.profiles WHERE id=auth.uid(); RETURN featured;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND social_opt_in) THEN RAISE EXCEPTION 'Enable featured-profile consent first'; END IF;
  SELECT (value#>>'{}')::numeric INTO price FROM public.platform_settings WHERE key='crew_refeature_price_usd';
  IF price IS NULL OR price<=0 OR price>10000 THEN RAISE EXCEPTION 'Paid re-featuring is not configured'; END IF;
  micros := ceil(price*1000000);
  IF micros<>p_expected_price_micros THEN RAISE EXCEPTION 'The re-featuring price changed. Refresh and confirm the new price.'; END IF;
  PERFORM public.change_ai_balance(auth.uid(),operation,'charge',micros,'crew_refeature');
  featured := now();
  UPDATE public.profiles SET spotlight_featured_at=featured WHERE id=auth.uid();
  RETURN featured;
END $$;
REVOKE ALL ON FUNCTION public.buy_crew_refeature(uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.buy_crew_refeature(uuid,bigint) TO authenticated;
