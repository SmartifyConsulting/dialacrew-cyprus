-- Location fees: producer-only. Kept in their own table so crew who can read a production's locations never see them.
CREATE TABLE IF NOT EXISTS public.production_location_fees (
  location_id uuid PRIMARY KEY REFERENCES public.production_locations(id) ON DELETE CASCADE,
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  fee numeric NOT NULL DEFAULT 0 CHECK (fee >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_location_fees TO authenticated;
GRANT ALL ON public.production_location_fees TO service_role;
ALTER TABLE public.production_location_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers manage location fees" ON public.production_location_fees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id))
  WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id));

-- Photos taken or uploaded for a location. Visible to every site member.
CREATE TABLE IF NOT EXISTS public.production_location_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.production_locations(id) ON DELETE CASCADE,
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_location_photos TO authenticated;
GRANT ALL ON public.production_location_photos TO service_role;
ALTER TABLE public.production_location_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read location photos" ON public.production_location_photos FOR SELECT TO authenticated
  USING (public.is_site_member(production_id));
CREATE POLICY "site members add location photos" ON public.production_location_photos FOR INSERT TO authenticated
  WITH CHECK (public.is_site_member(production_id) AND uploaded_by = auth.uid());
CREATE POLICY "uploader or producer removes location photos" ON public.production_location_photos FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'producer'));
CREATE POLICY "site members reorder location photos" ON public.production_location_photos FOR UPDATE TO authenticated
  USING (public.is_site_member(production_id)) WITH CHECK (public.is_site_member(production_id));

-- Producers no longer confirm crew after they accept; anything left waiting is confirmed.
UPDATE public.bookings SET status = 'confirmed' WHERE status = 'awaiting_crew_confirmation';
