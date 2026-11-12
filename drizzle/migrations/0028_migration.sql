DROP POLICY IF EXISTS "signed in read" ON public.productions;
CREATE POLICY "members read productions" ON public.productions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'producer'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_site_member(id)
  OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.production_id = productions.id AND (b.crew_id = public.my_crew_id() OR (b.status = 'open'::booking_status AND b.crew_id IS NULL)))
);

DROP POLICY IF EXISTS "rate cards readable" ON public.crew_rate_cards;
CREATE POLICY "rate cards read by owner or producers" ON public.crew_rate_cards FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'producer'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.crew_members c WHERE c.id = crew_rate_cards.crew_id AND c.user_id = auth.uid())
);

DROP POLICY IF EXISTS "authenticated read audio pricing" ON public.storyboard_audio_pricing;
CREATE POLICY "producers read audio pricing" ON public.storyboard_audio_pricing FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'producer'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));
