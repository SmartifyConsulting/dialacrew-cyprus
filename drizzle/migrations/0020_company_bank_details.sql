-- Producer company bank details. Required on company settings; owners update them through the existing
-- "owners update own company" policy, and company members can read them.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS bank_account_holder text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_branch_code text;
