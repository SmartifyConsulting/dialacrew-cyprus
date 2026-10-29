DROP POLICY IF EXISTS "crew claim open gigs" ON public.bookings;
CREATE POLICY "crew claim open gigs" ON public.bookings FOR UPDATE TO authenticated
  USING (status = 'open'::booking_status AND crew_id IS NULL)
  WITH CHECK (crew_id = public.my_crew_id() AND public.my_crew_id() IS NOT NULL);

DROP POLICY IF EXISTS "open access" ON public.clients;
REVOKE ALL ON public.clients FROM anon;
CREATE POLICY "producers manage clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "open access" ON public.service_providers;
REVOKE ALL ON public.service_providers FROM anon;
CREATE POLICY "producers manage service providers" ON public.service_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "anyone reads legal docs" ON public.legal_documents;
CREATE POLICY "anyone reads active legal docs" ON public.legal_documents FOR SELECT TO anon, authenticated
  USING (active);