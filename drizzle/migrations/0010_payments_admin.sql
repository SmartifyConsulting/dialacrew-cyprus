-- ============ Payments / holding account / invoicing ============

CREATE TYPE public.payment_status AS ENUM (
  'not_required','payment_required','payment_received','funds_held',
  'awaiting_release','release_authorised','payment_released','payment_failed','payment_disputed'
);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS job_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS client_approved boolean,
  ADD COLUMN IF NOT EXISTS client_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_pct numeric,
  ADD COLUMN IF NOT EXISTS postponed_to date;

-- Extend the crew-side guard to also allow marking a job completed
-- (confirmed/in_progress -> awaiting_review), in addition to the
-- pencil accept/decline transitions from migration 0008.
CREATE OR REPLACE FUNCTION public.guard_booking_crew_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN
    NEW.production_id := OLD.production_id; NEW.crew_id := OLD.crew_id; NEW.role := OLD.role;
    NEW.crew_rate := OLD.crew_rate; NEW.client_charge := OLD.client_charge; NEW.days := OLD.days;
    NEW.booking_date := OLD.booking_date; NEW.call_time := OLD.call_time; NEW.wrap_time := OLD.wrap_time;
    NEW.pencil_priority := OLD.pencil_priority; NEW.pencil_expires_at := OLD.pencil_expires_at;
    NEW.created_by := OLD.created_by;
    NEW.payment_status := OLD.payment_status; NEW.client_approved := OLD.client_approved;
    NEW.client_reviewed_at := OLD.client_reviewed_at; NEW.cancellation_pct := OLD.cancellation_pct; NEW.postponed_to := OLD.postponed_to;
    IF (OLD.status IN ('pencil','awaiting_crew_confirmation') AND NEW.status IN ('confirmed','cancelled'))
       OR (OLD.status IN ('confirmed','in_progress') AND NEW.status = 'awaiting_review') THEN
      -- allowed transition, keep NEW.status
    ELSE
      NEW.status := OLD.status;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      NEW.cancelled_by := auth.uid(); NEW.cancelled_at := now();
      NEW.cancelled_reason := COALESCE(NEW.cancelled_reason, 'Declined by crew');
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Booking confirmed -> funding becomes required. Job marked completed (by
-- crew or producer) -> start the 24h client review window.
CREATE OR REPLACE FUNCTION public.bookings_payment_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' AND NEW.payment_status = 'not_required' THEN
    NEW.payment_status := 'payment_required';
  END IF;
  IF NEW.status = 'awaiting_review' AND OLD.status IS DISTINCT FROM 'awaiting_review' THEN
    NEW.job_completed_at := now();
    NEW.review_deadline := now() + interval '24 hours';
    IF NEW.payment_status IN ('payment_received','funds_held') THEN
      -- stays funds_held until client approves (manually or via auto-approve below)
      NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_payment_lifecycle BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.bookings_payment_lifecycle();

