DROP POLICY IF EXISTS "site members rate each other" ON public.crew_reviews;
CREATE POLICY "site members rate each other" ON public.crew_reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid() AND production_id IS NOT NULL AND public.is_site_member(production_id)
    AND crew_id IS DISTINCT FROM public.my_crew_id() AND NOT public.has_role(auth.uid(),'crew'));
DROP POLICY IF EXISTS "reviewers update own" ON public.crew_reviews;
CREATE POLICY "reviewers update own" ON public.crew_reviews FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() AND NOT public.has_role(auth.uid(),'crew'))
  WITH CHECK (reviewer_id = auth.uid() AND crew_id IS DISTINCT FROM public.my_crew_id() AND NOT public.has_role(auth.uid(),'crew'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS social_opt_in boolean NOT NULL DEFAULT false;