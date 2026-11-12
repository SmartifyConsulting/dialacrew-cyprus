ALTER TABLE public.productions ADD COLUMN passport_requirements text NOT NULL DEFAULT '';

-- Expose status only, never passport numbers, names, encryption keys or expiry dates.
CREATE FUNCTION public.crew_travel_status(p_ids text[], p_on date DEFAULT current_date)
RETURNS TABLE(crew_id text, passport_status text, featured_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id,
    CASE WHEN d.passport_number_enc IS NULL OR d.expiry_date IS NULL THEN 'missing'
         WHEN d.expiry_date < COALESCE(p_on,current_date) THEN 'expired' ELSE 'valid' END,
    p.spotlight_featured_at
  FROM public.crew_members c
  LEFT JOIN public.crew_passport_details d ON d.crew_id=c.id
  LEFT JOIN public.profiles p ON p.id=c.user_id
  WHERE c.id = ANY(p_ids[1:200]) AND (
    public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin') OR c.user_id=auth.uid()
  )
$$;
REVOKE ALL ON FUNCTION public.crew_travel_status(text[],date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_travel_status(text[],date) TO authenticated;
