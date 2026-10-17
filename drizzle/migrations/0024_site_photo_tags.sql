-- Crew can tag crew members in a shared photo. Tags are visible to everyone on the production.
CREATE TABLE IF NOT EXISTS public.site_photo_tags (
  photo_id uuid NOT NULL REFERENCES public.site_photos(id) ON DELETE CASCADE,
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  tagged_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, crew_id)
);
GRANT SELECT, INSERT, DELETE ON public.site_photo_tags TO authenticated;
GRANT ALL ON public.site_photo_tags TO service_role;
ALTER TABLE public.site_photo_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read photo tags" ON public.site_photo_tags FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "site members tag photos" ON public.site_photo_tags FOR INSERT TO authenticated WITH CHECK (public.is_site_member(production_id) AND tagged_by = auth.uid());
CREATE POLICY "tagger or producer removes tags" ON public.site_photo_tags FOR DELETE TO authenticated USING (tagged_by = auth.uid() OR public.has_role(auth.uid(), 'producer'));
