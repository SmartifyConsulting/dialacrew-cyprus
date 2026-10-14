ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS job_id text;

CREATE TABLE IF NOT EXISTS public.production_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_risks ENABLE ROW LEVEL SECURITY;

-- Project Risks are for the production team only (producers/admins) — never visible to crew or clients.
CREATE POLICY "producers manage project risks" ON public.production_risks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer'))
  WITH CHECK (public.has_role(auth.uid(), 'producer'));
