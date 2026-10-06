-- Resume of 0008_booking_state_machine.sql after a partial run that only
-- created the booking_status enum. Everything below is identical to 0008
-- minus the CREATE TYPE line.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_date date,
  ADD COLUMN IF NOT EXISTS call_time time,
  ADD COLUMN IF NOT EXISTS wrap_time time,
  ADD COLUMN IF NOT EXISTS pencil_priority integer,
  ADD COLUMN IF NOT EXISTS pencil_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.bookings b SET booking_date = p.date FROM public.productions p
  WHERE b.production_id = p.id AND b.booking_date IS NULL;

ALTER TABLE public.bookings ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.bookings ALTER COLUMN status TYPE public.booking_status USING (
  CASE lower(status)
    WHEN 'pencil' THEN 'pencil'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'pending' THEN 'awaiting_crew_confirmation'
    WHEN 'declined' THEN 'cancelled'
    ELSE 'draft'
  END
)::public.booking_status;
ALTER TABLE public.bookings ALTER COLUMN status SET DEFAULT 'pencil';

CREATE UNIQUE INDEX bookings_one_active_per_crew_date ON public.bookings (crew_id, booking_date)
  WHERE status IN ('confirmed','in_progress','awaiting_review','payment_released','completed');

CREATE OR REPLACE FUNCTION public.bookings_before_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.booking_date IS NULL THEN
    SELECT date INTO NEW.booking_date FROM public.productions WHERE id = NEW.production_id;
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.status = 'pencil' THEN
    SELECT COALESCE(MAX(pencil_priority), 0) + 1 INTO NEW.pencil_priority
      FROM public.bookings WHERE crew_id = NEW.crew_id AND booking_date = NEW.booking_date AND status = 'pencil';
    NEW.pencil_expires_at := now() + interval '3 days';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_before_insert BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.bookings_before_insert();

CREATE OR REPLACE FUNCTION public.bookings_after_confirm() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE loser record;
BEGIN
  FOR loser IN
    SELECT id, created_by FROM public.bookings
    WHERE crew_id = NEW.crew_id AND booking_date = NEW.booking_date
      AND id <> NEW.id AND status IN ('pencil','awaiting_crew_confirmation')
  LOOP
    UPDATE public.bookings SET status = 'cancelled', cancelled_reason = 'Crew confirmed on a competing booking for this date', cancelled_at = now()
      WHERE id = loser.id;
    IF loser.created_by IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, production_id, title, body)
      VALUES (loser.created_by, NEW.production_id, 'Pencil lost', 'Your pencil for this crew member and date was cancelled because another booking was confirmed first.');
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_after_confirm AFTER UPDATE ON public.bookings FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION public.bookings_after_confirm();

CREATE OR REPLACE FUNCTION public.bookings_notify_crew() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid; pname text;
BEGIN
  SELECT user_id INTO uid FROM public.crew_members WHERE id = NEW.crew_id;
  IF uid IS NOT NULL THEN
    SELECT name INTO pname FROM public.productions WHERE id = NEW.production_id;
    INSERT INTO public.notifications (user_id, production_id, title, body)
    VALUES (uid, NEW.production_id,
      CASE NEW.status WHEN 'pencil' THEN 'New pencil request' WHEN 'confirmed' THEN 'Booking confirmed' ELSE 'Booking update' END,
      COALESCE(pname, 'A production') || ' — ' || NEW.role);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_notify_crew AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.bookings_notify_crew();

CREATE OR REPLACE FUNCTION public.guard_booking_crew_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN
    NEW.production_id := OLD.production_id; NEW.crew_id := OLD.crew_id; NEW.role := OLD.role;
    NEW.crew_rate := OLD.crew_rate; NEW.client_charge := OLD.client_charge; NEW.days := OLD.days;
    NEW.booking_date := OLD.booking_date; NEW.call_time := OLD.call_time; NEW.wrap_time := OLD.wrap_time;
    NEW.pencil_priority := OLD.pencil_priority; NEW.pencil_expires_at := OLD.pencil_expires_at;
    NEW.created_by := OLD.created_by;
    IF NOT (OLD.status IN ('pencil','awaiting_crew_confirmation') AND NEW.status IN ('confirmed','cancelled')) THEN
      NEW.status := OLD.status;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now();
      NEW.cancelled_reason := COALESCE(NEW.cancelled_reason, 'Declined by crew');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_guard_crew_update BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.guard_booking_crew_update();

