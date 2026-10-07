-- Open gigs: a producer can post a booking with no specific crew member
-- assigned (crew_id NULL, status='open'); any crew member can browse and
-- claim it first-come-first-served. Location stays on the production
-- (name/address/lat/long), which already supports anywhere in the world.

ALTER TABLE public.bookings ALTER COLUMN crew_id DROP NOT NULL;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_crew_id_or_open CHECK (crew_id IS NOT NULL OR status = 'open');

-- Pencil-priority logic only applies once a specific crew member is pencilled.
CREATE OR REPLACE FUNCTION public.bookings_before_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.booking_date IS NULL THEN
    SELECT date INTO NEW.booking_date FROM public.productions WHERE id = NEW.production_id;
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.status = 'pencil' AND NEW.crew_id IS NOT NULL THEN
    SELECT COALESCE(MAX(pencil_priority), 0) + 1 INTO NEW.pencil_priority
      FROM public.bookings WHERE crew_id = NEW.crew_id AND booking_date = NEW.booking_date AND status = 'pencil';
    NEW.pencil_expires_at := now() + interval '3 days';
  END IF;
  RETURN NEW;
END $$;

-- Extend the crew-side guard: claiming an open gig (crew_id NULL -> own id,
-- status open -> confirmed) is now also an allowed self-service transition.
CREATE OR REPLACE FUNCTION public.guard_booking_crew_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claiming boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN
    claiming := (OLD.crew_id IS NULL AND OLD.status = 'open' AND NEW.crew_id = public.my_crew_id() AND NEW.status = 'confirmed');
    IF NOT claiming THEN
      NEW.crew_id := OLD.crew_id;
    END IF;
    NEW.production_id := OLD.production_id; NEW.role := OLD.role;
    NEW.crew_rate := OLD.crew_rate; NEW.client_charge := OLD.client_charge; NEW.days := OLD.days;
    NEW.booking_date := OLD.booking_date; NEW.call_time := OLD.call_time; NEW.wrap_time := OLD.wrap_time;
    NEW.pencil_priority := OLD.pencil_priority; NEW.pencil_expires_at := OLD.pencil_expires_at;
    NEW.created_by := OLD.created_by;
    NEW.payment_status := OLD.payment_status; NEW.client_approved := OLD.client_approved;
    NEW.client_reviewed_at := OLD.client_reviewed_at; NEW.cancellation_pct := OLD.cancellation_pct; NEW.postponed_to := OLD.postponed_to;
    IF NOT (
      claiming
      OR (OLD.status IN ('pencil','awaiting_crew_confirmation') AND NEW.status IN ('confirmed','cancelled'))
      OR (OLD.status IN ('confirmed','in_progress') AND NEW.status = 'awaiting_review')
    ) THEN
      NEW.status := OLD.status;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now();
      NEW.cancelled_reason := COALESCE(NEW.cancelled_reason, 'Declined by crew');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE POLICY "crew browse open gigs" ON public.bookings FOR SELECT TO authenticated USING (status = 'open' AND crew_id IS NULL);
CREATE POLICY "crew claim open gigs" ON public.bookings FOR UPDATE TO authenticated
  USING (status = 'open' AND crew_id IS NULL) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.claim_gig(_booking text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE my_id text;
BEGIN
  SELECT public.my_crew_id() INTO my_id;
  IF my_id IS NULL THEN RAISE EXCEPTION 'Only a crew profile can claim a gig'; END IF;
  UPDATE public.bookings SET crew_id = my_id, status = 'confirmed'
  WHERE id = _booking AND status = 'open' AND crew_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This gig is no longer available'; END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_gig(text) TO authenticated;

-- Open-gig browse listing with production location, for distance/location
-- filtering client-side. SECURITY DEFINER so crew can see the production
-- name/location without needing broader productions access.
CREATE OR REPLACE FUNCTION public.open_gigs()
RETURNS TABLE (id text, role text, days integer, crew_rate numeric, booking_date date, call_time time, production_id text, production_name text, location text, address text, latitude double precision, longitude double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.role, b.days, b.crew_rate, b.booking_date, b.call_time, p.id, p.name, p.location, p.address, p.latitude, p.longitude
  FROM public.bookings b JOIN public.productions p ON p.id = b.production_id
  WHERE b.status = 'open' AND b.crew_id IS NULL
  ORDER BY b.booking_date NULLS LAST
$$;
GRANT EXECUTE ON FUNCTION public.open_gigs() TO authenticated;