-- Producer marks funds received into the holding account.
CREATE OR REPLACE FUNCTION public.mark_payment_received(_booking text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN RAISE EXCEPTION 'Only producers can record payment'; END IF;
  UPDATE public.bookings SET payment_status = 'funds_held' WHERE id = _booking AND payment_status = 'payment_required';
  INSERT INTO public.audit_logs (user_id, action, record_table, record_id, new_value)
  VALUES (auth.uid(), 'payment_received', 'bookings', _booking, jsonb_build_object('payment_status', 'funds_held'));
END $$;

-- Client (or, until client-production linkage exists, a producer on the
-- client's behalf) approves a completed job, authorising release.
CREATE OR REPLACE FUNCTION public.approve_job(_booking text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bookings SET client_approved = true, client_reviewed_at = now(),
    payment_status = CASE WHEN payment_status = 'funds_held' THEN 'awaiting_release' ELSE payment_status END
  WHERE id = _booking AND status = 'awaiting_review';
  INSERT INTO public.audit_logs (user_id, action, record_table, record_id, new_value)
  VALUES (auth.uid(), 'job_approved', 'bookings', _booking, jsonb_build_object('client_approved', true));
END $$;

-- 24h auto-approval if the client/producer hasn't acted.
CREATE OR REPLACE FUNCTION public.auto_approve_reviews() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bookings SET client_approved = true, client_reviewed_at = now(), auto_approved = true,
    payment_status = CASE WHEN payment_status = 'funds_held' THEN 'awaiting_release' ELSE payment_status END
  WHERE status = 'awaiting_review' AND client_approved IS NULL AND review_deadline < now();
END $$;

-- Sequential, auditable invoice numbers.
CREATE SEQUENCE public.invoice_seq START 1;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL DEFAULT ('INV-' || lpad(nextval('public.invoice_seq')::text, 6, '0')),
  booking_id text NOT NULL REFERENCES public.bookings(id),
  crew_id text NOT NULL REFERENCES public.crew_members(id),
  production_id text NOT NULL REFERENCES public.productions(id),
  day_rate numeric NOT NULL DEFAULT 0,
  days integer NOT NULL DEFAULT 1,
  overtime_amount numeric NOT NULL DEFAULT 0,
  equipment_amount numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 15,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers read all invoices" ON public.invoices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "crew read own invoices" ON public.invoices FOR SELECT TO authenticated USING (crew_id = public.my_crew_id());

CREATE OR REPLACE FUNCTION public.generate_invoice(_booking text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; ot numeric; eq numeric; sub numeric; vat numeric; inv_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN RAISE EXCEPTION 'Only producers can generate invoices'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking;
  SELECT COALESCE(sum(amount), 0) INTO ot FROM public.change_requests WHERE booking_id = _booking AND kind = 'Overtime' AND state = 'Approved';
  SELECT COALESCE(sum(daily_fee * days), 0) INTO eq FROM public.booking_assets WHERE booking_id = _booking;
  sub := b.crew_rate * b.days + ot + eq;
  vat := round(sub * 0.15, 2);
  INSERT INTO public.invoices (booking_id, crew_id, production_id, day_rate, days, overtime_amount, equipment_amount, subtotal, vat_amount, total)
  VALUES (_booking, b.crew_id, b.production_id, b.crew_rate, b.days, ot, eq, sub, vat, sub + vat)
  RETURNING id INTO inv_id;
  RETURN inv_id;
END $$;

-- Producer releases payment: funds move from holding to crew, status
-- advances, and the invoice is generated.
CREATE OR REPLACE FUNCTION public.release_payment(_booking text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN RAISE EXCEPTION 'Only producers can release payment'; END IF;
  UPDATE public.bookings SET payment_status = 'payment_released', status = 'payment_released'
  WHERE id = _booking AND payment_status IN ('awaiting_release','release_authorised');
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking is not ready for payment release'; END IF;
  inv_id := public.generate_invoice(_booking);
  INSERT INTO public.audit_logs (user_id, action, record_table, record_id, new_value)
  VALUES (auth.uid(), 'payment_released', 'bookings', _booking, jsonb_build_object('invoice_id', inv_id));
  RETURN inv_id;
END $$;

-- Cancellation penalty thresholds, admin-configurable (the source spec text
-- was internally ambiguous between "within 24h" and "~24h before" both
-- implying different %, so these are tunable rather than hardcoded).
INSERT INTO public.platform_settings (key, value) VALUES
  ('cancellation_full_penalty_hours', '24'::jsonb),
  ('cancellation_partial_penalty_hours', '48'::jsonb),
  ('cancellation_partial_pct', '50'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cancel_booking(_booking text, _reason text, _postponed_to date DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bdate date; hours_until numeric; full_h numeric; partial_h numeric; partial_pct numeric; pct numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN RAISE EXCEPTION 'Only producers can cancel a booking'; END IF;
  SELECT booking_date INTO bdate FROM public.bookings WHERE id = _booking;
  IF _postponed_to IS NOT NULL THEN
    pct := 0;
  ELSE
    SELECT (value #>> '{}')::numeric INTO full_h FROM public.platform_settings WHERE key = 'cancellation_full_penalty_hours';
    SELECT (value #>> '{}')::numeric INTO partial_h FROM public.platform_settings WHERE key = 'cancellation_partial_penalty_hours';
    SELECT (value #>> '{}')::numeric INTO partial_pct FROM public.platform_settings WHERE key = 'cancellation_partial_pct';
    hours_until := EXTRACT(epoch FROM (bdate::timestamptz - now())) / 3600;
    pct := CASE WHEN hours_until <= full_h THEN 100 WHEN hours_until <= partial_h THEN partial_pct ELSE 0 END;
  END IF;
  UPDATE public.bookings SET status = 'cancelled', cancellation_pct = pct, cancelled_reason = _reason,
    cancelled_by = auth.uid(), cancelled_at = now(), postponed_to = _postponed_to
  WHERE id = _booking;
  INSERT INTO public.audit_logs (user_id, action, record_table, record_id, new_value)
  VALUES (auth.uid(), 'booking_cancelled', 'bookings', _booking, jsonb_build_object('cancellation_pct', pct, 'postponed_to', _postponed_to));
END $$;

-- ============ Admin: suspension, disputes, audit log ============

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

-- Suspended users lose every role-gated capability app-wide, since has_role()
-- is the single choke point almost every policy in this app already uses.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = _role AND NOT p.suspended
  )
$$;

CREATE POLICY "admin read all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin moderate reviews" ON public.crew_reviews FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read all bookings" ON public.bookings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read companies" ON public.companies FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin read company users" ON public.company_users FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL DEFAULT auth.uid(),
  amount_disputed numeric NOT NULL DEFAULT 0,
  description text NOT NULL,
  evidence text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','rejected')),
  admin_decision text,
  resolution text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "booking parties read disputes" ON public.disputes FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'producer')
  OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id())
);
CREATE POLICY "booking parties open disputes" ON public.disputes FOR INSERT TO authenticated WITH CHECK (
  opened_by = auth.uid() AND (
    public.has_role(auth.uid(), 'producer')
    OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id())
  )
);
CREATE POLICY "admin resolve disputes" ON public.disputes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  record_table text NOT NULL,
  record_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read audit log" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "log own actions" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.log_booking_status_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_logs (user_id, action, record_table, record_id, old_value, new_value)
    VALUES (auth.uid(), 'booking_status_change', 'bookings', NEW.id, jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_audit AFTER UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.log_booking_status_change();

-- Resolving a dispute leaves an audit trail too.
CREATE OR REPLACE FUNCTION public.log_dispute_resolution() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('resolved','rejected') THEN
    INSERT INTO public.audit_logs (user_id, action, record_table, record_id, old_value, new_value)
    VALUES (auth.uid(), 'dispute_resolved', 'disputes', NEW.id::text, jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status, 'resolution', NEW.resolution));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER disputes_audit AFTER UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION public.log_dispute_resolution();

-- Best-effort hourly schedule for auto-approval, alongside the existing
-- expire-pencils job from migration 0008.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
  PERFORM cron.schedule('auto-approve-reviews', '15 * * * *', 'SELECT public.auto_approve_reviews()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — auto_approve_reviews() created but not scheduled; call it manually or via an external scheduler.';
END $$;
