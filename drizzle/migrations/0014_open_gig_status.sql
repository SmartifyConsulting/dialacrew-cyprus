-- Must be its own migration: a new enum value can't be used in the same
-- transaction/migration that adds it.
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'open';
