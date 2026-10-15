-- Crew members must never be able to rate anyone — only the production team (producer/admin) rates crew.
-- 0004 let any site member insert/update a review for a co-worker; replace it with a producer/admin-only policy.

DROP POLICY IF EXISTS "site members rate each other" ON public.crew_reviews;
DROP POLICY IF EXISTS "reviewers update own" ON public.crew_reviews;

CREATE POLICY "only producers rate crew" ON public.crew_reviews
  FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid() AND (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "only producers update their own ratings" ON public.crew_reviews
  FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() AND (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin')))
  WITH CHECK (reviewer_id = auth.uid() AND (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin')));
