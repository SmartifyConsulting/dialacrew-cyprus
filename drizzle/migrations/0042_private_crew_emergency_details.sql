-- Private emergency information. Never add medical details to public crew_members profiles.
CREATE TABLE public.crew_emergency_details (
 crew_id text PRIMARY KEY REFERENCES public.crew_members(id) ON DELETE CASCADE,
 physical_address text NOT NULL DEFAULT '',
 emergency_contact_name text NOT NULL DEFAULT '',
 emergency_contact_relationship text NOT NULL DEFAULT '',
 emergency_contact_phone text NOT NULL DEFAULT '',
 medical_aid_provider text NOT NULL DEFAULT '',
 medical_aid_number text NOT NULL DEFAULT '',
 medical_conditions text NOT NULL DEFAULT '',
 share_medical_with_producers boolean NOT NULL DEFAULT false,
 consented_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT medical_consent_consistency CHECK (NOT share_medical_with_producers OR consented_at IS NOT NULL)
);
ALTER TABLE public.crew_emergency_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_emergency_details FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.crew_emergency_details TO authenticated;
CREATE POLICY "crew owns private emergency information" ON public.crew_emergency_details FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()))
 WITH CHECK (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
-- Producers receive emergency information only via a restricted, consent-aware RPC.
CREATE OR REPLACE FUNCTION public.crew_emergency_for_production(p_crew_id text,p_production_id text)
RETURNS TABLE(physical_address text,emergency_contact_name text,emergency_contact_relationship text,emergency_contact_phone text,medical_aid_provider text,medical_aid_number text,medical_conditions text,medical_shared boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.crew_emergency_details%ROWTYPE; v_own boolean;
BEGIN
 v_own:=EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=p_crew_id AND c.user_id=auth.uid());
 IF NOT v_own AND NOT (
   (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin'))
   AND public.is_site_member(p_production_id)
   AND EXISTS(SELECT 1 FROM public.bookings b WHERE b.crew_id=p_crew_id AND b.production_id=p_production_id AND b.status NOT IN ('cancelled','open'))
 ) THEN RAISE EXCEPTION 'Emergency details are restricted to the crew member and their booked production team'; END IF;
 SELECT * INTO v FROM public.crew_emergency_details e WHERE e.crew_id=p_crew_id;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT v.physical_address,v.emergency_contact_name,v.emergency_contact_relationship,v.emergency_contact_phone,v.medical_aid_provider,v.medical_aid_number,
 CASE WHEN v_own OR v.share_medical_with_producers THEN v.medical_conditions ELSE NULL::text END,
 (v_own OR v.share_medical_with_producers);
END $$;
REVOKE ALL ON FUNCTION public.crew_emergency_for_production(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_emergency_for_production(text,text) TO authenticated;
