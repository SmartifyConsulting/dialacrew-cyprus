-- Storyboard Studio, Stage 1 (Illustrate mode only). Scene/shot breakdown plus AI-generated graphite
-- pencil storyboard illustrations, one storyboard per production. Sound Design and Animatic modes
-- (Stage 2/3) will extend storyboard_shots (audio cues, timing) rather than replace this table, so
-- shot identity/numbering/description stays the single shared source of truth across all three modes.

CREATE TABLE IF NOT EXISTS public.storyboard_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  scene_number integer NOT NULL DEFAULT 1,
  shot_number integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  duration_seconds numeric NOT NULL DEFAULT 3,
  image_path text, -- storage path of the current graphite illustration, once generated
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'generated', 'approved', 'failed')),
  generation_error text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storyboard_shots TO authenticated;
GRANT ALL ON public.storyboard_shots TO service_role;
ALTER TABLE public.storyboard_shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read storyboard shots" ON public.storyboard_shots FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers create storyboard shots" ON public.storyboard_shots FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id));
CREATE POLICY "producers edit storyboard shots" ON public.storyboard_shots FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'producer')) WITH CHECK (public.is_site_member(production_id));
CREATE POLICY "producers delete storyboard shots" ON public.storyboard_shots FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'producer'));

-- Every AI image generation call, so cost is attributable per production (and ready for Stage 2/3's
-- music/SFX/narration calls to log into the same table with a different kind).
CREATE TABLE IF NOT EXISTS public.storyboard_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.storyboard_shots(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'music', 'sfx', 'narration')),
  provider text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'failed')),
  cost_usd numeric,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.storyboard_generations TO authenticated;
GRANT ALL ON public.storyboard_generations TO service_role;
ALTER TABLE public.storyboard_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers read storyboard generation log" ON public.storyboard_generations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id));
CREATE POLICY "server logs storyboard generations" ON public.storyboard_generations FOR INSERT TO authenticated WITH CHECK (public.is_site_member(production_id) AND created_by = auth.uid());

CREATE INDEX IF NOT EXISTS storyboard_shots_production_sort_idx ON public.storyboard_shots (production_id, sort_order);
CREATE INDEX IF NOT EXISTS storyboard_generations_production_idx ON public.storyboard_generations (production_id, created_at DESC);
