CREATE TABLE IF NOT EXISTS public.production_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.production_types (name)
VALUES ('Commercial'), ('Film'), ('Television'), ('Photography'), ('Other')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.production_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_types_select" ON public.production_types;
CREATE POLICY "production_types_select" ON public.production_types FOR SELECT USING (true);

DROP POLICY IF EXISTS "production_types_insert" ON public.production_types;
CREATE POLICY "production_types_insert" ON public.production_types FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- A Crew Combo can be tagged to the production type it's meant for, so Select Crew Type can
-- surface the right combos for the production being crewed.
ALTER TABLE public.crew_groups
  ADD COLUMN IF NOT EXISTS production_type text;
