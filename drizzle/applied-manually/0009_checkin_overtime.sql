-- Spec requires a 10m check-in radius; the previous default of 200m was a
-- placeholder. Only changes the default for new productions — existing
-- radii are left as producers set them.
ALTER TABLE public.productions ALTER COLUMN geofence_m SET DEFAULT 10;

-- Link overtime (and other change) requests to a specific booking so crew
-- can submit their own and producers can see which booking it's against.
ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS booking_id text REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id);

CREATE POLICY "crew read own requests" ON public.change_requests FOR SELECT TO authenticated USING (
  requested_by = auth.uid()
  OR (booking_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id()))
);
CREATE POLICY "crew create own requests" ON public.change_requests FOR INSERT TO authenticated WITH CHECK (
  requested_by = auth.uid()
  AND booking_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id())
);

-- Notify the producer who created the booking when crew submits an overtime
-- (or other change) request against it.
CREATE OR REPLACE FUNCTION public.notify_change_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid text; owner uuid;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    SELECT b.production_id, b.created_by INTO pid, owner FROM public.bookings b WHERE b.id = NEW.booking_id;
    IF owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, production_id, title, body)
      VALUES (owner, pid, NEW.kind || ' request', COALESCE(NEW.detail, '') || ' — ' || COALESCE(NEW.who, ''));
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_requests_notify AFTER INSERT ON public.change_requests FOR EACH ROW EXECUTE FUNCTION public.notify_change_request();

-- On-time %: check-ins ('in') compared against that booking's call_time,
-- allowing a 5-minute grace window. Returns null if there's no data yet.
CREATE OR REPLACE FUNCTION public.crew_on_time_pct(_crew_id text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(100.0 * count(*) FILTER (
      WHERE b.call_time IS NOT NULL AND a.created_at::time <= b.call_time + interval '5 minutes'
    ) / NULLIF(count(*) FILTER (WHERE b.call_time IS NOT NULL), 0), 0)
  FROM public.site_attendance a
  JOIN public.bookings b ON b.crew_id = a.crew_id AND b.production_id = a.production_id
  WHERE a.crew_id = _crew_id AND a.kind = 'in'
$$;
GRANT EXECUTE ON FUNCTION public.crew_on_time_pct(text) TO authenticated;
