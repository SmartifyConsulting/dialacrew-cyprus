-- Per-booking explicit acceptance of the current published crew terms.
-- The acceptance record is independent of profile-level or prior-job agreements.
CREATE TABLE IF NOT EXISTS public.booking_terms_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id text NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
 production_id text NOT NULL REFERENCES public.productions(id),
 crew_id text NOT NULL REFERENCES public.crew_members(id),
 accepted_by uuid NOT NULL REFERENCES auth.users(id),
 terms_version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT one_acceptance_per_booking UNIQUE (booking_id)
);
CREATE INDEX IF NOT EXISTS booking_terms_acceptances_production_idx
 ON public.booking_terms_acceptances(production_id, accepted_at DESC);
ALTER TABLE public.booking_terms_acceptances ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.booking_terms_acceptances TO authenticated;
CREATE POLICY "crew can view own job terms acceptance"
 ON public.booking_terms_acceptances FOR SELECT TO authenticated
 USING (accepted_by = auth.uid() OR public.is_site_member(production_id));

-- Client never supplies acceptance identity or timestamp; both are captured by Postgres.
CREATE OR REPLACE FUNCTION public.accept_booking_with_terms(p_booking_id text, p_terms_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_booking public.bookings%ROWTYPE; v_crew text;
BEGIN
 IF p_terms_version IS DISTINCT FROM 'dialacrew-terms-2026-10' THEN
  RAISE EXCEPTION 'Terms version has changed. Refresh and review the current terms';
 END IF;
 SELECT id INTO v_crew FROM public.crew_members WHERE user_id=auth.uid();
 SELECT * INTO v_booking FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.crew_id IS DISTINCT FROM v_crew THEN
  RAISE EXCEPTION 'Booking not found or not assigned to this crew member';
 END IF;
 IF v_booking.status NOT IN ('pencil','awaiting_crew_confirmation') THEN
  RAISE EXCEPTION 'This booking cannot be accepted in its current status';
 END IF;
 IF EXISTS(SELECT 1 FROM public.productions WHERE id=v_booking.production_id AND completed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'This production is completed and read-only';
 END IF;
 INSERT INTO public.booking_terms_acceptances(booking_id,production_id,crew_id,accepted_by,terms_version)
 VALUES (v_booking.id,v_booking.production_id,v_booking.crew_id,auth.uid(),p_terms_version);
 UPDATE public.bookings SET status='confirmed' WHERE id=p_booking_id;
END $$;
REVOKE ALL ON FUNCTION public.accept_booking_with_terms(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_booking_with_terms(text,text) TO authenticated;

-- Claiming an open gig is also an acceptance and must be atomic with terms recording.
CREATE OR REPLACE FUNCTION public.claim_gig_with_terms(p_booking_id text, p_terms_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_booking public.bookings%ROWTYPE; v_crew text;
BEGIN
 IF p_terms_version IS DISTINCT FROM 'dialacrew-terms-2026-10' THEN
  RAISE EXCEPTION 'Terms version has changed. Refresh and review the current terms';
 END IF;
 SELECT id INTO v_crew FROM public.crew_members WHERE user_id=auth.uid();
 IF v_crew IS NULL THEN RAISE EXCEPTION 'Crew profile required'; END IF;
 SELECT * INTO v_booking FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status <> 'open' THEN RAISE EXCEPTION 'Gig is no longer available'; END IF;
 IF EXISTS(SELECT 1 FROM public.productions WHERE id=v_booking.production_id AND completed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'This production is completed and read-only';
 END IF;
 -- Existing claim_gig retains its own eligibility and booking checks.
 PERFORM public.claim_gig(p_booking_id);
 INSERT INTO public.booking_terms_acceptances(booking_id,production_id,crew_id,accepted_by,terms_version)
 VALUES (v_booking.id,v_booking.production_id,v_crew,auth.uid(),p_terms_version);
END $$;
REVOKE ALL ON FUNCTION public.claim_gig_with_terms(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_gig_with_terms(text,text) TO authenticated;

-- Forbid crew-side confirmation that bypasses the recorded per-job agreement.
CREATE OR REPLACE FUNCTION public.require_terms_before_crew_confirmation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status='confirmed' AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (SELECT 1 FROM public.crew_members c WHERE c.id=NEW.crew_id AND c.user_id=auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.booking_terms_acceptances a WHERE a.booking_id=NEW.id AND a.accepted_by=auth.uid()) THEN
   RAISE EXCEPTION 'Review and accept the terms for this booking before confirming';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS require_terms_before_crew_confirmation ON public.bookings;
CREATE TRIGGER require_terms_before_crew_confirmation BEFORE UPDATE OF status ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.require_terms_before_crew_confirmation();
