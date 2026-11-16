CREATE TABLE public.notification_email_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 notification_id uuid NOT NULL UNIQUE,
 dispatch_token uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'pending',
 attempts int NOT NULL DEFAULT 0,
 claimed_at timestamptz, sent_at timestamptz, error text,
 created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.notification_email_outbox TO service_role;
ALTER TABLE public.notification_email_outbox ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enqueue_notification_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record;
BEGIN
 IF NEW.event_kind IS NULL OR NEW.event_kind NOT IN ('gig_offer','schedule_change','booking_update') THEN RETURN NEW; END IF;
 INSERT INTO public.notification_email_outbox(notification_id) VALUES (NEW.id) ON CONFLICT DO NOTHING RETURNING id, dispatch_token INTO o;
 IF o.id IS NOT NULL THEN
  PERFORM net.http_post(url:='https://bookacrew.film/api/public/notification-email', headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('id',o.id,'token',o.dispatch_token), timeout_milliseconds:=10000);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER enqueue_notification_email AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_email();

CREATE OR REPLACE FUNCTION public.claim_notification_email(p_id uuid, p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.notification_email_outbox; n public.notifications; e text;
BEGIN
 UPDATE public.notification_email_outbox SET status='sending', claimed_at=now(), attempts=attempts+1
 WHERE id=p_id AND dispatch_token=p_token AND (status='pending' OR (status='sending' AND claimed_at < now()-interval '5 minutes')) AND attempts < 4 RETURNING * INTO o;
 IF o.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO n FROM public.notifications WHERE id=o.notification_id;
 SELECT email INTO e FROM auth.users WHERE id=n.user_id;
 IF e IS NULL THEN UPDATE public.notification_email_outbox SET status='skipped' WHERE id=o.id; RETURN NULL; END IF;
 RETURN jsonb_build_object('id',o.id,'notificationId',n.id,'email',e,'title',n.title,'body',coalesce(n.body,''),'productionId',n.production_id,'kind',n.event_kind);
END; $$;
REVOKE ALL ON FUNCTION public.claim_notification_email(uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_notification_email(uuid,uuid) TO anon, authenticated;