DROP POLICY IF EXISTS production_types_insert ON public.production_types;
CREATE POLICY production_types_insert ON public.production_types FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));