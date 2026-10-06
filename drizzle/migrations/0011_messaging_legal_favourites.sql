-- ============ Booking-scoped messaging ============
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  booking_id text REFERENCES public.bookings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  sender_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read messages" ON public.messages FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "site members send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() AND public.is_site_member(production_id));
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

CREATE OR REPLACE FUNCTION public.notify_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pname text; recipients uuid[];
BEGIN
  SELECT name INTO pname FROM public.productions WHERE id = NEW.production_id;
  IF NEW.booking_id IS NOT NULL THEN
    SELECT array_remove(ARRAY[c.user_id, b.created_by], NULL) INTO recipients
    FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id WHERE b.id = NEW.booking_id;
  ELSE
    SELECT array_agg(DISTINCT u) INTO recipients FROM (
      SELECT c.user_id AS u FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
        WHERE b.production_id = NEW.production_id AND c.user_id IS NOT NULL AND b.status <> 'cancelled'
      UNION SELECT r.user_id FROM public.user_roles r WHERE r.role = 'producer'
    ) m;
  END IF;
  INSERT INTO public.notifications (user_id, production_id, title, body)
  SELECT u, NEW.production_id, NEW.sender_name || ' sent a message', left(NEW.body, 140)
  FROM unnest(recipients) u WHERE u <> NEW.sender_id;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_notify AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_message();

-- ============ WhatsApp notification architecture (modular: outbox pattern) ============
-- Actual sending needs a WhatsApp Business API key (Twilio/Meta Cloud API) wired
-- into a server function that polls/consumes this table — not configured yet.
-- In-app notifications remain the source of truth; this is an additive channel.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_number text;

CREATE TABLE public.whatsapp_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped_no_number')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_outbox TO authenticated;
GRANT ALL ON public.whatsapp_outbox TO service_role;
ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read whatsapp outbox" ON public.whatsapp_outbox FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Mirror every in-app notification into the WhatsApp outbox for the "critical
-- events" the spec lists; a future worker consumes rows with status='pending'.
CREATE OR REPLACE FUNCTION public.queue_whatsapp() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE phone text;
BEGIN
  SELECT whatsapp_number INTO phone FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.whatsapp_outbox (user_id, phone, title, body, status)
  VALUES (NEW.user_id, phone, NEW.title, NEW.body, CASE WHEN phone IS NULL THEN 'skipped_no_number' ELSE 'pending' END);
  RETURN NEW;
END $$;
CREATE TRIGGER notifications_queue_whatsapp AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.queue_whatsapp();

-- ============ Legal documents + acceptance ============
CREATE TABLE public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('terms','crew_agreement','client_agreement','privacy_policy')),
  version text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_type, version)
);
GRANT SELECT ON public.legal_documents TO authenticated, anon;
GRANT ALL ON public.legal_documents TO service_role;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads legal docs" ON public.legal_documents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage legal docs" ON public.legal_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.legal_documents(id),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);
GRANT SELECT, INSERT ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own acceptances read" ON public.legal_acceptances FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own acceptances insert" ON public.legal_acceptances FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

INSERT INTO public.legal_documents (doc_type, version, title, content) VALUES
  ('terms', '1.0', 'Terms & Conditions', 'Placeholder — replace with the version supplied by the client''s attorneys.'),
  ('crew_agreement', '1.0', 'Crew Agreement (Independent Contractor)', 'Placeholder — crew operate as independent contractors, not employees of Book a Crew.'),
  ('client_agreement', '1.0', 'Client Agreement', 'Placeholder — replace with the version supplied by the client''s attorneys.'),
  ('privacy_policy', '1.0', 'Privacy Policy', 'Placeholder — POPIA-aligned, 5-year retention, CFO governs personal information.')
ON CONFLICT (doc_type, version) DO NOTHING;

-- ============ Crew portfolio links + favourites ============
ALTER TABLE public.crew_members
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS vimeo_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text;

CREATE TABLE public.favourites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, crew_id)
);
GRANT SELECT, INSERT, DELETE ON public.favourites TO authenticated;
GRANT ALL ON public.favourites TO service_role;
ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favourites" ON public.favourites FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
