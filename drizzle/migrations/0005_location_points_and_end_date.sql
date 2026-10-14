ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS end_date date;

CREATE TABLE IF NOT EXISTS public.production_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  label text NOT NULL,
  address text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site members read location points" ON public.production_locations
  FOR SELECT TO authenticated USING (public.is_site_member(production_id));

CREATE POLICY "producers manage location points" ON public.production_locations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer'))
  WITH CHECK (public.has_role(auth.uid(), 'producer'));
