-- Global default role list: what a new production's "Crew Role Required" list starts with,
-- editable from Admin's Crew Types screen instead of being hardcoded in the app.
CREATE TABLE IF NOT EXISTS public.default_crew_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text UNIQUE NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.default_crew_roles (role, sort_order)
VALUES
  ('Director', 0), ('Cast', 1), ('Artist', 2), ('Director of Photography', 3), ('Focus Puller', 4),
  ('Gaffer', 5), ('Art Department', 6), ('Wardrobe', 7), ('Make-Up', 8), ('Catering', 9), ('Production Assistant', 10)
ON CONFLICT (role) DO NOTHING;

ALTER TABLE public.default_crew_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads default crew roles" ON public.default_crew_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "producers manage default crew roles" ON public.default_crew_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));
