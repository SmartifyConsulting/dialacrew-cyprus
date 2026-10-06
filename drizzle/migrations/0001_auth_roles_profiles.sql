ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
COMMENT ON COLUMN public.profiles.role IS 'DEPRECATED: roles live in public.user_roles';
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TYPE public.app_role AS ENUM ('producer', 'crew', 'client');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- First account ever becomes producer; others may pick crew or client (never producer).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  chosen public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'producer') THEN
    chosen := 'producer';
  ELSIF requested = 'crew' THEN
    chosen := 'crew';
  ELSE
    chosen := 'client';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, chosen);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP POLICY "open access" ON public.productions;
DROP POLICY "open access" ON public.crew_members;
DROP POLICY "open access" ON public.bookings;
DROP POLICY "open access" ON public.change_requests;
REVOKE ALL ON public.productions, public.crew_members, public.bookings, public.change_requests FROM anon;

CREATE POLICY "producers all" ON public.productions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'producer')) WITH CHECK (public.has_role(auth.uid(), 'producer'));
CREATE POLICY "signed in read" ON public.productions FOR SELECT TO authenticated USING (true);
CREATE POLICY "producers all" ON public.crew_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'producer')) WITH CHECK (public.has_role(auth.uid(), 'producer'));
CREATE POLICY "producers all" ON public.bookings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'producer')) WITH CHECK (public.has_role(auth.uid(), 'producer'));
CREATE POLICY "producers all" ON public.change_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'producer')) WITH CHECK (public.has_role(auth.uid(), 'producer'));