-- Site photos shared by the crew. A photo can be grouped into a named portfolio (with a date); ungrouped photos sit under "Unsorted".
CREATE TABLE IF NOT EXISTS public.site_photo_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_date date,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_photo_groups TO authenticated;
GRANT ALL ON public.site_photo_groups TO service_role;
ALTER TABLE public.site_photo_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read photo groups" ON public.site_photo_groups FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "site members create photo groups" ON public.site_photo_groups FOR INSERT TO authenticated WITH CHECK (public.is_site_member(production_id) AND created_by = auth.uid());
CREATE POLICY "creator or producer edits photo groups" ON public.site_photo_groups FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'producer')) WITH CHECK (public.is_site_member(production_id));
CREATE POLICY "creator or producer deletes photo groups" ON public.site_photo_groups FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'producer'));

CREATE TABLE IF NOT EXISTS public.site_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.site_photo_groups(id) ON DELETE SET NULL,
  path text NOT NULL,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_photos TO authenticated;
GRANT ALL ON public.site_photos TO service_role;
ALTER TABLE public.site_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read site photos" ON public.site_photos FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "site members add site photos" ON public.site_photos FOR INSERT TO authenticated WITH CHECK (public.is_site_member(production_id) AND uploaded_by = auth.uid());
CREATE POLICY "site members sort site photos" ON public.site_photos FOR UPDATE TO authenticated USING (public.is_site_member(production_id)) WITH CHECK (public.is_site_member(production_id));
CREATE POLICY "uploader or producer deletes site photos" ON public.site_photos FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'producer'));
