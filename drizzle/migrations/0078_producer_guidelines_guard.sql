-- Align the existing guideline guard with the owning producer controls.
CREATE OR REPLACE FUNCTION public.guard_guidelines()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.post_rules IS DISTINCT FROM OLD.post_rules
      OR NEW.post_rules_mode IS DISTINCT FROM OLD.post_rules_mode
      OR NEW.post_rules_hidden IS DISTINCT FROM OLD.post_rules_hidden)
     AND NOT (
       public.has_role(auth.uid(), 'admin')
       OR (OLD.created_by = auth.uid() AND public.has_role(auth.uid(), 'producer'))
     ) THEN
    RAISE EXCEPTION 'Only the owning producer or an admin can change post rules';
  END IF;
  RETURN NEW;
END;
$$;
