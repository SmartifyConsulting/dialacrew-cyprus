ALTER TYPE public.company_role ADD VALUE IF NOT EXISTS 'other';
ALTER TABLE public.company_invites ADD COLUMN IF NOT EXISTS role_title text;