-- Restore the invoice lifecycle already implemented in the app; preserve existing invoices.
BEGIN;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
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

NOTIFY pgrst, 'reload schema';
COMMIT;
