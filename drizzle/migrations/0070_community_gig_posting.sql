BEGIN;
DROP POLICY IF EXISTS "Crew post gigs" ON public.community_gigs;
CREATE POLICY "Crew and producers post gigs" ON public.community_gigs FOR INSERT TO authenticated WITH CHECK (
 posted_by=auth.uid() AND status='open' AND secured_by IS NULL AND
 (public.has_role(auth.uid(),'crew') OR public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin'))
);
COMMIT;
