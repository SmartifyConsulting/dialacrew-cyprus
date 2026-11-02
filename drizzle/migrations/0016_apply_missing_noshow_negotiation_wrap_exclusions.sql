CREATE TABLE IF NOT EXISTS public.crew_no_shows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id text NOT NULL UNIQUE REFERENCES public.bookings(id),
 production_id text NOT NULL REFERENCES public.productions(id),
 crew_id text NOT NULL REFERENCES public.crew_members(id),
 reported_by uuid NOT NULL,
 occurred_on date NOT NULL,
 reported_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 replacement_booking_id text UNIQUE REFERENCES public.bookings(id)
);
CREATE INDEX IF NOT EXISTS crew_no_shows_active_idx ON public.crew_no_shows(crew_id,expires_at);
GRANT SELECT ON public.crew_no_shows TO authenticated;
GRANT ALL ON public.crew_no_shows TO service_role;
ALTER TABLE public.crew_no_shows ENABLE ROW LEVEL SECURITY;
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

CREATE TABLE public.gig_negotiations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id text NOT NULL REFERENCES public.bookings(id),
 production_id text NOT NULL REFERENCES public.productions(id),
 crew_id text NOT NULL REFERENCES public.crew_members(id),
 status text NOT NULL DEFAULT 'pending_producer' CHECK (status IN ('pending_producer','pending_crew','accepted','declined','withdrawn','closed')),
 latest_rate numeric NOT NULL CHECK (latest_rate > 0),
 latest_by text NOT NULL CHECK (latest_by IN ('crew','producer')),
 agreed_rate numeric,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(booking_id,crew_id)
);
CREATE TABLE public.gig_negotiation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 negotiation_id uuid NOT NULL REFERENCES public.gig_negotiations(id),
 production_id text NOT NULL REFERENCES public.productions(id),
 actor_id uuid NOT NULL,
 actor_role text NOT NULL CHECK (actor_role IN ('crew','producer')),
 action text NOT NULL CHECK (action IN ('counter','accept','decline','below_usual_acknowledged')),
 offered_rate numeric NOT NULL,
 usual_rate numeric,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gig_negotiations_production_idx ON public.gig_negotiations(production_id,status);
