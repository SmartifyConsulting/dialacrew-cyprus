-- Invoices remain drafts until crew explicitly confirms the final amount.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_minutes integer NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_fee numeric NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_hourly_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS crew_confirmed_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS crew_confirmed_by uuid;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS wrap_calculated_at timestamptz;
-- Existing invoices remain issued; only new invoices enter draft workflow.
DO $$ BEGIN
 ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('draft','unpaid','paid','payment_released','completed','cancelled','overdue','pending','issued'));
CREATE OR REPLACE FUNCTION public.create_invoice_on_booking_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_settings jsonb; v_total numeric; v_equipment numeric; v_vat_rate numeric; v_vat_amount numeric;
BEGIN
 IF NEW.crew_id IS NULL OR NEW.status NOT IN ('confirmed','in_progress','awaiting_review','payment_released','completed') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status=NEW.status AND OLD.crew_id IS NOT DISTINCT FROM NEW.crew_id THEN RETURN NEW; END IF;
 SELECT to_jsonb(s) INTO v_settings FROM public.crew_invoice_settings s WHERE s.crew_id=NEW.crew_id;
 SELECT COALESCE(sum(daily_fee*days),0) INTO v_equipment FROM public.booking_assets WHERE booking_id=NEW.id;
 v_total:=COALESCE(NEW.crew_rate,0)*COALESCE(NEW.days,1);
 v_vat_rate:=CASE WHEN COALESCE((v_settings->>'vat_registered')::boolean,false) THEN COALESCE((v_settings->>'vat_rate')::numeric,0) ELSE 0 END;
 v_vat_amount:=round((v_total+v_equipment)*v_vat_rate/100,2);
 INSERT INTO public.invoices(booking_id,crew_id,production_id,invoice_number,day_rate,days,overtime_amount,equipment_amount,subtotal,vat_rate,vat_amount,total,status,service_description,issuer_snapshot)
 VALUES(NEW.id,NEW.crew_id,NEW.production_id,'INV-'||upper(left(NEW.id::text,8)),COALESCE(NEW.crew_rate,0),COALESCE(NEW.days,1),0,v_equipment,v_total+v_equipment,v_vat_rate,v_vat_amount,v_total+v_equipment+v_vat_amount,'draft',COALESCE(NEW.role,'Service'),COALESCE(v_settings,'{}'::jsonb))
 ON CONFLICT(booking_id) DO NOTHING;
 RETURN NEW;
END $$;
-- Crew-specific wrap rate defaults to day rate / 8 hours until explicit hourly terms are configured.
CREATE OR REPLACE FUNCTION public.invoice_wrap_on_checkout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_invoice public.invoices%ROWTYPE; v_mins integer; v_rate numeric; v_fee numeric; v_sub numeric; v_tax numeric;
BEGIN
 IF NEW.left_at IS NULL OR OLD.left_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT i.* INTO v_invoice FROM public.invoices i JOIN public.bookings b ON b.id=i.booking_id
 WHERE i.production_id=NEW.production_id AND i.crew_id=NEW.crew_id AND b.status<>'cancelled' AND i.status='draft'
 ORDER BY i.created_at DESC LIMIT 1 FOR UPDATE OF i;
 IF NOT FOUND THEN RETURN NEW; END IF;
 v_mins:=GREATEST(0,CEIL(EXTRACT(EPOCH FROM (NEW.left_at-NEW.wrapped_at))/60)::integer);
 v_rate:=round(COALESCE(v_invoice.day_rate,0)/8,2);
 v_fee:=round(v_rate*v_mins/60,2);
 v_sub:=COALESCE(v_invoice.day_rate,0)*COALESCE(v_invoice.days,1)+COALESCE(v_invoice.equipment_amount,0)+COALESCE(v_invoice.overtime_amount,0)+v_fee;
 v_tax:=round(v_sub*COALESCE(v_invoice.vat_rate,0)/100,2);
 UPDATE public.invoices SET wrap_minutes=v_mins,wrap_hourly_rate=v_rate,wrap_fee=v_fee,wrap_calculated_at=now(),subtotal=v_sub,vat_amount=v_tax,total=v_sub+v_tax WHERE id=v_invoice.id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invoice_wrap_on_checkout ON public.site_wraps;
CREATE TRIGGER invoice_wrap_on_checkout AFTER UPDATE OF left_at ON public.site_wraps FOR EACH ROW EXECUTE FUNCTION public.invoice_wrap_on_checkout();
CREATE OR REPLACE FUNCTION public.confirm_final_crew_invoice(p_invoice_id uuid,p_acknowledge_wrap boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.invoices%ROWTYPE;
BEGIN
 SELECT * INTO v FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=v.crew_id AND c.user_id=auth.uid()) THEN RAISE EXCEPTION 'Invoice not found or access denied'; END IF;
 IF v.status<>'draft' THEN RAISE EXCEPTION 'Invoice has already been issued'; END IF;
 IF v.wrap_calculated_at IS NULL THEN RAISE EXCEPTION 'Wrap-up and checkout must be recorded before issuing this invoice'; END IF;
 IF NOT p_acknowledge_wrap THEN RAISE EXCEPTION 'You must acknowledge the final wrap-up fee'; END IF;
 UPDATE public.invoices SET status='unpaid',crew_confirmed_at=now(),crew_confirmed_by=auth.uid() WHERE id=p_invoice_id;
END $$;
REVOKE ALL ON FUNCTION public.confirm_final_crew_invoice(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_final_crew_invoice(uuid,boolean) TO authenticated;