CREATE POLICY "crew own bookings update" ON public.bookings FOR UPDATE TO authenticated
  USING (crew_id = public.my_crew_id()) WITH CHECK (crew_id = public.my_crew_id());

CREATE TABLE public.rate_negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL DEFAULT auth.uid(),
  proposed_rate numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','countered')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rate_negotiations TO authenticated;
GRANT ALL ON public.rate_negotiations TO service_role;
ALTER TABLE public.rate_negotiations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "booking parties read negotiations" ON public.rate_negotiations FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'producer')
  OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id())
);
CREATE POLICY "booking parties propose negotiations" ON public.rate_negotiations FOR INSERT TO authenticated WITH CHECK (
  proposed_by = auth.uid() AND (
    public.has_role(auth.uid(), 'producer')
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id())
  )
);
CREATE POLICY "booking parties respond negotiations" ON public.rate_negotiations FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'producer')
  OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id())
);

CREATE OR REPLACE FUNCTION public.apply_accepted_rate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    UPDATE public.bookings SET crew_rate = NEW.proposed_rate WHERE id = NEW.booking_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rate_negotiations_apply AFTER UPDATE ON public.rate_negotiations FOR EACH ROW EXECUTE FUNCTION public.apply_accepted_rate();

CREATE OR REPLACE FUNCTION public.is_site_member(_prod text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'producer') OR EXISTS (
  SELECT 1 FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
  WHERE b.production_id = _prod AND c.user_id = auth.uid() AND b.status <> 'cancelled') $$;

CREATE OR REPLACE FUNCTION public.site_members(_prod text)
RETURNS TABLE (crew_id text, name text, role text, department text, phone text, photo_url text, booking_status text, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT c.id, c.name, b.role, c.department, c.phone, c.photo_url, b.status::text, c.user_id
  FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
  WHERE b.production_id = _prod AND public.is_site_member(_prod) ORDER BY c.name $$;

CREATE OR REPLACE FUNCTION public.notify_site_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ DECLARE pname text;
BEGIN
  SELECT name INTO pname FROM public.productions WHERE id = NEW.production_id;
  INSERT INTO public.notifications (user_id, production_id, title, body)
  SELECT DISTINCT u, NEW.production_id, NEW.author_name || ' posted on ' || COALESCE(pname, 'a production'),
         left(COALESCE(NULLIF(NEW.body, ''), NEW.transcript, 'New attachment'), 140)
  FROM (
    SELECT c.user_id AS u FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
      WHERE b.production_id = NEW.production_id AND c.user_id IS NOT NULL AND b.status <> 'cancelled'
    UNION SELECT r.user_id FROM public.user_roles r WHERE r.role = 'producer'
  ) m WHERE u <> NEW.author_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.expire_pencils() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, production_id, title, body)
  SELECT b.created_by, b.production_id, 'Pencil expiring soon', 'Your pencil for ' || b.role || ' expires within 24 hours.'
  FROM public.bookings b
  WHERE b.status = 'pencil' AND b.created_by IS NOT NULL
    AND b.pencil_expires_at BETWEEN now() AND now() + interval '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n WHERE n.production_id = b.production_id
        AND n.user_id = b.created_by AND n.title = 'Pencil expiring soon' AND n.created_at > now() - interval '24 hours'
    );

  UPDATE public.bookings SET status = 'cancelled', cancelled_reason = 'Pencil expired after 3 days', cancelled_at = now()
  WHERE status = 'pencil' AND pencil_expires_at < now();
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  PERFORM cron.schedule('expire-pencils', '0 * * * *', 'SELECT public.expire_pencils()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — expire_pencils() created but not scheduled; call it manually or via an external scheduler.';
END $$;
