-- Companies (production companies / brand-side orgs). A user can belong to
-- more than one company later; for now each producer signup creates one.
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_email text,
  phone text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.company_role AS ENUM ('owner', 'producer', 'production_manager', 'accounts');

CREATE TABLE public.company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_role public.company_role NOT NULL DEFAULT 'producer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

-- Admin-configurable membership pricing. Never hardcode a price in app code —
-- read it from here. price_cents = 0 means "not yet priced" (TBD by admin).
CREATE TABLE public.membership_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_type public.app_role NOT NULL CHECK (membership_type IN ('crew', 'producer')),
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One membership row per user per paid role. A user who is both crew and
-- producer pays (and is tracked) separately for each.
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_type public.app_role NOT NULL CHECK (membership_type IN ('crew', 'producer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'cancelled')),
  plan_id uuid REFERENCES public.membership_plans(id),
  started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, membership_type)
);

-- A single admin-managed key/value settings table, so toggles like
-- "is self-service producer signup open" don't require a code deploy.
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings (key, value) VALUES
  ('producer_self_signup_enabled', 'false'::jsonb);

GRANT SELECT ON public.companies, public.company_users, public.membership_plans, public.platform_settings TO authenticated;
GRANT SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.companies, public.company_users, public.membership_plans, public.memberships, public.platform_settings TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read own company" ON public.companies FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = companies.id AND cu.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "owners update own company" ON public.companies FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = companies.id AND cu.user_id = auth.uid() AND cu.company_role = 'owner')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "read own company membership rows" ON public.company_users FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = company_users.company_id AND cu.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "owners manage company users" ON public.company_users FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = company_users.company_id AND cu.user_id = auth.uid() AND cu.company_role = 'owner')
  OR public.has_role(auth.uid(), 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.company_id = company_users.company_id AND cu.user_id = auth.uid() AND cu.company_role = 'owner')
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "signed in read plans" ON public.membership_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage plans" ON public.membership_plans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "read own memberships" ON public.memberships FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin manage memberships" ON public.memberships FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "signed in read settings" ON public.platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage settings" ON public.platform_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the two membership plans (crew, producer) with TBD pricing.
INSERT INTO public.membership_plans (membership_type, price_cents, currency) VALUES
  ('crew', 0, 'ZAR'),
  ('producer', 0, 'ZAR');

-- Extend signup: a producer signup with a company_name creates a company
-- (signer becomes owner) and a pending producer membership; a crew signup
-- gets a pending crew membership. Client signups are unaffected (no company,
-- no membership — matches the spec: only crew/producer pay).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  company_name text := NEW.raw_user_meta_data->>'company_name';
  chosen public.app_role;
  new_company_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'producer') THEN
    chosen := 'producer';
  ELSIF requested = 'crew' THEN
    chosen := 'crew';
  ELSIF requested = 'producer' AND company_name IS NOT NULL AND length(trim(company_name)) > 0 THEN
    chosen := 'producer';
  ELSE
    chosen := 'client';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, chosen);

  IF chosen = 'crew' THEN
    INSERT INTO public.memberships (user_id, membership_type, plan_id)
    VALUES (NEW.id, 'crew', (SELECT id FROM public.membership_plans WHERE membership_type = 'crew' AND active LIMIT 1));
  ELSIF chosen = 'producer' THEN
    INSERT INTO public.memberships (user_id, membership_type, plan_id)
    VALUES (NEW.id, 'producer', (SELECT id FROM public.membership_plans WHERE membership_type = 'producer' AND active LIMIT 1));
    IF company_name IS NOT NULL AND length(trim(company_name)) > 0 THEN
      INSERT INTO public.companies (name) VALUES (trim(company_name)) RETURNING id INTO new_company_id;
      INSERT INTO public.company_users (company_id, user_id, company_role) VALUES (new_company_id, NEW.id, 'owner');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