CREATE INDEX gig_negotiation_events_production_idx ON public.gig_negotiation_events(production_id,occurred_at DESC);
GRANT SELECT ON public.gig_negotiations, public.gig_negotiation_events TO authenticated;
GRANT ALL ON public.gig_negotiations, public.gig_negotiation_events TO service_role;
ALTER TABLE public.gig_negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_negotiation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "negotiation participants" ON public.gig_negotiations FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()) OR (public.has_role(auth.uid(),'producer') AND public.is_site_member(production_id)) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "negotiation event participants" ON public.gig_negotiation_events FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.gig_negotiations n WHERE n.id=negotiation_id AND (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=n.crew_id AND c.user_id=auth.uid()) OR (public.has_role(auth.uid(),'producer') AND public.is_site_member(n.production_id)) OR public.has_role(auth.uid(),'admin'))));
CREATE OR REPLACE FUNCTION public.gig_negotiate(p_booking_id text,p_crew_id text,p_action text,p_rate numeric DEFAULT NULL,p_ack_below_usual boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bookings%ROWTYPE; c public.crew_members%ROWTYPE; n public.gig_negotiations%ROWTYPE; v_role text; v_rate numeric; v_id uuid; v_usual numeric;
BEGIN
 SELECT * INTO b FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR b.status <> 'open' OR b.crew_id IS NOT NULL THEN RAISE EXCEPTION 'This gig is no longer available'; END IF;
 SELECT * INTO c FROM public.crew_members WHERE id=p_crew_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Crew profile not found'; END IF;
 IF c.user_id=auth.uid() AND public.has_role(auth.uid(),'crew') THEN v_role:='crew';
 ELSIF (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin')) AND public.is_site_member(b.production_id) THEN v_role:='producer';
 ELSE RAISE EXCEPTION 'Not authorized to negotiate this gig'; END IF;
 SELECT * INTO n FROM public.gig_negotiations WHERE booking_id=p_booking_id AND crew_id=p_crew_id FOR UPDATE;
 IF NOT FOUND THEN
   IF v_role <> 'crew' OR p_action <> 'counter' THEN RAISE EXCEPTION 'Crew must initiate negotiation'; END IF;
   IF p_rate IS NULL OR p_rate <= 0 THEN RAISE EXCEPTION 'Enter a valid rate'; END IF;
   INSERT INTO public.gig_negotiations(booking_id,production_id,crew_id,latest_rate,latest_by)
   VALUES(p_booking_id,b.production_id,p_crew_id,p_rate,'crew') RETURNING * INTO n;
 ELSE
   IF n.status NOT IN ('pending_producer','pending_crew') THEN RAISE EXCEPTION 'Negotiation is closed'; END IF;
   IF (v_role='producer' AND n.status<>'pending_producer') OR (v_role='crew' AND n.status<>'pending_crew') THEN
      RAISE EXCEPTION 'Waiting for the other party to respond'; END IF;
 END IF;
 v_usual := COALESCE(c.day_rate,0);
 IF p_action='counter' THEN
   IF p_rate IS NULL OR p_rate<=0 THEN RAISE EXCEPTION 'Enter a valid rate'; END IF;
   IF v_role='crew' AND v_usual>0 AND p_rate<v_usual AND NOT p_ack_below_usual THEN RAISE EXCEPTION 'Acknowledge the below-usual rate before offering it'; END IF;
   UPDATE public.gig_negotiations SET latest_rate=p_rate,latest_by=v_role,status=CASE WHEN v_role='crew' THEN 'pending_producer' ELSE 'pending_crew' END,updated_at=now() WHERE id=n.id;
   v_rate:=p_rate;
 ELSIF p_action='accept' THEN
   IF n.latest_by=v_role THEN RAISE EXCEPTION 'Cannot accept your own offer'; END IF;
   v_rate:=n.latest_rate;
   IF v_role='crew' AND v_usual>0 AND v_rate<v_usual AND NOT p_ack_below_usual THEN RAISE EXCEPTION 'You must acknowledge the rate is below your usual rate'; END IF;
   IF v_role='producer' AND v_usual>0 AND v_rate<v_usual AND NOT EXISTS(SELECT 1 FROM public.gig_negotiation_events WHERE negotiation_id=n.id AND action='below_usual_acknowledged' AND offered_rate=v_rate) THEN RAISE EXCEPTION 'Crew must acknowledge their below-usual rate before acceptance'; END IF;
   IF EXISTS(SELECT 1 FROM public.gig_negotiations WHERE booking_id=p_booking_id AND status='accepted') THEN RAISE EXCEPTION 'Gig already accepted'; END IF;
   UPDATE public.bookings SET crew_id=p_crew_id,crew_rate=v_rate,status='pencil' WHERE id=p_booking_id;
   UPDATE public.gig_negotiations SET status='accepted',agreed_rate=v_rate,updated_at=now() WHERE id=n.id;
   UPDATE public.gig_negotiations SET status='closed',updated_at=now() WHERE booking_id=p_booking_id AND id<>n.id AND status IN ('pending_producer','pending_crew');
 ELSIF p_action='decline' THEN
   v_rate:=n.latest_rate;
   UPDATE public.gig_negotiations SET status='declined',updated_at=now() WHERE id=n.id;
 ELSE RAISE EXCEPTION 'Unknown negotiation action'; END IF;
 INSERT INTO public.gig_negotiation_events(negotiation_id,production_id,actor_id,actor_role,action,offered_rate,usual_rate)
 VALUES(n.id,b.production_id,auth.uid(),v_role,p_action,v_rate,v_usual);
 IF ((p_action='accept' OR p_action='counter') AND v_role='crew' AND v_usual>0 AND v_rate<v_usual) THEN
  INSERT INTO public.gig_negotiation_events(negotiation_id,production_id,actor_id,actor_role,action,offered_rate,usual_rate)
  VALUES(n.id,b.production_id,auth.uid(),'crew','below_usual_acknowledged',v_rate,v_usual);
 END IF;
 RETURN n.id;
END $$;
REVOKE ALL ON FUNCTION public.gig_negotiate(text,text,text,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gig_negotiate(text,text,text,numeric,boolean) TO authenticated;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_fee numeric NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_hourly_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS crew_confirmed_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS crew_confirmed_by uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_calculated_at timestamptz;
CREATE OR REPLACE FUNCTION public.confirm_final_crew_invoice(p_invoice_id uuid,p_acknowledge_wrap boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.invoices%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=v.crew_id AND c.user_id=auth.uid()) THEN RAISE EXCEPTION 'Invoice not found or access denied'; END IF;
 IF v.status<>'draft' THEN RAISE EXCEPTION 'Invoice has already been issued'; END IF;
 IF v.wrap_calculated_at IS NULL THEN RAISE EXCEPTION 'Wrap-up and checkout must be recorded before issuing this invoice'; END IF;
 IF NOT p_acknowledge_wrap THEN RAISE EXCEPTION 'You must acknowledge the final wrap-up fee'; END IF;
 UPDATE public.invoices SET status='unpaid',crew_confirmed_at=now(),crew_confirmed_by=auth.uid() WHERE id=p_invoice_id;
END $$;
REVOKE ALL ON FUNCTION public.confirm_final_crew_invoice(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_final_crew_invoice(uuid,boolean) TO authenticated;

CREATE TABLE public.booking_day_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  excluded_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, excluded_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_day_exclusions TO authenticated;
GRANT ALL ON public.booking_day_exclusions TO service_role;
ALTER TABLE public.booking_day_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers manage booking day exclusions" ON public.booking_day_exclusions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'producer')) WITH CHECK (public.has_role(auth.uid(),'producer'));
CREATE POLICY "crew read own booking day exclusions" ON public.booking_day_exclusions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id()));