-- Must be its own migration: a new enum value can't be used in the same
-- transaction/migration that adds it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
