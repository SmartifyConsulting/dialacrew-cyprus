CREATE TABLE public.company_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  company_role public.company_role NOT NULL DEFAULT 'producer',
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  invited_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.company_invites TO authenticated;
GRANT ALL ON public.company_invites TO service_role;
ALTER TABLE public.company_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage invites" ON public.company_invites FOR ALL TO authenticated USING (
  public.is_company_owner(company_id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
) WITH CHECK (
  public.is_company_owner(company_id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
);

-- Public, narrow lookup by token only (never lists invites in bulk) so the
-- signup page can show "join <Company> as <role>" without exposing the
-- invites table itself to anonymous visitors.
CREATE OR REPLACE FUNCTION public.get_invite(_token uuid)
RETURNS TABLE (company_name text, company_role public.company_role, email text, valid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.name, ci.company_role, ci.email, (ci.status = 'pending')
  FROM public.company_invites ci JOIN public.companies c ON c.id = ci.company_id
  WHERE ci.token = _token
$$;
GRANT EXECUTE ON FUNCTION public.get_invite(uuid) TO anon, authenticated;

-- Accepting an invite takes priority over the normal first-producer/
-- self-signup rules: it works even when producer_self_signup_enabled is off,
-- since the owner explicitly vouched for this person.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested text := NEW.raw_user_meta_data->>'role';
  company_name text := NEW.raw_user_meta_data->>'company_name';
  invite_token text := NEW.raw_user_meta_data->>'invite_token';
  chosen public.app_role;
  new_company_id uuid;
  invite record;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.raw_user_meta_data->>'phone')
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

-- Scope productions to the producer's own company so "view that production
-- company's jobs" actually means something. Nullable company_id keeps
-- existing productions (created before this) visible to all producers.
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

DROP POLICY "producers all" ON public.productions;
CREATE POLICY "producers all" ON public.productions FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'producer') AND (
    company_id IS NULL OR public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
  )
) WITH CHECK (
  public.has_role(auth.uid(), 'producer') AND (
    company_id IS NULL OR public.is_company_member(company_id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
  )
);
