-- Producer-confirmed no-show: six-month profile history and immediate replacement gig.
CREATE TABLE IF NOT EXISTS public.crew_no_shows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id text NOT NULL UNIQUE REFERENCES public.bookings(id),
 production_id text NOT NULL REFERENCES public.productions(id),
 crew_id text NOT NULL REFERENCES public.crew_members(id),
 reported_by uuid NOT NULL REFERENCES auth.users(id),
 occurred_on date NOT NULL,
 reported_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 replacement_booking_id text UNIQUE REFERENCES public.bookings(id)
);
CREATE INDEX IF NOT EXISTS crew_no_shows_active_idx ON public.crew_no_shows(crew_id,expires_at);
ALTER TABLE public.crew_no_shows ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crew_no_shows TO authenticated;
CREATE POLICY "active no show profile history" ON public.crew_no_shows FOR SELECT TO authenticated
 USING (expires_at > now() OR reported_by = auth.uid());
CREATE OR REPLACE FUNCTION public.report_booking_no_show(p_booking_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings%ROWTYPE; prod public.productions%ROWTYPE; v_replacement text; v_day date;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin')) THEN
  RAISE EXCEPTION 'Only producers can report a no-show';
 END IF;
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR b.crew_id IS NULL OR b.status NOT IN ('confirmed','in_progress','awaiting_review') THEN
  RAISE EXCEPTION 'Only an assigned, active booking can be marked no-show';
 END IF;
 IF NOT public.is_site_member(b.production_id) THEN RAISE EXCEPTION 'Not authorized for this production'; END IF;
 SELECT * INTO prod FROM public.productions WHERE id=b.production_id;
 IF prod.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Production is completed'; END IF;
 IF EXISTS(SELECT 1 FROM public.crew_no_shows WHERE booking_id=b.id) THEN RAISE EXCEPTION 'No-show already reported'; END IF;
 IF EXISTS(SELECT 1 FROM public.site_attendance WHERE production_id=b.production_id AND crew_id=b.crew_id AND kind='in') THEN
  RAISE EXCEPTION 'Crew has a recorded check-in. Review attendance before reporting a no-show';
 END IF;
 v_day := COALESCE(b.booking_date,prod.date::date);
 IF v_day > CURRENT_DATE THEN RAISE EXCEPTION 'Cannot report a no-show before the booked date'; END IF;
 INSERT INTO public.bookings(production_id,crew_id,role,status,booking_date,call_time,wrap_time,crew_rate,client_charge,days)
 VALUES (b.production_id,NULL,b.role,'open',COALESCE(b.booking_date,CURRENT_DATE),b.call_time,b.wrap_time,b.crew_rate,b.client_charge,b.days)
 RETURNING id INTO v_replacement;
 INSERT INTO public.crew_no_shows(booking_id,production_id,crew_id,reported_by,occurred_on,expires_at,replacement_booking_id)
 VALUES (b.id,b.production_id,b.crew_id,auth.uid(),v_day,(v_day::timestamp + interval '6 months') AT TIME ZONE 'UTC',v_replacement);
 UPDATE public.bookings SET status='cancelled',cancelled_reason='Producer reported no-show',cancelled_at=now(),cancelled_by=auth.uid() WHERE id=b.id;
 RETURN v_replacement;
END $$;
REVOKE ALL ON FUNCTION public.report_booking_no_show(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_booking_no_show(text) TO authenticated;
