CREATE TABLE public.community_gigs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by uuid NOT NULL DEFAULT auth.uid(),
  poster_name text NOT NULL,
  title text NOT NULL,
  role text NOT NULL,
  department text NOT NULL,
  description text NOT NULL,
  event_date date NOT NULL,
  end_date date,
  call_time time NOT NULL,
  venue text NOT NULL,
  country text NOT NULL,
  kit_required text NOT NULL DEFAULT '',
  pay_type text NOT NULL CHECK (pay_type IN ('day_rate','fixed')),
  amount numeric NOT NULL CHECK (amount > 0),
  contact_phone text NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open',
  secure_fee numeric NOT NULL DEFAULT 50,
  secured_by uuid,
  secured_name text,
  secured_at timestamptz,
  cancelled_at timestamptz,
  penalty_amount numeric NOT NULL DEFAULT 0,
  penalty_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_gigs TO authenticated;
GRANT ALL ON public.community_gigs TO service_role;
ALTER TABLE public.community_gigs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "See open gigs or own" ON public.community_gigs FOR SELECT TO authenticated
USING ((status = 'open' AND expires_at > now()) OR posted_by = auth.uid() OR secured_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Crew post gigs" ON public.community_gigs FOR INSERT TO authenticated
WITH CHECK (posted_by = auth.uid() AND status = 'open' AND secured_by IS NULL AND public.has_role(auth.uid(),'crew'));
CREATE POLICY "Poster edits open gig" ON public.community_gigs FOR UPDATE TO authenticated
USING (posted_by = auth.uid() AND status = 'open') WITH CHECK (posted_by = auth.uid() AND status IN ('open','withdrawn') AND secured_by IS NULL);
CREATE POLICY "Poster deletes open gig" ON public.community_gigs FOR DELETE TO authenticated
USING (posted_by = auth.uid() AND status = 'open');

CREATE OR REPLACE FUNCTION public.secure_gig(_gig uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.community_gigs; nm text;
BEGIN
  IF NOT public.has_role(auth.uid(),'crew') THEN RAISE EXCEPTION 'Only crew can secure gigs'; END IF;
  SELECT * INTO g FROM public.community_gigs WHERE id = _gig FOR UPDATE;
  IF g.id IS NULL OR g.status <> 'open' OR g.expires_at <= now() THEN RAISE EXCEPTION 'This gig is no longer available'; END IF;
  IF g.posted_by = auth.uid() THEN RAISE EXCEPTION 'You cannot secure your own gig'; END IF;
  SELECT COALESCE(NULLIF(full_name,''), email) INTO nm FROM public.profiles WHERE id = auth.uid();
  UPDATE public.community_gigs SET status='secured', secured_by=auth.uid(), secured_name=nm, secured_at=now() WHERE id=_gig;
END $$;

-- Pulling out with under 24 hours' notice before call time records the penalty.
CREATE OR REPLACE FUNCTION public.withdraw_from_gig(_gig uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.community_gigs; starts timestamptz; pen numeric := 0;
BEGIN
  SELECT * INTO g FROM public.community_gigs WHERE id=_gig FOR UPDATE;
  IF g.secured_by IS DISTINCT FROM auth.uid() OR g.status <> 'secured' THEN RAISE EXCEPTION 'Not your gig'; END IF;
  starts := (g.event_date + g.call_time) AT TIME ZONE 'Africa/Johannesburg';
  IF starts - now() < interval '24 hours' THEN
    pen := COALESCE((SELECT (value->>'amount')::numeric FROM public.platform_settings WHERE key='gig_penalty'), 500);
    UPDATE public.community_gigs SET status='open', secured_by=NULL, secured_name=NULL, secured_at=NULL, penalty_amount=penalty_amount+pen, penalty_reason='Late withdrawal (under 24 hours)' WHERE id=_gig;
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
  pen := COALESCE((SELECT (value->>'amount')::numeric FROM public.platform_settings WHERE key='gig_penalty'), 500);
  UPDATE public.community_gigs SET status='no_show', penalty_amount=penalty_amount+pen, penalty_reason='No-show / not delivered' WHERE id=_gig;
  RETURN pen;
END $$;

CREATE OR REPLACE FUNCTION public.complete_gig(_gig uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.community_gigs SET status='completed' WHERE id=_gig AND posted_by=auth.uid() AND status='secured';
$$;
GRANT EXECUTE ON FUNCTION public.secure_gig(uuid), public.withdraw_from_gig(uuid), public.report_gig_no_show(uuid), public.complete_gig(uuid) TO authenticated;