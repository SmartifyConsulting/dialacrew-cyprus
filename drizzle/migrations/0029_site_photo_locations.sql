-- Photos in the BTS Gallery can be grouped by the production location they were taken at.
ALTER TABLE public.site_photos
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.production_locations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS site_photos_location_id_idx ON public.site_photos(location_id);
