-- Crew can no longer create overtime requests; producers record overtime.
DROP POLICY IF EXISTS "crew create own requests" ON public.change_requests;
CREATE POLICY "crew create own requests" ON public.change_requests FOR INSERT TO authenticated WITH CHECK (
  kind <> 'Overtime'
  AND requested_by = auth.uid()
  AND booking_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id())
);

-- Wrap log: the producer wraps a crew member (time they stop being required, paid pack-down starts),
-- and left_at is set when they officially check out.
CREATE TABLE IF NOT EXISTS public.site_wraps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  wrapped_at timestamptz NOT NULL DEFAULT now(),
  wrapped_by uuid NOT NULL DEFAULT auth.uid(),
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.site_wraps TO authenticated;
GRANT ALL ON public.site_wraps TO service_role;
ALTER TABLE public.site_wraps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read wraps" ON public.site_wraps FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers record wraps" ON public.site_wraps FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id) AND wrapped_by = auth.uid());

-- Notifications: Welcome on Set, That's a Wrap (crew and producer), and the wrap call itself.
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
DROP TRIGGER IF EXISTS site_attendance_notify ON public.site_attendance;
CREATE TRIGGER site_attendance_notify AFTER INSERT ON public.site_attendance FOR EACH ROW EXECUTE FUNCTION public.notify_attendance();

CREATE OR REPLACE FUNCTION public.notify_wrap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE crew_uid uuid; prod_nm text;
BEGIN
  SELECT c.user_id INTO crew_uid FROM public.crew_members c WHERE c.id = NEW.crew_id;
  SELECT p.name INTO prod_nm FROM public.productions p WHERE p.id = NEW.production_id;
  IF crew_uid IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, production_id, title, body)
    VALUES (crew_uid, NEW.production_id, 'You''ve been wrapped', 'You are no longer required on ' || prod_nm || '. Pack-down time is paid until you check out.');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS site_wraps_notify ON public.site_wraps;
CREATE TRIGGER site_wraps_notify AFTER INSERT ON public.site_wraps FOR EACH ROW EXECUTE FUNCTION public.notify_wrap();
