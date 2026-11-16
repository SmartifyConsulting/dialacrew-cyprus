-- Proposed repair only: preserve booking protections while allowing a recorded negotiated reservation.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_booking_crew_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claiming boolean; negotiated boolean;
BEGIN
 IF public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
 claiming := OLD.crew_id IS NULL AND OLD.status='open' AND NEW.crew_id=public.my_crew_id() AND NEW.status='confirmed';
 negotiated := OLD.crew_id IS NULL AND OLD.status='open' AND NEW.crew_id=public.my_crew_id() AND NEW.status='pencil'
   AND EXISTS(SELECT 1 FROM public.gig_negotiations n WHERE n.booking_id=OLD.id AND n.crew_id=NEW.crew_id AND n.status='accepted' AND n.agreed_rate=NEW.crew_rate);
 IF NOT (claiming OR negotiated) THEN NEW.crew_id:=OLD.crew_id; END IF;
 NEW.production_id:=OLD.production_id; NEW.role:=OLD.role;
 IF NOT negotiated THEN NEW.crew_rate:=OLD.crew_rate; END IF;
 NEW.client_charge:=OLD.client_charge; NEW.days:=OLD.days;
 NEW.booking_date:=OLD.booking_date; NEW.call_time:=OLD.call_time; NEW.wrap_time:=OLD.wrap_time;
 NEW.pencil_priority:=OLD.pencil_priority; NEW.pencil_expires_at:=OLD.pencil_expires_at;
 NEW.created_by:=OLD.created_by; NEW.payment_status:=OLD.payment_status; NEW.client_approved:=OLD.client_approved;
 NEW.client_reviewed_at:=OLD.client_reviewed_at; NEW.cancellation_pct:=OLD.cancellation_pct; NEW.postponed_to:=OLD.postponed_to;
 NEW.travel_flight_cost:=OLD.travel_flight_cost; NEW.travel_visa_cost:=OLD.travel_visa_cost;
 NEW.travel_accommodation_cost:=OLD.travel_accommodation_cost; NEW.travel_food_cost:=OLD.travel_food_cost; NEW.travel_per_diem_rate:=OLD.travel_per_diem_rate;
 IF NOT (claiming OR negotiated OR (OLD.status IN ('pencil','awaiting_crew_confirmation') AND NEW.status IN ('confirmed','cancelled')) OR (OLD.status IN ('confirmed','in_progress') AND NEW.status='awaiting_review')) THEN NEW.status:=OLD.status; END IF;
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN NEW.cancelled_by:=auth.uid(); NEW.cancelled_at:=now(); NEW.cancelled_reason:=COALESCE(NEW.cancelled_reason,'Declined by crew'); END IF;
 RETURN NEW;
END $$;
-- Patch only the reservation statements; retain the installed MVP and participant checks.
DO $$ DECLARE definition text; old_block text; new_block text; BEGIN
 SELECT pg_get_functiondef('public.gig_negotiate(text,text,text,numeric,boolean)'::regprocedure) INTO definition;
 old_block := $old$   UPDATE public.bookings SET crew_id=p_crew_id,crew_rate=v_rate,status='pencil' WHERE id=p_booking_id;
   UPDATE public.gig_negotiations SET status='accepted',agreed_rate=v_rate,updated_at=now() WHERE id=n.id;$old$;
 new_block := $new$   UPDATE public.gig_negotiations SET status='accepted',agreed_rate=v_rate,updated_at=now() WHERE id=n.id;
   UPDATE public.bookings SET crew_id=p_crew_id,crew_rate=v_rate,status='pencil' WHERE id=p_booking_id RETURNING * INTO b;
   IF b.crew_id IS DISTINCT FROM p_crew_id OR b.crew_rate IS DISTINCT FROM v_rate OR b.status IS DISTINCT FROM 'pencil' THEN RAISE EXCEPTION 'The agreed booking could not be reserved; no agreement was saved'; END IF;$new$;
 IF position(old_block IN definition)=0 THEN RAISE EXCEPTION 'Review gig_negotiate before applying this repair'; END IF;
 EXECUTE replace(definition,old_block,new_block);
END $$;
COMMIT;
