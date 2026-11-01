-- Per-production customizable role list for the Crew tab. Starts empty — the app shows the
-- standard 9 default roles when no rows exist yet, and only writes rows once a producer changes
-- the list (adds/removes a role), so most productions never need a row here at all.
CREATE TABLE IF NOT EXISTS public.production_crew_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  role text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(production_id, role)
);

ALTER TABLE public.production_crew_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site members read crew roles" ON public.production_crew_roles
  FOR SELECT TO authenticated USING (public.is_site_member(production_id));

CREATE POLICY "producers manage crew roles" ON public.production_crew_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer'))
  WITH CHECK (public.has_role(auth.uid(), 'producer'));
