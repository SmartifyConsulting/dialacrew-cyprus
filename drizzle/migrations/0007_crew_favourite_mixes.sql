-- Favourite Mix: a producer-named group of crew members who work well together, reusable across productions.
CREATE TABLE IF NOT EXISTS public.crew_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crew_group_members (
  group_id uuid NOT NULL REFERENCES public.crew_groups(id) ON DELETE CASCADE,
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, crew_id)
);

ALTER TABLE public.crew_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "producers manage crew groups" ON public.crew_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer'))
  WITH CHECK (public.has_role(auth.uid(), 'producer'));

CREATE POLICY "producers manage crew group members" ON public.crew_group_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer'))
  WITH CHECK (public.has_role(auth.uid(), 'producer'));
