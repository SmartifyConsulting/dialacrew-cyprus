CREATE OR REPLACE FUNCTION public.gig_setting(_key text, _default numeric) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT CASE WHEN jsonb_typeof(value::jsonb)='object' THEN (value::jsonb->>'amount')::numeric ELSE (value::jsonb #>> '{}')::numeric END FROM public.platform_settings WHERE key=_key), _default);
$$;

CREATE OR REPLACE FUNCTION public.set_gig_secure_fee() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.secure_fee := public.gig_setting('gig_secure_fee', 50); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_gig_secure_fee ON public.community_gigs;
CREATE TRIGGER trg_gig_secure_fee BEFORE INSERT ON public.community_gigs FOR EACH ROW EXECUTE FUNCTION public.set_gig_secure_fee();

CREATE OR REPLACE FUNCTION public.withdraw_from_gig(_gig uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.community_gigs; starts timestamptz; pen numeric := 0; hrs numeric;
BEGIN
  SELECT * INTO g FROM public.community_gigs WHERE id=_gig FOR UPDATE;
  IF g.secured_by IS DISTINCT FROM auth.uid() OR g.status <> 'secured' THEN RAISE EXCEPTION 'Not your gig'; END IF;
  starts := (g.event_date + g.call_time) AT TIME ZONE 'Africa/Johannesburg';
  hrs := public.gig_setting('gig_notice_hours', 24);
  IF starts - now() < make_interval(hours => hrs::int) THEN
    pen := public.gig_setting('gig_penalty_fee', 500);
    UPDATE public.community_gigs SET status='open', secured_by=NULL, secured_name=NULL, secured_at=NULL, penalty_amount=penalty_amount+pen, penalty_reason='Late withdrawal (under '||hrs::int||' hours)' WHERE id=_gig;
  ELSE
    UPDATE public.community_gigs SET status='open', secured_by=NULL, secured_name=NULL, secured_at=NULL WHERE id=_gig;
  END IF;
  RETURN pen;
END $$;

CREATE OR REPLACE FUNCTION public.report_gig_no_show(_gig uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.community_gigs; pen numeric;
BEGIN
  SELECT * INTO g FROM public.community_gigs WHERE id=_gig FOR UPDATE;
  IF g.posted_by <> auth.uid() OR g.status <> 'secured' THEN RAISE EXCEPTION 'Only the poster can report a no-show'; END IF;
  pen := public.gig_setting('gig_penalty_fee', 500);
  UPDATE public.community_gigs SET status='no_show', penalty_amount=penalty_amount+pen, penalty_reason='No-show / not delivered' WHERE id=_gig;
  RETURN pen;
END $$;

GRANT EXECUTE ON FUNCTION public.gig_setting(text, numeric) TO authenticated;