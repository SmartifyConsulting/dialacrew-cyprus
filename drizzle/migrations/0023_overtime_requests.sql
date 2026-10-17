-- Overtime is requested by a producer. The crew member accepts (the clock starts) or declines (an optional reason).
CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  shift text NOT NULL DEFAULT 'day' CHECK (shift IN ('day', 'night')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  requested_by uuid NOT NULL DEFAULT auth.uid(),
  decline_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  accepted_at timestamptz,
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.overtime_requests TO authenticated;
GRANT ALL ON public.overtime_requests TO service_role;
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read overtime" ON public.overtime_requests FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers request overtime" ON public.overtime_requests FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id) AND requested_by = auth.uid() AND status = 'pending');
CREATE POLICY "crew respond to overtime" ON public.overtime_requests FOR UPDATE TO authenticated
  USING (status = 'pending' AND crew_id IN (SELECT c.id FROM public.crew_members c WHERE c.user_id = auth.uid()))
  WITH CHECK (status IN ('accepted', 'declined') AND crew_id IN (SELECT c.id FROM public.crew_members c WHERE c.user_id = auth.uid()));
CREATE POLICY "producers end overtime" ON public.overtime_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id))
  WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id));

CREATE OR REPLACE FUNCTION public.overtime_before_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'pending' THEN
    NEW.responded_at := now();
    IF NEW.status = 'accepted' THEN NEW.accepted_at := now(); END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS overtime_before_update ON public.overtime_requests;
CREATE TRIGGER overtime_before_update BEFORE UPDATE ON public.overtime_requests FOR EACH ROW EXECUTE FUNCTION public.overtime_before_update();

CREATE OR REPLACE FUNCTION public.notify_overtime() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE crew_uid uuid; prod_nm text; crew_nm text;
BEGIN
  SELECT c.user_id, c.name INTO crew_uid, crew_nm FROM public.crew_members c WHERE c.id = COALESCE(NEW.crew_id, OLD.crew_id);
  SELECT p.name INTO prod_nm FROM public.productions p WHERE p.id = COALESCE(NEW.production_id, OLD.production_id);
  IF TG_OP = 'INSERT' AND crew_uid IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, production_id, title, body)
    VALUES (crew_uid, NEW.production_id, 'Overtime requested', 'Your producer has asked for overtime on ' || prod_nm || '. Accept or decline it in the production.');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.requested_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, production_id, title, body)
    VALUES (NEW.requested_by, NEW.production_id, 'Overtime ' || NEW.status,
      coalesce(crew_nm, 'Crew member') || ' ' || NEW.status || ' overtime on ' || prod_nm ||
      CASE WHEN NEW.status = 'declined' AND NEW.decline_reason IS NOT NULL AND NEW.decline_reason <> '' THEN ': ' || NEW.decline_reason ELSE '' END || '.');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS overtime_notify_insert ON public.overtime_requests;
CREATE TRIGGER overtime_notify_insert AFTER INSERT ON public.overtime_requests FOR EACH ROW EXECUTE FUNCTION public.notify_overtime();
DROP TRIGGER IF EXISTS overtime_notify_update ON public.overtime_requests;
CREATE TRIGGER overtime_notify_update AFTER UPDATE ON public.overtime_requests FOR EACH ROW EXECUTE FUNCTION public.notify_overtime();

-- Checking out stops any running overtime clock.
CREATE OR REPLACE FUNCTION public.notify_attendance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE crew_uid uuid; crew_nm text; prod_nm text; prod_owner uuid;
BEGIN
  SELECT c.user_id, c.name INTO crew_uid, crew_nm FROM public.crew_members c WHERE c.id = NEW.crew_id;
  SELECT p.name, p.created_by INTO prod_nm, prod_owner FROM public.productions p WHERE p.id = NEW.production_id;
  IF NEW.kind = 'in' AND crew_uid IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, production_id, title, body)
    VALUES (crew_uid, NEW.production_id, 'Welcome on Set', 'You''ve checked in at ' || prod_nm || '. You are being tracked while on site.');
  ELSIF NEW.kind = 'out' THEN
    UPDATE public.site_wraps SET left_at = now() WHERE production_id = NEW.production_id AND crew_id = NEW.crew_id AND left_at IS NULL;
    UPDATE public.overtime_requests SET ended_at = now() WHERE production_id = NEW.production_id AND crew_id = NEW.crew_id AND status = 'accepted' AND ended_at IS NULL;
    IF crew_uid IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, production_id, title, body)
      VALUES (crew_uid, NEW.production_id, 'That''s a Wrap', 'You''ve checked out of ' || prod_nm || '. Your time on site is recorded up to now.');
    END IF;
    IF prod_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, production_id, title, body)
      VALUES (prod_owner, NEW.production_id, 'That''s a Wrap', coalesce(crew_nm, 'A crew member') || ' has checked out of ' || prod_nm || '.');
    END IF;
  END IF;
  RETURN NEW;
END $$;
