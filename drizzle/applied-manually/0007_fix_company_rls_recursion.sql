-- The company_users/companies policies queried company_users from within
-- their own policy, causing "infinite recursion detected in policy for
-- relation company_users". Fix with SECURITY DEFINER helpers (same pattern
-- as has_role()), which bypass RLS internally and break the cycle.

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_users WHERE company_id = _company_id AND user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_users WHERE company_id = _company_id AND user_id = _user_id AND company_role = 'owner')
$$;

DROP POLICY "members read own company" ON public.companies;
DROP POLICY "owners update own company" ON public.companies;
DROP POLICY "read own company membership rows" ON public.company_users;
DROP POLICY "owners manage company users" ON public.company_users;

CREATE POLICY "members read own company" ON public.companies FOR SELECT TO authenticated USING (
  public.is_company_member(id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "owners update own company" ON public.companies FOR UPDATE TO authenticated USING (
  public.is_company_owner(id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "read own company membership rows" ON public.company_users FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.is_company_member(company_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "owners manage company users" ON public.company_users FOR ALL TO authenticated USING (
  public.is_company_owner(company_id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
) WITH CHECK (
  public.is_company_owner(company_id, auth.uid()) OR public.has_role(auth.uid(), 'admin')
);
