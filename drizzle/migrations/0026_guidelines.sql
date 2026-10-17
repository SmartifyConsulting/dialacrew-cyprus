-- Guidelines for a production's posts. Only platform admins can write them; producers can hide them from the job.
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS post_rules_hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_guidelines() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.post_rules IS DISTINCT FROM OLD.post_rules AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can change the guidelines';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS productions_guard_guidelines ON public.productions;
CREATE TRIGGER productions_guard_guidelines BEFORE UPDATE ON public.productions
  FOR EACH ROW EXECUTE FUNCTION public.guard_guidelines();
