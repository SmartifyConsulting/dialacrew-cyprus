ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geofence_m integer NOT NULL DEFAULT 200;

ALTER TABLE public.crew_members
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS experience_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS team_led integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS safety_record integer NOT NULL DEFAULT 100;

CREATE OR REPLACE FUNCTION public.my_crew_id() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.crew_members WHERE user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_site_member(_prod text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(auth.uid(), 'producer') OR EXISTS (
  SELECT 1 FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
  WHERE b.production_id = _prod AND c.user_id = auth.uid() AND b.status <> 'Declined') $$;

-- Link a signed-in crew account to its crew record (by email), creating one if missing
CREATE OR REPLACE FUNCTION public.claim_crew_profile() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cid text; em text; nm text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO cid FROM public.crew_members WHERE user_id = auth.uid() LIMIT 1;
  IF cid IS NOT NULL THEN RETURN cid; END IF;
  IF NOT public.has_role(auth.uid(), 'crew') THEN RETURN NULL; END IF;
  SELECT email, full_name INTO em, nm FROM public.profiles WHERE id = auth.uid();
  UPDATE public.crew_members SET user_id = auth.uid()
    WHERE id = (SELECT id FROM public.crew_members WHERE user_id IS NULL AND lower(email) = lower(em) AND em <> '' LIMIT 1)
    RETURNING id INTO cid;
  IF cid IS NULL THEN
    INSERT INTO public.crew_members (name, role, department, email, user_id)
    VALUES (COALESCE(NULLIF(nm, ''), em), 'Crew', 'General', em, auth.uid()) RETURNING id INTO cid;
  END IF;
  RETURN cid;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_crew_profile() TO authenticated;

-- Crew can edit their own profile but never rates, rating or account link
CREATE OR REPLACE FUNCTION public.guard_crew_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN
  IF NOT public.has_role(auth.uid(), 'producer') THEN
    NEW.day_rate := OLD.day_rate; NEW.rating := OLD.rating; NEW.user_id := OLD.user_id;
    NEW.pencilled := OLD.pencilled; NEW.experience := OLD.experience;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crew_members_guard BEFORE UPDATE ON public.crew_members FOR EACH ROW EXECUTE FUNCTION public.guard_crew_update();

CREATE POLICY "crew own record read" ON public.crew_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "crew own record update" ON public.crew_members FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "crew own bookings read" ON public.bookings FOR SELECT TO authenticated USING (crew_id = public.my_crew_id());

-- Safe member list for a site (no rates)
CREATE OR REPLACE FUNCTION public.site_members(_prod text)
RETURNS TABLE (crew_id text, name text, role text, department text, phone text, photo_url text, booking_status text, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT c.id, c.name, b.role, c.department, c.phone, c.photo_url, b.status, c.user_id
  FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
  WHERE b.production_id = _prod AND public.is_site_member(_prod) ORDER BY c.name $$;
GRANT EXECUTE ON FUNCTION public.site_members(text) TO authenticated;

-- Provider kit / props
CREATE TABLE public.crew_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Equipment',
  daily_fee numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_assets TO authenticated;
GRANT ALL ON public.crew_assets TO service_role;
ALTER TABLE public.crew_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers manage assets" ON public.crew_assets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'producer')) WITH CHECK (public.has_role(auth.uid(),'producer'));
CREATE POLICY "crew manage own assets" ON public.crew_assets FOR ALL TO authenticated USING (crew_id = public.my_crew_id()) WITH CHECK (crew_id = public.my_crew_id());

-- Assets selected for a job
CREATE TABLE public.booking_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.crew_assets(id) ON DELETE CASCADE,
  daily_fee numeric NOT NULL DEFAULT 0,
  days integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_assets TO authenticated;
GRANT ALL ON public.booking_assets TO service_role;
ALTER TABLE public.booking_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers manage booking assets" ON public.booking_assets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'producer')) WITH CHECK (public.has_role(auth.uid(),'producer'));
CREATE POLICY "crew read own booking assets" ON public.booking_assets FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND b.crew_id = public.my_crew_id()));

-- Posts
CREATE TABLE public.site_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  audio_path text,
  transcript text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_posts TO authenticated;
GRANT ALL ON public.site_posts TO service_role;
ALTER TABLE public.site_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read posts" ON public.site_posts FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "members write posts" ON public.site_posts FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.is_site_member(production_id));
CREATE POLICY "author or producer delete posts" ON public.site_posts FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.has_role(auth.uid(),'producer'));

