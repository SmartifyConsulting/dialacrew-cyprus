-- Producer-controlled final closure, immutable production records and booking-generated invoices.
-- Apply in Supabase SQL editor/migration runner; committing this file does not apply it.
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.crew_invoice_settings (
 crew_id text PRIMARY KEY REFERENCES public.crew_members(id) ON DELETE CASCADE,
 business_name text NOT NULL DEFAULT '', business_address text NOT NULL DEFAULT '',
 tax_number text NOT NULL DEFAULT '', bank_details text NOT NULL DEFAULT '',
 logo_url text NOT NULL DEFAULT '', accent_color text NOT NULL DEFAULT '#1f5cad',
 footer_text text NOT NULL DEFAULT '', invoice_prefix text NOT NULL DEFAULT 'INV',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crew_invoice_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.crew_invoice_settings TO authenticated;
CREATE POLICY "invoice settings owner read" ON public.crew_invoice_settings FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.crew_members c WHERE c.id = crew_id AND c.user_id = auth.uid()));
CREATE POLICY "invoice settings owner insert" ON public.crew_invoice_settings FOR INSERT TO authenticated
 WITH CHECK (EXISTS (SELECT 1 FROM public.crew_members c WHERE c.id = crew_id AND c.user_id = auth.uid()));
CREATE POLICY "invoice settings owner update" ON public.crew_invoice_settings FOR UPDATE TO authenticated
 USING (EXISTS (SELECT 1 FROM public.crew_members c WHERE c.id = crew_id AND c.user_id = auth.uid()))
 WITH CHECK (EXISTS (SELECT 1 FROM public.crew_members c WHERE c.id = crew_id AND c.user_id = auth.uid()));

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS service_description text NOT NULL DEFAULT '';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS issuer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_one_per_booking ON public.invoices(booking_id);

-- Only a producer/admin who is a production member may finalize. This RPC is the sole closure path.
CREATE OR REPLACE FUNCTION public.complete_production(p_production_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_owner uuid;
BEGIN
 IF NOT public.has_role(auth.uid(), 'producer') AND NOT public.has_role(auth.uid(), 'admin') THEN
   RAISE EXCEPTION 'Only producers can complete a production';
 END IF;
 SELECT name, created_by INTO v_name, v_owner FROM public.productions
  WHERE id = p_production_id AND completed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Production not found or already completed'; END IF;
 IF NOT public.is_site_member(p_production_id) THEN RAISE EXCEPTION 'Not authorized for this production'; END IF;
 -- Ensure invoices are created before closure, but do not silently mark them paid.
 UPDATE public.productions SET status = 'Completed', completed_at = now(), completed_by = auth.uid()
  WHERE id = p_production_id;
 INSERT INTO public.notifications(user_id, production_id, title, body)
 SELECT DISTINCT recipient, p_production_id, 'Production completed',
        v_name || ' has been completed and is now read-only.'
 FROM (
  SELECT c.user_id AS recipient FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
    WHERE b.production_id = p_production_id AND b.status <> 'cancelled'
  UNION SELECT v_owner
 ) recipients WHERE recipient IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.complete_production(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_production(text) TO authenticated;

-- Lock completion state against direct updates (including producers); require RPC.
CREATE OR REPLACE FUNCTION public.guard_production_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Completed production is read-only'; END IF;
 IF NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.completed_by IS DISTINCT FROM OLD.completed_by OR NEW.status = 'Completed' THEN
  IF current_setting('app.production_closing', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Complete a production using the authorized completion action';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_production_completion ON public.productions;
CREATE TRIGGER guard_production_completion BEFORE UPDATE OR DELETE ON public.productions
 FOR EACH ROW EXECUTE FUNCTION public.guard_production_completion();

-- Closure RPC sets a transaction-local authorization marker consumed by guard.
CREATE OR REPLACE FUNCTION public.complete_production(p_production_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_owner uuid;
BEGIN
 IF NOT (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin')) OR NOT public.is_site_member(p_production_id) THEN
  RAISE EXCEPTION 'Only authorized producers can complete this production';
 END IF;
 SELECT name, created_by INTO v_name, v_owner FROM public.productions
 WHERE id = p_production_id AND completed_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Production already completed or not found'; END IF;
 PERFORM set_config('app.production_closing', 'yes', true);
 UPDATE public.productions SET status='Completed', completed_at=now(), completed_by=auth.uid() WHERE id=p_production_id;
 PERFORM set_config('app.production_closing', 'no', true);
 INSERT INTO public.notifications(user_id, production_id, title, body)
 SELECT DISTINCT recipient, p_production_id, 'Production completed',
        v_name || ' has been completed and is now read-only.'
 FROM (SELECT c.user_id recipient FROM public.bookings b JOIN public.crew_members c ON c.id=b.crew_id
       WHERE b.production_id=p_production_id AND b.status <> 'cancelled'
       UNION SELECT v_owner) recipients WHERE recipient IS NOT NULL;
END $$;

-- Protect all mutable site records referencing a production. Notifications and acknowledgement
-- audit are intentionally exempt so users can still acknowledge the completion notice.
CREATE OR REPLACE FUNCTION public.reject_completed_production_changes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id text;
BEGIN
 v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.production_id ELSE NEW.production_id END;
 IF EXISTS (SELECT 1 FROM public.productions WHERE id=v_id AND completed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Production is completed and read-only';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT table_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name='production_id'
    AND table_name NOT IN ('notifications','notification_acknowledgement_audit','invoices')
 LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS lock_completed_production ON public.%I',r.table_name);
  EXECUTE format('CREATE TRIGGER lock_completed_production BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_completed_production_changes()',r.table_name);
 END LOOP;
END $$;
-- Invoices are immutable on completed productions as well, including payment status changes.
DROP TRIGGER IF EXISTS lock_completed_production ON public.invoices;
CREATE TRIGGER lock_completed_production BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
 FOR EACH ROW EXECUTE FUNCTION public.reject_completed_production_changes();

-- Generate one invoice at booking acceptance; copy rates, description and invoice branding.
CREATE OR REPLACE FUNCTION public.create_invoice_on_booking_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_settings jsonb; v_total numeric; v_tax numeric;
BEGIN
 IF NEW.crew_id IS NULL OR NEW.status NOT IN ('confirmed','in_progress','awaiting_review','payment_released','completed') THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.crew_id IS NOT DISTINCT FROM NEW.crew_id THEN RETURN NEW; END IF;
 SELECT to_jsonb(s) INTO v_settings FROM public.crew_invoice_settings s WHERE s.crew_id=NEW.crew_id;
 v_total := COALESCE(NEW.crew_rate,0)*COALESCE(NEW.days,1);
 INSERT INTO public.invoices(booking_id,crew_id,production_id,invoice_number,day_rate,days,overtime_amount,equipment_amount,subtotal,vat_rate,vat_amount,total,status,service_description,issuer_snapshot)
 VALUES (NEW.id,NEW.crew_id,NEW.production_id,'INV-'||upper(left(NEW.id::text,8)),COALESCE(NEW.crew_rate,0),COALESCE(NEW.days,1),0,0,v_total,0,0,v_total,'unpaid',COALESCE(NEW.role,'Service'),COALESCE(v_settings,'{}'::jsonb))
 ON CONFLICT (booking_id) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_on_booking_confirmation ON public.bookings;
CREATE TRIGGER invoice_on_booking_confirmation AFTER INSERT OR UPDATE OF status,crew_id ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.create_invoice_on_booking_confirmation();
