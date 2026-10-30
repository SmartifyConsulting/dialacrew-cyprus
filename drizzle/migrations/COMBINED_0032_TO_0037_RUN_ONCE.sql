-- Combined migrations 0032-0037. Review on a staging database before applying.
-- Run once, in order. This is not an idempotent migration runner.


-- ===== 0032_notification_acknowledgements_audit =====
-- Persistent, server-verified notification acknowledgements and audit evidence.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS public.notification_acknowledgement_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE RESTRICT,
  production_id text REFERENCES public.productions(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  actor_name text NOT NULL,
  activity_type text NOT NULL DEFAULT 'notification_acknowledged',
  notification_title text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_ack_audit_production_time_idx
 ON public.notification_acknowledgement_audit (production_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notification_ack_audit_once_idx
 ON public.notification_acknowledgement_audit (notification_id);
ALTER TABLE public.notification_acknowledgement_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.notification_acknowledgement_audit TO authenticated;
CREATE POLICY "production members view acknowledgement audit"
 ON public.notification_acknowledgement_audit FOR SELECT TO authenticated
 USING (production_id IS NOT NULL AND public.is_site_member(production_id));

-- Acknowledge through a controlled RPC rather than allowing client-supplied timestamps/identities.
CREATE OR REPLACE FUNCTION public.acknowledge_notification(p_notification_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_notification public.notifications%ROWTYPE; v_name text;
BEGIN
  SELECT * INTO v_notification FROM public.notifications
   WHERE id = p_notification_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification not found or access denied'; END IF;
  IF v_notification.acknowledged_at IS NOT NULL THEN RETURN; END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  UPDATE public.notifications
     SET acknowledged_at = now(), acknowledged_by = auth.uid(), read = true
   WHERE id = p_notification_id;
  INSERT INTO public.notification_acknowledgement_audit
    (notification_id, production_id, actor_id, actor_name, notification_title)
  VALUES (p_notification_id, v_notification.production_id, auth.uid(),
          COALESCE(NULLIF(v_name, ''), auth.uid()::text), v_notification.title);
END $$;
REVOKE ALL ON FUNCTION public.acknowledge_notification(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acknowledge_notification(uuid) TO authenticated;


-- ===== 0033_production_closure_crew_invoices =====
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

-- Lock completion state against direct updates (including producers); require RPC.
CREATE OR REPLACE FUNCTION public.guard_production_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Completed production is read-only'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 IF TG_OP = 'UPDATE' AND (NEW.completed_at IS DISTINCT FROM OLD.completed_at OR NEW.completed_by IS DISTINCT FROM OLD.completed_by OR NEW.status = 'Completed') THEN
  IF current_setting('app.production_closing', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Complete a production using the authorized completion action';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
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
DECLARE v_settings jsonb; v_total numeric; v_equipment numeric;
BEGIN
 IF NEW.crew_id IS NULL OR NEW.status NOT IN ('confirmed','in_progress','awaiting_review','payment_released','completed') THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.crew_id IS NOT DISTINCT FROM NEW.crew_id THEN RETURN NEW; END IF;
 SELECT to_jsonb(s) INTO v_settings FROM public.crew_invoice_settings s WHERE s.crew_id=NEW.crew_id;
 SELECT COALESCE(sum(daily_fee * days),0) INTO v_equipment FROM public.booking_assets WHERE booking_id=NEW.id;
 v_total := COALESCE(NEW.crew_rate,0)*COALESCE(NEW.days,1);
 INSERT INTO public.invoices(booking_id,crew_id,production_id,invoice_number,day_rate,days,overtime_amount,equipment_amount,subtotal,vat_rate,vat_amount,total,status,service_description,issuer_snapshot)
 VALUES (NEW.id,NEW.crew_id,NEW.production_id,'INV-'||upper(left(NEW.id::text,8)),COALESCE(NEW.crew_rate,0),COALESCE(NEW.days,1),0,v_equipment,v_total+v_equipment,0,0,v_total+v_equipment,'unpaid',COALESCE(NEW.role,'Service'),COALESCE(v_settings,'{}'::jsonb))
 ON CONFLICT (booking_id) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_on_booking_confirmation ON public.bookings;
CREATE TRIGGER invoice_on_booking_confirmation AFTER INSERT OR UPDATE OF status,crew_id ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.create_invoice_on_booking_confirmation();


-- ===== 0034_generated_job_id_external_reference =====
-- Immutable, database-generated Job ID; optional external production reference.
CREATE SEQUENCE IF NOT EXISTS public.production_job_number_seq;
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS external_ref text;

-- Move the sequence beyond existing generated-style IDs, if any.
SELECT setval('public.production_job_number_seq',
  GREATEST(1, COALESCE((SELECT max(substring(job_id from '^JOB-([0-9]+)$')::bigint)
    FROM public.productions WHERE job_id ~ '^JOB-[0-9]+$'), 0) + 1), false);

-- Assign a Job ID to older records that were created without one.
UPDATE public.productions SET job_id = 'JOB-' || lpad(nextval('public.production_job_number_seq')::text, 6, '0')
 WHERE job_id IS NULL OR btrim(job_id) = '';

CREATE OR REPLACE FUNCTION public.assign_production_job_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   NEW.job_id := 'JOB-' || lpad(nextval('public.production_job_number_seq')::text, 6, '0');
 ELSIF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
   RAISE EXCEPTION 'Job ID is generated automatically and cannot be changed';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assign_production_job_id ON public.productions;
CREATE TRIGGER assign_production_job_id BEFORE INSERT OR UPDATE ON public.productions
 FOR EACH ROW EXECUTE FUNCTION public.assign_production_job_id();

ALTER TABLE public.productions ALTER COLUMN job_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS production_job_id_unique ON public.productions(job_id);
COMMENT ON COLUMN public.productions.external_ref IS 'Optional producer-entered reference in an external system such as Farmers Wife';


-- ===== 0035_booking_terms_per_job =====
-- Per-booking explicit acceptance of the current published crew terms.
-- The acceptance record is independent of profile-level or prior-job agreements.
CREATE TABLE IF NOT EXISTS public.booking_terms_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id text NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
 production_id text NOT NULL REFERENCES public.productions(id),
 crew_id text NOT NULL REFERENCES public.crew_members(id),
 accepted_by uuid NOT NULL REFERENCES auth.users(id),
 terms_version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT one_acceptance_per_booking UNIQUE (booking_id)
);
CREATE INDEX IF NOT EXISTS booking_terms_acceptances_production_idx
 ON public.booking_terms_acceptances(production_id, accepted_at DESC);
ALTER TABLE public.booking_terms_acceptances ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.booking_terms_acceptances TO authenticated;
CREATE POLICY "crew can view own job terms acceptance"
 ON public.booking_terms_acceptances FOR SELECT TO authenticated
 USING (accepted_by = auth.uid() OR public.is_site_member(production_id));

-- Client never supplies acceptance identity or timestamp; both are captured by Postgres.
CREATE OR REPLACE FUNCTION public.accept_booking_with_terms(p_booking_id text, p_terms_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_booking public.bookings%ROWTYPE; v_crew text;
BEGIN
 IF p_terms_version IS DISTINCT FROM 'dialacrew-terms-2026-10' THEN
  RAISE EXCEPTION 'Terms version has changed. Refresh and review the current terms';
 END IF;
 SELECT id INTO v_crew FROM public.crew_members WHERE user_id=auth.uid();
 SELECT * INTO v_booking FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.crew_id IS DISTINCT FROM v_crew THEN
  RAISE EXCEPTION 'Booking not found or not assigned to this crew member';
 END IF;
 IF v_booking.status NOT IN ('pencil','awaiting_crew_confirmation') THEN
  RAISE EXCEPTION 'This booking cannot be accepted in its current status';
 END IF;
 IF EXISTS(SELECT 1 FROM public.productions WHERE id=v_booking.production_id AND completed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'This production is completed and read-only';
 END IF;
 INSERT INTO public.booking_terms_acceptances(booking_id,production_id,crew_id,accepted_by,terms_version)
 VALUES (v_booking.id,v_booking.production_id,v_booking.crew_id,auth.uid(),p_terms_version);
 UPDATE public.bookings SET status='confirmed' WHERE id=p_booking_id;
END $$;
REVOKE ALL ON FUNCTION public.accept_booking_with_terms(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_booking_with_terms(text,text) TO authenticated;

-- Claiming an open gig is also an acceptance and must be atomic with terms recording.
CREATE OR REPLACE FUNCTION public.claim_gig_with_terms(p_booking_id text, p_terms_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_booking public.bookings%ROWTYPE; v_crew text;
BEGIN
 IF p_terms_version IS DISTINCT FROM 'dialacrew-terms-2026-10' THEN
  RAISE EXCEPTION 'Terms version has changed. Refresh and review the current terms';
 END IF;
 SELECT id INTO v_crew FROM public.crew_members WHERE user_id=auth.uid();
 IF v_crew IS NULL THEN RAISE EXCEPTION 'Crew profile required'; END IF;
 SELECT * INTO v_booking FROM public.bookings WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.status <> 'open' THEN RAISE EXCEPTION 'Gig is no longer available'; END IF;
 IF EXISTS(SELECT 1 FROM public.productions WHERE id=v_booking.production_id AND completed_at IS NOT NULL) THEN
  RAISE EXCEPTION 'This production is completed and read-only';
 END IF;
 -- Record consent first in the same transaction, so the confirmation guard can verify it.
 -- Any failure in claim_gig rolls back this acceptance automatically.
 INSERT INTO public.booking_terms_acceptances(booking_id,production_id,crew_id,accepted_by,terms_version)
 VALUES (v_booking.id,v_booking.production_id,v_crew,auth.uid(),p_terms_version);
 -- Existing claim_gig retains its own eligibility and booking checks.
 PERFORM public.claim_gig(p_booking_id);
END $$;
REVOKE ALL ON FUNCTION public.claim_gig_with_terms(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_gig_with_terms(text,text) TO authenticated;

-- Forbid crew-side confirmation that bypasses the recorded per-job agreement.
CREATE OR REPLACE FUNCTION public.require_terms_before_crew_confirmation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status='confirmed' AND OLD.status IS DISTINCT FROM NEW.status
    AND EXISTS (SELECT 1 FROM public.crew_members c WHERE c.id=NEW.crew_id AND c.user_id=auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.booking_terms_acceptances a WHERE a.booking_id=NEW.id AND a.accepted_by=auth.uid()) THEN
   RAISE EXCEPTION 'Review and accept the terms for this booking before confirming';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS require_terms_before_crew_confirmation ON public.bookings;
CREATE TRIGGER require_terms_before_crew_confirmation BEFORE UPDATE OF status ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.require_terms_before_crew_confirmation();


-- ===== 0036_checklist_templates =====
-- Personal reusable checklist templates and personal crew checklists.
CREATE TABLE IF NOT EXISTS public.checklist_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 audience text NOT NULL CHECK (audience IN ('producer','crew')),
 title text NOT NULL,
 items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,audience,title)
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_default_audience_title_unique ON public.checklist_templates(audience,title) WHERE owner_id IS NULL;
CREATE TABLE IF NOT EXISTS public.crew_checklists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
 title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crew_checklist_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 checklist_id uuid NOT NULL REFERENCES public.crew_checklists(id) ON DELETE CASCADE,
 label text NOT NULL, done boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS crew_checklists_crew_idx ON public.crew_checklists(crew_id);
CREATE INDEX IF NOT EXISTS crew_checklist_items_list_idx ON public.crew_checklist_items(checklist_id);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_checklist_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.checklist_templates,public.crew_checklists,public.crew_checklist_items TO authenticated;
CREATE POLICY "read default or own templates" ON public.checklist_templates FOR SELECT TO authenticated
 USING (owner_id IS NULL OR owner_id=auth.uid());
CREATE POLICY "create own templates" ON public.checklist_templates FOR INSERT TO authenticated WITH CHECK (owner_id=auth.uid());
CREATE POLICY "edit own templates" ON public.checklist_templates FOR UPDATE TO authenticated USING (owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY "delete own templates" ON public.checklist_templates FOR DELETE TO authenticated USING(owner_id=auth.uid());
CREATE POLICY "own crew checklists read" ON public.crew_checklists FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklists create" ON public.crew_checklists FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklists edit" ON public.crew_checklists FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklists delete" ON public.crew_checklists FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items read" ON public.crew_checklist_items FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items create" ON public.crew_checklist_items FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items edit" ON public.crew_checklist_items FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items delete" ON public.crew_checklist_items FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));

-- Server-side creation copies template items; templates remain reusable and independent.
CREATE OR REPLACE FUNCTION public.apply_checklist_template(p_template_id uuid,p_production_id text DEFAULT NULL,p_crew_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.checklist_templates%ROWTYPE; v_list uuid; v_item jsonb; v_ord integer:=0;
BEGIN
 SELECT * INTO t FROM public.checklist_templates WHERE id=p_template_id AND (owner_id IS NULL OR owner_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable'; END IF;
 IF t.audience='producer' AND p_production_id IS NOT NULL AND p_crew_id IS NULL THEN
   IF NOT public.is_site_member(p_production_id) OR NOT (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Producer access required'; END IF;
   IF EXISTS(SELECT 1 FROM public.productions WHERE id=p_production_id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Production completed'; END IF;
   INSERT INTO public.production_checklists(production_id,title,sort_order) VALUES(p_production_id,t.title,0) RETURNING id INTO v_list;
   FOR v_item IN SELECT * FROM jsonb_array_elements(t.items) LOOP
     INSERT INTO public.production_checklist_items(checklist_id,label,sort_order) VALUES(v_list,v_item#>>'{}',v_ord); v_ord:=v_ord+1;
   END LOOP;
 ELSIF t.audience='crew' AND p_crew_id IS NOT NULL AND p_production_id IS NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.crew_members WHERE id=p_crew_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Crew access required'; END IF;
   INSERT INTO public.crew_checklists(crew_id,title) VALUES(p_crew_id,t.title) RETURNING id INTO v_list;
   FOR v_item IN SELECT * FROM jsonb_array_elements(t.items) LOOP
     INSERT INTO public.crew_checklist_items(checklist_id,label,sort_order) VALUES(v_list,v_item#>>'{}',v_ord); v_ord:=v_ord+1;
   END LOOP;
 ELSE RAISE EXCEPTION 'Template audience and target must match'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.apply_checklist_template(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_checklist_template(uuid,text,text) TO authenticated;


-- ===== 0037_default_checklist_templates =====
-- Default templates transcribed from uploaded Production App Matrix & Checklists Master Data, sections 2 and 3.
INSERT INTO public.checklist_templates(owner_id,audience,title,items)
VALUES
(NULL,'producer','General Production','["Distribute locked shooting script draft to all department heads.","Approve master budget, contingency reserves, and cash flow schedules.","Execute all key crew contracts, deal memos, and NDAs.","Authorize master production schedule, shooting dates, and delivery deadlines.","Approve daily call sheets and review daily production reports (DPRs).","Sign off on location handovers, truck returns, and wrap POs."]'::jsonb),
(NULL,'producer','Wardrobe (Costume)','["Approve costume lookbooks, color palettes, and cast design boards.","Sign off on budget splits between rentals and custom builds.","Authorize fitting schedules for talent, stunts, and background actors.","Confirm setup of digital wardrobe continuity photo logging workflows.","Approve post-production inventory audit and rental-return/storage plans."]'::jsonb),
(NULL,'producer','Hair & Make-up (HMU)','["Approve character lookbooks, prosthesis sketches, and cosmetics budgets.","Verify medical/allergy clearances are collected from all principal cast.","Check morning schedules for complex prosthetic/hair transition times.","Monitor daily continuity sign-offs for across-unit consistency.","Authorize hazardous waste disposal protocols for specialized solvents/adhesives."]'::jsonb),
(NULL,'producer','Art Department (Set Design & Props)','["Sign off on construction blueprints, set designs, and engineering plans.","Approve prop procurement lists, product placement clearances, and copyrights.","Inspect physical sets on-site during pre-shoot tech scouts.","Confirm picture-ready set status before handing over to camera.","Oversee strike budgets and hero prop disposal/storage logistics."]'::jsonb),
(NULL,'producer','Visual Effects (VFX)','["Approve VFX shot breakdowns, cost estimates, and delivery schedules.","Finalize vendor contract with the chosen VFX house.","Ensure an on-set VFX Supervisor is scheduled for tracking/green-screen shots.","Monitor post-production tracking to ensure temp assets integrate smoothly.","Sign off on final composite versions prior to color grading."]'::jsonb),
(NULL,'producer','Special Effects (SFX - Practical)','["Sign off on fire, pyrotechnic, rain, haze, or mechanical designs.","Verify specialized SFX vendor licenses, permits, and liability insurance.","Coordinate safety perimeters and secure municipal/fire authority approvals.","Enforce mandatory deployment of fire-suppression equipment on set.","Validate safe post-shoot disposal of all chemical/explosive materials."]'::jsonb),
(NULL,'producer','Stunts','["Approve Stunt Coordinator''s action breakdown and risk assessment.","Verify stunt double contract riders and liability insurance upgrades.","Enforce mandatory set-wide stunt safety briefings before active filming.","Verify certified on-set EMT presence during stunt execution.","Ensure immediate post-take medical checkouts for high-impact performers."]'::jsonb),
(NULL,'producer','Post-Production','["Establish secure server backups and data mirror schedules with supervisors.","Approve deadline calendar for assembly, rough/fine cuts, and picture lock.","Oversee budgets for sound mixing, ADR, color, and scoring.","Review and approve final automated Quality Control (QC) compliance reports.","Sign off on master DCP delivery and marketing EPK assets."]'::jsonb),
(NULL,'producer','Legal, Clearance & Rights','["Secure chain of title documentation verifying underlying script ownership.","Resolve script clearance flags regarding real names, logos, or brands.","Execute talent release forms, location agreements, and crowd releases.","Secure music sync and master use licenses for all tracks.","Submit finalized legal delivery binder to distributors/completion bonds."]'::jsonb),
(NULL,'producer','Finance & Insurance','["Secure comprehensive production insurance for property, gear, and cast.","Setup payroll system compliant with local taxes and union rules.","Establish petty cash and purchase order (PO) approval workflows.","Secure worker''s compensation insurance certificates for all crew.","Monitor weekly cost reports against budget to flag departmental overages."]'::jsonb),
(NULL,'producer','Locations & Logistics','["Secure municipal filming permits, parking vouchers, and road closures.","Execute location agreements and coordinate security deposits with owners.","Map layouts for basecamp, holding, catering, and honeywagons.","Verify power grid access or source towable production generators.","Distribute tech scout maps, driving directions, and hospital routes."]'::jsonb),
(NULL,'producer','Health, Safety & Environmental (HSE)','["Hire certified set medics/safety officers for hazardous setups.","Distribute daily call sheet safety bulletins detailing location hazards.","Establish emergency staging areas and extreme weather evacuation protocols.","Set up hydration stations, sanitization hubs, and climate tents.","Enforce sorted waste management, recycling, and water-refill stations."]'::jsonb),
(NULL,'producer','Director & Creative Performance','["Review and approve the Director’s master shot lists, lookbooks, and storyboards.","Verify the Director''s daily pacing aligns with the master shooting schedule.","Mediate creative conflicts between the Director and clients/executives.","Authorize final approval on casting choices, rehearsals, and dialogue revisions.","Secure Director sign-off on the final edited cut prior to mastering."]'::jsonb),
(NULL,'producer','Camera & Lighting Oversight','["Approve the Director of Photography’s camera package, lenses, and sensors.","Review and sign off on Gaffer heavy rentals (generators, lighting vans).","Confirm a dedicated First Assistant Camera is assigned to technical check blocks.","Monitor camera/lighting setup speeds to eliminate timeline overruns.","Approve POs for specialized filters, heavy rigging gear, and expendables."]'::jsonb),
(NULL,'producer','Catering & Craft Services','["Select and contract a catering vendor meeting all cast/crew dietary needs.","Approve weekly menus ensuring protein, carb, and hydration balance.","Verify hot meal windows execute exactly 6 hours from general crew call.","Confirm setup of continuous on-set craft services for snacking.","Verify health department certificates and permits for mobile kitchen units."]'::jsonb),
(NULL,'producer','Production Assistants & Set Ops','["Approve total daily lock-up and crowd-control plans with the Key Set PA.","Authorize petty cash allocations for office and set emergency runs.","Review PA distribution channels for instantaneous paperwork delivery.","Confirm walkie-talkie, headset, and surveillance asset functionality.","Oversee real-time collection of talent releases by background PAs."]'::jsonb),
(NULL,'crew','Wardrobe Crew','["Collect and sort assets from rental houses, retail, and tailors.","Label all items, hangers, and bins by character/scene number.","Setup trailer with steamers, irons, sewing kits, and laundry stations.","Prep and lay out scheduled outfits before talent call times.","Deploy weather gear (coats, umbrellas, fans) to protect on-location costumes.","Take high-res front/back/side continuity photos before talent hits set.","Monitor camera feed for mid-take collar, wrinkle, or sweat adjustments.","Collect all costume pieces immediately after performers wrap scenes.","Log, sort, and process items requiring immediate laundry or repairs."]'::jsonb),
(NULL,'crew','Make-up & Hair Crew','["Sanitize all brushes, sponges, tools, and vanity surfaces.","Setup stations with actor look sheets, references, and product lines.","Apply beauty, character, or prosthetic looks per approved lookbooks.","Apply protective skin barriers (sunscreen, sprays) for outdoor shoots.","Assemble portable touch-up kits (powder, tissue, hairspray, blood rigs).","Monitor camera feed to control skin shine or shifting hair/prosthetics.","Safely remove cosmetics and prosthetics using skin-safe solvents.","Clean, condition, and store wigs/prosthetics on designated blocks.","Sanitize tools and reset workstations for the next operational shift."]'::jsonb),
(NULL,'crew','Art Department Crew','["Load scenic elements, flats, tools, and dressing materials safely.","Crosscheck incoming props against master script lists to prevent loss.","Position and anchor furniture, drapery, and dressings per floor plans.","Apply aging, paint touches, or distressing treatments to surfaces/props.","Reset consumable/breakable props (food, breakaway glass) between takes.","Maintain strict safety boundaries around heavy flats and overhead rigs.","Dismantle physical structures using eyewear, gloves, and ear protection.","Sort struck items into rental returns, company inventory, or scrap.","Sweep, vacuum, and return physical locations to original states."]'::jsonb),
(NULL,'crew','VFX On-Set Crew','["Calibrate witness cameras, lidar scanners, markers, and reference gear.","Place tracking markers securely on green screens or environments pre-shoot.","Measure and log lens focal length, height, tilt, and distance per take.","Capture chrome/gray sphere reference photos at the performance spot.","Shoot 360-degree HDRI panoramas of lighting setups immediately after wrap.","Coordinate with camera assistants to log lens serial numbers used.","Organize digital metadata sheets and field notes into daily folders.","Hand over daily VFX logs to the DIT for backup syncing."]'::jsonb),
(NULL,'crew','SFX Practical Crew','["Inspect structural components, valves, hoses, and electronic firing systems.","Anchor pressure lines and fluid paths for rain, wind, or fire elements.","Run closed, controlled dry-test runs before talent enters set floors.","Establish explicit radio channels/hand signals for emergency shutoffs.","Fire practical cues on Director''s command while monitoring safety zones.","Depressurize tanks, isolate electrical inputs, and close fuel valves post-take.","Enforce mandatory cool-down periods before anyone enters hot effects zones.","Clear practical debris, water pools, or soot trails after takes."]'::jsonb),
(NULL,'crew','Stunt Crew','["Inspect mats, decelerators, catching rigs, wires, and harness stitching.","Anchor wire rigs/counterweights to structural beams, verifying load tolerances.","Lead performers through slow-motion physical walkthroughs of choreography.","Execute a full physical warm-up sequence before dressing in gear.","Double-check all body pads, spine protectors, and fire-retardant layers.","Call immediate verbal Hold over radio if any gear component shifts.","Inspect safety hardware, wire snaps, and quick-releases before repeat takes.","Provide immediate physical status feedback to Coordinator/medic post-take."]'::jsonb),
(NULL,'crew','Post-Production Team','["Secure raw camera/audio data using verified bit-for-bit checksum software.","Generate automated backup mirrors on local RAID and encrypted cloud.","Sync external audio tracks to video files via timecode/slates.","Organize daily footage into bins by scene, angle, and rating.","Generate low-res proxies and upload them to the remote editorial platform.","Export complete AAF/EDL lists and reference videos for sound/color suites.","Swap editing proxies for original high-res masters during conforming stage.","Check timelines frame-by-frame against picture-locked references to catch bugs."]'::jsonb),
(NULL,'crew','Director','["Lead morning blocking rehearsals with principal talent and department heads.","Communicate framing, emotional tone, and pacing mechanics to DP and cast.","Evaluate live performances at video village, assigning real-time adjustments.","Provide technical sign-off on a setup''s completion before shifting angles.","Review daily assemblies or raw rushes with editorial to monitor narrative continuity."]'::jsonb),
(NULL,'crew','Director of Photography (DP)','["Design precise lighting schematics and framing layouts for every setup.","Coordinate with the Gaffer to align key, fill, and backlighting points.","Select lenses, T-stops, and operating parameters matching director targets.","Monitor live false-color/waveform parameters to eliminate highlight clipping.","Review daily digital logs with the colorist to anchor visual continuity."]'::jsonb),
(NULL,'crew','First Assistant Camera (Focus Puller)','["Assemble, configure, and calibrate camera rigs, remote focus units, and video streams.","Measure precise focal distance parameters to talent targets during blocking.","Execute wireless real-time focus pulls to maintain razor-sharp focal clarity.","Manage physical lens swaps, optical cleaning protocols, and gate checks.","Manage the Second Assistant Camera to guarantee accurate slate tracking."]'::jsonb),
(NULL,'crew','Gaffer (Chief Lighting Technician)','["Calculate total operational power draws to clear distribution network safety thresholds.","Direct the electric pool to build, flag, and safety-wire massive fixture arrays.","Build localized scenes in master consoles or mobile apps for instant balancing.","Color meter the set floor to maintain seamless Kelvin temperature consistency.","Enforce crisp stowed-cable pathways to remove physical floor hazards."]'::jsonb),
(NULL,'crew','Catering & Craft Services Crew','["Erect staging layouts, buffet heaters, and sanitation zones before meal shifts.","Document allergens visibly on items to avoid hazardous cross-contamination logs.","Drive continuous coffee brewing systems to supply crews before morning call.","Restock mobile staging hubs with snacks, fresh elements, and hydration assets.","Strike, sterilize, and pack dining zones the instant windows conclude."]'::jsonb),
(NULL,'crew','Production Assistants (PAs)','["Arrive pre-call to plant directional traffic layout markers and staging coning.","Hand-deliver call sheets, script pages, revisions, and production sides.","Freeze local perimeters perfectly during live filming iterations.","Oversee walkie distribution networks, tracking battery status and channel hygiene.","Collect physical signatures on time logs, location releases, and extra vouchers."]'::jsonb)
ON CONFLICT DO NOTHING;