-- Tasks
CREATE TABLE public.site_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  title text NOT NULL,
  assigned_crew_id text REFERENCES public.crew_members(id) ON DELETE SET NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_tasks TO authenticated;
GRANT ALL ON public.site_tasks TO service_role;
ALTER TABLE public.site_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read tasks" ON public.site_tasks FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "members add tasks" ON public.site_tasks FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() AND public.is_site_member(production_id));
CREATE POLICY "members update tasks" ON public.site_tasks FOR UPDATE TO authenticated USING (public.is_site_member(production_id)) WITH CHECK (public.is_site_member(production_id));
CREATE POLICY "producer delete tasks" ON public.site_tasks FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'producer') OR created_by = auth.uid());

-- Documents
CREATE TABLE public.site_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  path text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  uploader_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_documents TO authenticated;
GRANT ALL ON public.site_documents TO service_role;
ALTER TABLE public.site_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read docs" ON public.site_documents FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "members add docs" ON public.site_documents FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid() AND public.is_site_member(production_id));
CREATE POLICY "uploader or producer delete docs" ON public.site_documents FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(),'producer'));

-- Attendance register (ins and outs)
CREATE TABLE public.site_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  crew_id text REFERENCES public.crew_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  person_name text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('in','out')),
  source text NOT NULL DEFAULT 'manual',
  latitude double precision,
  longitude double precision,
  distance_m integer,
  on_site boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_attendance TO authenticated;
GRANT ALL ON public.site_attendance TO service_role;
ALTER TABLE public.site_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read register" ON public.site_attendance FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "members mark own" ON public.site_attendance FOR INSERT TO authenticated WITH CHECK (public.is_site_member(production_id) AND (public.has_role(auth.uid(),'producer') OR (user_id = auth.uid() AND crew_id = public.my_crew_id())));
CREATE POLICY "producer manage register" ON public.site_attendance FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'producer'));

-- Ratings after a job
CREATE TABLE public.crew_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  production_id text REFERENCES public.productions(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  reviewer_id uuid NOT NULL DEFAULT auth.uid(),
  reviewer_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crew_id, production_id, reviewer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_reviews TO authenticated;
GRANT ALL ON public.crew_reviews TO service_role;
ALTER TABLE public.crew_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers manage reviews" ON public.crew_reviews FOR ALL TO authenticated USING (public.has_role(auth.uid(),'producer')) WITH CHECK (public.has_role(auth.uid(),'producer') AND reviewer_id = auth.uid());
CREATE POLICY "crew read own reviews" ON public.crew_reviews FOR SELECT TO authenticated USING (crew_id = public.my_crew_id());

CREATE OR REPLACE FUNCTION public.refresh_crew_rating() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ DECLARE cid text := COALESCE(NEW.crew_id, OLD.crew_id);
BEGIN
  UPDATE public.crew_members SET rating = COALESCE((SELECT round(avg(rating)::numeric, 1) FROM public.crew_reviews WHERE crew_id = cid), rating) WHERE id = cid;
  RETURN NULL;
END $$;
CREATE TRIGGER crew_reviews_rating AFTER INSERT OR UPDATE OR DELETE ON public.crew_reviews FOR EACH ROW EXECUTE FUNCTION public.refresh_crew_rating();

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  production_id text REFERENCES public.productions(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own notifications delete" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_site_post() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ DECLARE pname text;
BEGIN
  SELECT name INTO pname FROM public.productions WHERE id = NEW.production_id;
  INSERT INTO public.notifications (user_id, production_id, title, body)
  SELECT DISTINCT u, NEW.production_id, NEW.author_name || ' posted on ' || COALESCE(pname, 'a production'),
         left(COALESCE(NULLIF(NEW.body, ''), NEW.transcript, 'New attachment'), 140)
  FROM (
    SELECT c.user_id AS u FROM public.bookings b JOIN public.crew_members c ON c.id = b.crew_id
      WHERE b.production_id = NEW.production_id AND c.user_id IS NOT NULL AND b.status <> 'Declined'
    UNION SELECT r.user_id FROM public.user_roles r WHERE r.role = 'producer'
  ) m WHERE u <> NEW.author_id;
  RETURN NEW;
END $$;
CREATE TRIGGER site_posts_notify AFTER INSERT ON public.site_posts FOR EACH ROW EXECUTE FUNCTION public.notify_site_post();

ALTER PUBLICATION supabase_realtime ADD TABLE public.site_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
