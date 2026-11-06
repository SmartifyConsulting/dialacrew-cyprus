-- Storyboard Studio, Stage 2 (Sound Design mode). Audio cues attach to a shot (or to the whole
-- storyboard when shot_id is null, e.g. a scene-wide music bed) and live alongside the generation
-- log already created in Stage 1.

ALTER TABLE public.storyboard_generations DROP CONSTRAINT IF EXISTS storyboard_generations_kind_check;
ALTER TABLE public.storyboard_generations ADD CONSTRAINT storyboard_generations_kind_check
  CHECK (kind IN ('image', 'music', 'sfx', 'ambience', 'narration'));

CREATE TABLE IF NOT EXISTS public.storyboard_audio_cues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  shot_id uuid REFERENCES public.storyboard_shots(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('music', 'sfx', 'ambience', 'narration', 'upload')),
  label text NOT NULL DEFAULT '',
  prompt text, -- null for uploads
  audio_path text,
  duration_seconds numeric,
  start_offset_seconds numeric NOT NULL DEFAULT 0, -- position on this cue's track lane
  volume numeric NOT NULL DEFAULT 1 CHECK (volume >= 0 AND volume <= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'generated', 'failed')),
  generation_error text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storyboard_audio_cues TO authenticated;
GRANT ALL ON public.storyboard_audio_cues TO service_role;
ALTER TABLE public.storyboard_audio_cues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read audio cues" ON public.storyboard_audio_cues FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers create audio cues" ON public.storyboard_audio_cues FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id));
CREATE POLICY "producers edit audio cues" ON public.storyboard_audio_cues FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'producer')) WITH CHECK (public.is_site_member(production_id));
CREATE POLICY "producers delete audio cues" ON public.storyboard_audio_cues FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'producer'));

-- Every past generated take for a cue, so regenerating doesn't destroy the previous result — the
-- producer can listen back and restore an earlier version.
CREATE TABLE IF NOT EXISTS public.storyboard_audio_cue_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cue_id uuid NOT NULL REFERENCES public.storyboard_audio_cues(id) ON DELETE CASCADE,
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  audio_path text NOT NULL,
  prompt text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.storyboard_audio_cue_versions TO authenticated;
GRANT ALL ON public.storyboard_audio_cue_versions TO service_role;
ALTER TABLE public.storyboard_audio_cue_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read audio cue versions" ON public.storyboard_audio_cue_versions FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "server logs audio cue versions" ON public.storyboard_audio_cue_versions FOR INSERT TO authenticated WITH CHECK (public.is_site_member(production_id) AND created_by = auth.uid());

CREATE INDEX IF NOT EXISTS storyboard_audio_cues_production_idx ON public.storyboard_audio_cues (production_id, kind, sort_order);
CREATE INDEX IF NOT EXISTS storyboard_audio_cue_versions_cue_idx ON public.storyboard_audio_cue_versions (cue_id, created_at DESC);
