ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false;
ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS tax_country text NOT NULL DEFAULT 'ZA';
ALTER TABLE public.crew_invoice_settings ADD COLUMN IF NOT EXISTS customer_tax_number text NOT NULL DEFAULT '';
ALTER TABLE public.crew_invoice_settings ADD CONSTRAINT crew_invoice_vat_config CHECK (NOT vat_registered OR (length(trim(tax_number))>0 AND vat_rate>0 AND vat_rate<=100));
CREATE OR REPLACE FUNCTION public.create_invoice_on_booking_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_settings jsonb; v_total numeric; v_equipment numeric; v_vat_rate numeric; v_vat_amount numeric;
BEGIN
 IF NEW.crew_id IS NULL OR NEW.status NOT IN ('confirmed','in_progress','awaiting_review','payment_released','completed') THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.crew_id IS NOT DISTINCT FROM NEW.crew_id THEN RETURN NEW; END IF;
 SELECT to_jsonb(s) INTO v_settings FROM public.crew_invoice_settings s WHERE s.crew_id=NEW.crew_id;
 SELECT COALESCE(sum(daily_fee * days),0) INTO v_equipment FROM public.booking_assets WHERE booking_id=NEW.id;
 v_total := COALESCE(NEW.crew_rate,0)*COALESCE(NEW.days,1);
 v_vat_rate := CASE WHEN COALESCE((v_settings->>'vat_registered')::boolean,false) THEN COALESCE((v_settings->>'vat_rate')::numeric,0) ELSE 0 END;
 v_vat_amount := round((v_total+v_equipment)*v_vat_rate/100,2);
 INSERT INTO public.invoices(booking_id,crew_id,production_id,invoice_number,day_rate,days,overtime_amount,equipment_amount,subtotal,vat_rate,vat_amount,total,status,service_description,issuer_snapshot)
 VALUES (NEW.id,NEW.crew_id,NEW.production_id,'INV-'||upper(left(NEW.id::text,8)),COALESCE(NEW.crew_rate,0),COALESCE(NEW.days,1),0,v_equipment,v_total+v_equipment,v_vat_rate,v_vat_amount,v_total+v_equipment+v_vat_amount,'unpaid',COALESCE(NEW.role,'Service'),COALESCE(v_settings,'{}'::jsonb))
 ON CONFLICT (booking_id) DO NOTHING;
 RETURN NEW;
END $$;
