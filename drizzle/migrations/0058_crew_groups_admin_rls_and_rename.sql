-- Super Admin uses Admin ▸ Crew Type / Curated Crew too, but crew_groups and crew_group_members
-- only ever granted write access to the 'producer' role — an admin-only account got blocked by
-- RLS when creating a crew mix. Widen both policies to admin as well.
DROP POLICY IF EXISTS "producers manage crew groups" ON public.crew_groups;
CREATE POLICY "producers manage crew groups" ON public.crew_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "producers manage crew group members" ON public.crew_group_members;
CREATE POLICY "producers manage crew group members" ON public.crew_group_members
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));

-- "Default Crew Type" (seeded in 0051) reads better simply as "Default Crew" under Curated Crew.
UPDATE public.crew_groups SET name = 'Default Crew' WHERE name = 'Default Crew Type';
