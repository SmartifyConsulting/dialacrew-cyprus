CREATE TABLE public.native_push_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 alias uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.native_push_devices TO authenticated;
GRANT ALL ON public.native_push_devices TO service_role;
ALTER TABLE public.native_push_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own push device status" ON public.native_push_devices FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TABLE public.native_push_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES public.native_push_devices(id) ON DELETE CASCADE,
 dispatch_token uuid NOT NULL DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0, claimed_at timestamptz, sent_at timestamptz, error text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(notification_id, device_id)
);
GRANT ALL ON public.native_push_outbox TO service_role;
ALTER TABLE public.native_push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_kind text;
CREATE OR REPLACE FUNCTION public.register_native_push_device() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.native_push_devices;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 INSERT INTO public.native_push_devices(user_id) VALUES(auth.uid()) RETURNING * INTO d;
 RETURN jsonb_build_object('id', d.id, 'alias', d.alias);
END; $$;
REVOKE ALL ON FUNCTION public.register_native_push_device() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_native_push_device() TO authenticated;
CREATE OR REPLACE FUNCTION public.revoke_native_push_device(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 UPDATE public.native_push_devices SET enabled = false WHERE id = p_id AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.revoke_native_push_device(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_native_push_device(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.claim_native_push(p_id uuid, p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.native_push_outbox; a uuid; n public.notifications;
BEGIN
 UPDATE public.native_push_outbox SET status='sending', claimed_at=now(), attempts=attempts+1
 WHERE id=p_id AND dispatch_token=p_token AND (status='pending' OR (status='sending' AND claimed_at < now()-interval '5 minutes')) AND attempts < 4 RETURNING * INTO o;
 IF o.id IS NULL THEN RETURN NULL; END IF;
 SELECT alias INTO a FROM public.native_push_devices WHERE id=o.device_id AND enabled;
 IF a IS NULL THEN UPDATE public.native_push_outbox SET status='skipped' WHERE id=o.id; RETURN NULL; END IF;
 SELECT * INTO n FROM public.notifications WHERE id=o.notification_id;
 RETURN jsonb_build_object('id', o.id, 'alias', a, 'notificationId', n.id, 'productionId', n.production_id, 'kind', n.event_kind);
END; $$;
REVOKE ALL ON FUNCTION public.claim_native_push(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_native_push(uuid,uuid) TO anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE OR REPLACE FUNCTION public.enqueue_native_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
 IF NEW.event_kind NOT IN ('gig_offer','schedule_change','booking_update') OR NEW.event_kind IS NULL THEN RETURN NEW; END IF;
 FOR o IN INSERT INTO public.native_push_outbox(notification_id,device_id)
 SELECT NEW.id,id FROM public.native_push_devices WHERE user_id=NEW.user_id AND enabled
 ON CONFLICT DO NOTHING RETURNING id,dispatch_token LOOP
 PERFORM net.http_post(url:='https://bookacrew.film/api/public/native-push', headers:='{"Content-Type":"application/json"}'::jsonb,
 body:=jsonb_build_object('id',o.id,'token',o.dispatch_token), timeout_milliseconds:=10000);
 END LOOP;
 RETURN NEW;
END; $$;
CREATE TRIGGER enqueue_native_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enqueue_native_push();
CREATE OR REPLACE FUNCTION public.notify_booking_native() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient uuid; kind text; heading text;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.crew_id,NEW.status,NEW.payment_status,NEW.booking_date,NEW.call_time,NEW.wrap_time,NEW.postponed_to,NEW.pencil_priority) IS NOT DISTINCT FROM ROW(OLD.crew_id,OLD.status,OLD.payment_status,OLD.booking_date,OLD.call_time,OLD.wrap_time,OLD.postponed_to,OLD.pencil_priority) THEN RETURN NEW; END IF;
 IF NEW.crew_id IS NULL THEN RETURN NEW; END IF;
 SELECT user_id INTO recipient FROM public.crew_members WHERE id=NEW.crew_id;
 IF recipient IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN kind:='gig_offer'; heading:='New gig offer';
 ELSIF ROW(NEW.booking_date,NEW.call_time,NEW.wrap_time,NEW.postponed_to) IS DISTINCT FROM ROW(OLD.booking_date,OLD.call_time,OLD.wrap_time,OLD.postponed_to) THEN kind:='schedule_change'; heading:='Schedule changed';
 ELSE kind:='booking_update'; heading:='Booking updated'; END IF;
 INSERT INTO public.notifications(user_id,production_id,title,body,event_kind) VALUES(recipient,NEW.production_id,heading,'Open Book a Crew to view your job details.',kind);
 IF TG_OP='UPDATE' AND NEW.crew_id IS DISTINCT FROM OLD.crew_id AND OLD.crew_id IS NOT NULL THEN
 INSERT INTO public.notifications(user_id,production_id,title,body,event_kind) SELECT user_id,OLD.production_id,'Booking updated','Your assignment has changed. Open Book a Crew for details.','booking_update' FROM public.crew_members WHERE id=OLD.crew_id AND user_id IS NOT NULL;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER notify_booking_native AFTER INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking_native();
CREATE OR REPLACE FUNCTION public.notify_schedule_native() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p text;
BEGIN
 IF TG_TABLE_NAME='productions' THEN
 IF ROW(NEW.date,NEW.end_date,NEW.days,NEW.timezone,NEW.recce_date,NEW.recce_start_time,NEW.recce_end_time,NEW.gear_pickup_date,NEW.gear_pickup_time,NEW.gear_dropoff_date,NEW.gear_dropoff_time,NEW.address) IS NOT DISTINCT FROM ROW(OLD.date,OLD.end_date,OLD.days,OLD.timezone,OLD.recce_date,OLD.recce_start_time,OLD.recce_end_time,OLD.gear_pickup_date,OLD.gear_pickup_time,OLD.gear_dropoff_date,OLD.gear_dropoff_time,OLD.address) THEN RETURN NEW; END IF; p:=NEW.id;
 ELSE
 IF TG_OP='UPDATE' AND ROW(NEW.recce_date,NEW.recce_start_time,NEW.recce_end_time,NEW.starts_at,NEW.ends_at,NEW.address) IS NOT DISTINCT FROM ROW(OLD.recce_date,OLD.recce_start_time,OLD.recce_end_time,OLD.starts_at,OLD.ends_at,OLD.address) THEN RETURN NEW; END IF;
 p:=CASE WHEN TG_OP='DELETE' THEN OLD.production_id ELSE NEW.production_id END;
 END IF;
 INSERT INTO public.notifications(user_id,production_id,title,body,event_kind)
 SELECT DISTINCT c.user_id,p,'Schedule changed','Open Book a Crew to view the updated schedule.','schedule_change'
 FROM public.bookings b JOIN public.crew_members c ON c.id=b.crew_id WHERE b.production_id=p AND c.user_id IS NOT NULL AND b.status::text NOT IN ('cancelled','declined','completed');
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER notify_production_schedule_native AFTER UPDATE ON public.productions FOR EACH ROW EXECUTE FUNCTION public.notify_schedule_native();
CREATE TRIGGER notify_location_schedule_native AFTER INSERT OR UPDATE OR DELETE ON public.production_locations FOR EACH ROW EXECUTE FUNCTION public.notify_schedule_native();
CREATE OR REPLACE FUNCTION public.notify_negotiation_native() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient uuid;
BEGIN
 IF TG_OP='UPDATE' AND ROW(NEW.latest_rate,NEW.latest_by,NEW.status) IS NOT DISTINCT FROM ROW(OLD.latest_rate,OLD.latest_by,OLD.status) THEN RETURN NEW; END IF;
 IF NEW.latest_by='producer' THEN SELECT user_id INTO recipient FROM public.crew_members WHERE id=NEW.crew_id;
 ELSE SELECT created_by INTO recipient FROM public.productions WHERE id=NEW.production_id; END IF;
 IF recipient IS NOT NULL THEN INSERT INTO public.notifications(user_id,production_id,title,body,event_kind) VALUES(recipient,NEW.production_id,'Gig offer updated','Open Book a Crew to review your offer.','gig_offer'); END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER notify_negotiation_native AFTER INSERT OR UPDATE ON public.gig_negotiations FOR EACH ROW EXECUTE FUNCTION public.notify_negotiation_native();