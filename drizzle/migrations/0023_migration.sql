-- Storyboard Studio, Stage 3 (Animatic). Exported MP4s are kept persistently, same as every other
-- generated asset in Storyboard Studio.
CREATE TABLE IF NOT EXISTS public.storyboard_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  video_path text NOT NULL,
  duration_seconds numeric,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.storyboard_exports TO authenticated;
GRANT ALL ON public.storyboard_exports TO service_role;
ALTER TABLE public.storyboard_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read storyboard exports" ON public.storyboard_exports FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers create storyboard exports" ON public.storyboard_exports FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id) AND created_by = auth.uid());
CREATE POLICY "producers delete storyboard exports" ON public.storyboard_exports FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'producer'));

CREATE INDEX IF NOT EXISTS storyboard_exports_production_idx ON public.storyboard_exports (production_id, created_at DESC);
