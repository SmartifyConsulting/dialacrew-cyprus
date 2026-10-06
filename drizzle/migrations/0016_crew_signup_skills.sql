ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  company_name text := NEW.raw_user_meta_data->>'company_name';
  invite_token text := NEW.raw_user_meta_data->>'invite_token';
  skills_in text[];
  chosen public.app_role;
  new_company_id uuid;
  invite record;
BEGIN
  SELECT COALESCE(array_agg(x), '{}') INTO skills_in FROM jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'skills', '[]'::jsonb)) x;

  INSERT INTO public.profiles (id, email, full_name, phone, skills)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.raw_user_meta_data->>'phone', skills_in)
  ON CONFLICT (id) DO NOTHING;

  IF invite_token IS NOT NULL THEN
    SELECT * INTO invite FROM public.company_invites WHERE token = invite_token::uuid AND status = 'pending';
  END IF;

  IF invite.id IS NOT NULL THEN
    chosen := 'producer';
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, chosen);
    INSERT INTO public.company_users (company_id, user_id, company_role) VALUES (invite.company_id, NEW.id, invite.company_role);
    UPDATE public.company_invites SET status = 'accepted', accepted_at = now() WHERE id = invite.id;
    INSERT INTO public.memberships (user_id, membership_type, plan_id)
    VALUES (NEW.id, 'producer', (SELECT id FROM public.membership_plans WHERE membership_type = 'producer' AND active LIMIT 1));
    RETURN NEW;
  END IF;

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

-- claim_crew_profile() now seeds the new crew_members row's skills from
-- whatever the crew member picked at signup.
CREATE OR REPLACE FUNCTION public.claim_crew_profile() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE cid text; em text; nm text; sk text[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO cid FROM public.crew_members WHERE user_id = auth.uid() LIMIT 1;
  IF cid IS NOT NULL THEN RETURN cid; END IF;
  IF NOT public.has_role(auth.uid(), 'crew') THEN RETURN NULL; END IF;
  SELECT email, full_name, skills INTO em, nm, sk FROM public.profiles WHERE id = auth.uid();
  UPDATE public.crew_members SET user_id = auth.uid()
    WHERE id = (SELECT id FROM public.crew_members WHERE user_id IS NULL AND lower(email) = lower(em) AND em <> '' LIMIT 1)
    RETURNING id INTO cid;
  IF cid IS NULL THEN
    INSERT INTO public.crew_members (name, role, department, email, user_id, skills)
    VALUES (COALESCE(NULLIF(nm, ''), em), COALESCE(sk[1], 'Crew'), 'General', em, auth.uid(), COALESCE(sk, '{}')) RETURNING id INTO cid;
  END IF;
  RETURN cid;
END $$;
