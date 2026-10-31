-- A booking spans a contiguous date range (booking_date .. booking_date + days - 1). By default a
-- booked crew member is needed on every day of that range; this table records the specific days
-- within the range where the producer has said they are NOT needed, without splitting or
-- shortening the booking itself (pay/rating/history all stay tied to the one booking).
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
