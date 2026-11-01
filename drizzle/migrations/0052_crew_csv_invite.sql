-- CSV crew import now invites each imported crew member by email (via Supabase Auth's built-in
-- invite email, sent server-side with the service role key). When they accept, this links their
-- new auth account straight to the crew_members row the CSV created, instead of leaving it unclaimed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  company_name text := NEW.raw_user_meta_data->>'company_name';
  invite_token text := NEW.raw_user_meta_data->>'invite_token';
  crew_invite_id text := NEW.raw_user_meta_data->>'crew_id';
  skills_in text[];
  chosen public.app_role;
  new_company_id uuid;
  inv_id uuid; inv_company uuid; inv_role public.company_role;
  dom text := public.email_domain_of(NEW.email);
  dom_company uuid;
BEGIN
  SELECT COALESCE(array_agg(x), '{}') INTO skills_in FROM jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'skills', '[]'::jsonb)) x;
  INSERT INTO public.profiles (id, email, full_name, phone, skills, social_opt_in)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), NEW.raw_user_meta_data->>'phone', skills_in,
          COALESCE((NEW.raw_user_meta_data->>'social_opt_in')::boolean, false))
  ON CONFLICT (id) DO NOTHING;
  IF invite_token IS NOT NULL AND length(invite_token) > 0 THEN
    SELECT id, company_id, company_role INTO inv_id, inv_company, inv_role
    FROM public.company_invites WHERE token = invite_token::uuid AND status = 'pending' AND lower(email) = lower(NEW.email);
  END IF;
  IF inv_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'producer');
    INSERT INTO public.company_users (company_id, user_id, company_role, is_admin) VALUES (inv_company, NEW.id, inv_role, public.company_should_auto_admin(inv_company));
    UPDATE public.company_invites SET status = 'accepted', accepted_at = now() WHERE id = inv_id;
    INSERT INTO public.memberships (user_id, membership_type, plan_id)
    VALUES (NEW.id, 'producer', (SELECT id FROM public.membership_plans WHERE membership_type = 'producer' AND active LIMIT 1));
    RETURN NEW;
  END IF;
  -- Crew member accepting an invite sent from a CSV import: claim their crew_members row.
  IF crew_invite_id IS NOT NULL AND length(crew_invite_id) > 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'crew');
    UPDATE public.crew_members SET user_id = NEW.id WHERE id = crew_invite_id AND user_id IS NULL;
    INSERT INTO public.memberships (user_id, membership_type, plan_id)
    VALUES (NEW.id, 'crew', (SELECT id FROM public.membership_plans WHERE membership_type = 'crew' AND active LIMIT 1));
    RETURN NEW;
  END IF;
  -- Company staff signing up with a domain that already belongs to a company: needs admin approval
  IF requested = 'producer' AND dom IS NOT NULL THEN
    SELECT id INTO dom_company FROM public.companies WHERE email_domain = dom;
    IF dom_company IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
      INSERT INTO public.company_join_requests (company_id, user_id, email, full_name)
      VALUES (dom_company, NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
      RETURN NEW;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'producer') THEN chosen := 'producer';
  ELSIF requested = 'crew' THEN chosen := 'crew';
  ELSIF requested = 'producer' AND company_name IS NOT NULL AND length(trim(company_name)) > 0 THEN chosen := 'producer';
  ELSE chosen := 'client';
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
      INSERT INTO public.company_users (company_id, user_id, company_role, is_admin) VALUES (new_company_id, NEW.id, 'owner', true);
      -- Domain is only claimed once the email address is verified
      IF NEW.email_confirmed_at IS NOT NULL AND dom IS NOT NULL THEN
        UPDATE public.companies SET email_domain = dom WHERE id = new_company_id AND NOT EXISTS (SELECT 1 FROM public.companies WHERE email_domain = dom);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
