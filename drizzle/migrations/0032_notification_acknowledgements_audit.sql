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
