-- ===== Company email domains & approvals =====
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email_domain text UNIQUE;
ALTER TABLE public.company_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
UPDATE public.company_users SET is_admin = true WHERE company_role = 'owner';

CREATE TABLE public.company_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT ON public.company_join_requests TO authenticated;
GRANT ALL ON public.company_join_requests TO service_role;
ALTER TABLE public.company_join_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_company_admin(_company uuid, _user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_users WHERE company_id=_company AND user_id=_user AND (is_admin OR company_role='owner'));
$$;
GRANT EXECUTE ON FUNCTION public.is_company_admin(uuid, uuid) TO authenticated;

CREATE POLICY "own join request" ON public.company_join_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "company admins read requests" ON public.company_join_requests FOR SELECT TO authenticated USING (public.is_company_admin(company_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.email_domain_of(_email text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN lower(split_part(_email,'@',2)) IN ('gmail.com','googlemail.com','yahoo.com','yahoo.co.za','outlook.com','hotmail.com','live.com','icloud.com','me.com','aol.com','proton.me','protonmail.com','mweb.co.za','telkomsa.net','webmail.co.za','vodamail.co.za') THEN NULL
  ELSE NULLIF(lower(split_part(_email,'@',2)),'') END;
$$;

-- Admin count helper: owner + next 2 become admins automatically
CREATE OR REPLACE FUNCTION public.company_should_auto_admin(_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*) FROM public.company_users WHERE company_id=_company AND (is_admin OR company_role='owner')) < 3;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  company_name text := NEW.raw_user_meta_data->>'company_name';
  invite_token text := NEW.raw_user_meta_data->>'invite_token';
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

-- Claim the domain when the owner verifies their email
CREATE OR REPLACE FUNCTION public.claim_company_domain_on_confirm() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE dom text := public.email_domain_of(NEW.email);
BEGIN
  IF dom IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies WHERE email_domain = dom) THEN
    UPDATE public.companies c SET email_domain = dom
    WHERE c.email_domain IS NULL AND c.id = (SELECT company_id FROM public.company_users WHERE user_id = NEW.id AND company_role='owner' LIMIT 1);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_confirmed_claim_domain ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_claim_domain AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.claim_company_domain_on_confirm();

CREATE OR REPLACE FUNCTION public.decide_join_request(_request uuid, _approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.company_join_requests;
BEGIN
  SELECT * INTO r FROM public.company_join_requests WHERE id=_request FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.is_company_admin(r.company_id, auth.uid()) THEN RAISE EXCEPTION 'Only company admins can approve'; END IF;
  UPDATE public.company_join_requests SET status = CASE WHEN _approve THEN 'approved' ELSE 'declined' END, decided_by=auth.uid(), decided_at=now() WHERE id=_request;
  IF _approve THEN
    DELETE FROM public.user_roles WHERE user_id=r.user_id AND role='client';
    INSERT INTO public.user_roles (user_id, role) VALUES (r.user_id, 'producer') ON CONFLICT DO NOTHING;
    INSERT INTO public.company_users (company_id, user_id, company_role, is_admin)
    VALUES (r.company_id, r.user_id, 'producer', public.company_should_auto_admin(r.company_id));
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.decide_join_request(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_company_admin(_company uuid, _user uuid, _admin boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_company_admin(_company, auth.uid()) THEN RAISE EXCEPTION 'Only company admins can change admins'; END IF;
  IF EXISTS (SELECT 1 FROM public.company_users WHERE company_id=_company AND user_id=_user AND company_role='owner') THEN RAISE EXCEPTION 'The primary admin cannot be changed'; END IF;
  UPDATE public.company_users SET is_admin=_admin WHERE company_id=_company AND user_id=_user;
END $$;
GRANT EXECUTE ON FUNCTION public.set_company_admin(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.company_team(_company uuid) RETURNS TABLE(user_id uuid, full_name text, email text, company_role public.company_role, is_admin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cu.user_id, p.full_name, p.email, cu.company_role, (cu.is_admin OR cu.company_role='owner')
  FROM public.company_users cu LEFT JOIN public.profiles p ON p.id = cu.user_id
  WHERE cu.company_id=_company AND public.is_company_member(_company, auth.uid())
  ORDER BY (cu.company_role='owner') DESC, cu.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.company_team(uuid) TO authenticated;

-- ===== Social spotlight =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS spotlight_featured_at timestamptz;

-- ===== Paystack =====
CREATE TABLE public.payment_cards (
  user_id uuid PRIMARY KEY,
  authorization_code text NOT NULL,
  email text NOT NULL,
  last4 text, card_type text, bank text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (user_id, last4, card_type, bank, updated_at) ON public.payment_cards TO authenticated;
GRANT ALL ON public.payment_cards TO service_role;
ALTER TABLE public.payment_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card" ON public.payment_cards FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.gig_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid NOT NULL REFERENCES public.community_gigs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','charged','failed')),
  reference text,
  failure text,
  charged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gig_penalties TO authenticated;
GRANT ALL ON public.gig_penalties TO service_role;
ALTER TABLE public.gig_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin penalties" ON public.gig_penalties FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Securing now requires a verified payment, done by the server only
REVOKE EXECUTE ON FUNCTION public.secure_gig(uuid) FROM authenticated, anon, public;
CREATE OR REPLACE FUNCTION public.secure_gig_paid(_gig uuid, _user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.community_gigs; nm text;
BEGIN
  IF NOT public.has_role(_user,'crew') THEN RAISE EXCEPTION 'Only crew can secure gigs'; END IF;
  SELECT * INTO g FROM public.community_gigs WHERE id=_gig FOR UPDATE;
  IF g.id IS NULL OR g.status <> 'open' OR g.expires_at <= now() THEN RAISE EXCEPTION 'This gig is no longer available'; END IF;
  IF g.posted_by = _user THEN RAISE EXCEPTION 'You cannot secure your own gig'; END IF;
  SELECT COALESCE(NULLIF(full_name,''), email) INTO nm FROM public.profiles WHERE id=_user;
  UPDATE public.community_gigs SET status='secured', secured_by=_user, secured_name=nm, secured_at=now() WHERE id=_gig;
END $$;
REVOKE EXECUTE ON FUNCTION public.secure_gig_paid(uuid, uuid) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.secure_gig_paid(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.withdraw_from_gig(_gig uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.community_gigs; starts timestamptz; pen numeric := 0; hrs numeric;
BEGIN
  SELECT * INTO g FROM public.community_gigs WHERE id=_gig FOR UPDATE;
  IF g.secured_by IS DISTINCT FROM auth.uid() OR g.status <> 'secured' THEN RAISE EXCEPTION 'Not your gig'; END IF;
  starts := (g.event_date + g.call_time) AT TIME ZONE 'Africa/Johannesburg';
  hrs := public.gig_setting('gig_notice_hours', 24);
  IF starts - now() < make_interval(hours => hrs::int) THEN
    pen := public.gig_setting('gig_penalty_fee', 500);
    UPDATE public.community_gigs SET status='open', secured_by=NULL, secured_name=NULL, secured_at=NULL, penalty_amount=penalty_amount+pen, penalty_reason='Late withdrawal (under '||hrs::int||' hours)' WHERE id=_gig;
    INSERT INTO public.gig_penalties (gig_id, user_id, amount, reason) VALUES (_gig, auth.uid(), pen, 'Late withdrawal');
  ELSE
    UPDATE public.community_gigs SET status='open', secured_by=NULL, secured_name=NULL, secured_at=NULL WHERE id=_gig;
  END IF;
  RETURN pen;
END $$;

CREATE OR REPLACE FUNCTION public.report_gig_no_show(_gig uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.community_gigs; pen numeric;
BEGIN
  SELECT * INTO g FROM public.community_gigs WHERE id=_gig FOR UPDATE;
  IF g.posted_by <> auth.uid() OR g.status <> 'secured' THEN RAISE EXCEPTION 'Only the poster can report a no-show'; END IF;
  pen := public.gig_setting('gig_penalty_fee', 500);
  UPDATE public.community_gigs SET status='no_show', penalty_amount=penalty_amount+pen, penalty_reason='No-show / not delivered' WHERE id=_gig;
  INSERT INTO public.gig_penalties (gig_id, user_id, amount, reason) VALUES (_gig, g.secured_by, pen, 'No-show / not delivered');
  RETURN pen;
END $$;