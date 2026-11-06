-- Part 1: crew passport details, needed to book international flights. Follows the same
-- encrypted-at-rest + SECURITY DEFINER RPC pattern as crew_banking_details (see 0008).
--
-- ONE-TIME MANUAL STEP before this works: run, once, with your own long random secret
-- (generate one with `openssl rand -base64 32` and paste it in place of the placeholder):
--
--   select vault.create_secret('REPLACE-WITH-A-LONG-RANDOM-SECRET', 'passport_details_key');
--
-- Do not reuse this value anywhere else, and do not commit the real secret to source control.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.crew_passport_details (
  crew_id text PRIMARY KEY REFERENCES public.crew_members(id) ON DELETE CASCADE,
  passport_name text NOT NULL DEFAULT '', -- full name exactly as printed in the passport
  expiry_date date,
  passport_number_enc bytea,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crew_passport_details ENABLE ROW LEVEL SECURITY;

-- No policy is created, and table grants are revoked below — every read/write goes through the
-- SECURITY DEFINER functions, which enforce "self or producer/admin" and do the encrypt/decrypt.
REVOKE ALL ON public.crew_passport_details FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.passport_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault, extensions AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'passport_details_key' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_access_passport(_crew_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.crew_members WHERE id = _crew_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.upsert_passport_details(
  _crew_id text, _passport_name text, _passport_number text, _expiry_date date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.can_access_passport(_crew_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.crew_passport_details (crew_id, passport_name, expiry_date, passport_number_enc, updated_by, updated_at)
  VALUES (_crew_id, coalesce(_passport_name, ''), _expiry_date, pgp_sym_encrypt(coalesce(_passport_number, ''), public.passport_key()), auth.uid(), now())
  ON CONFLICT (crew_id) DO UPDATE SET
    passport_name = excluded.passport_name,
    expiry_date = excluded.expiry_date,
    passport_number_enc = excluded.passport_number_enc,
    updated_by = excluded.updated_by,
    updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.get_passport_details(_crew_id text)
RETURNS TABLE (passport_name text, passport_number text, expiry_date date, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.can_access_passport(_crew_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT d.passport_name, pgp_sym_decrypt(d.passport_number_enc, public.passport_key()), d.expiry_date, d.updated_at
    FROM public.crew_passport_details d WHERE d.crew_id = _crew_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_passport_details(text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_passport_details(text) TO authenticated;

-- Part 2: travel costing. Not sensitive, so plain columns like the rest of productions/bookings.
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS travel_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS travel_flight_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_visa_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_accommodation_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_food_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_per_diem_rate numeric NOT NULL DEFAULT 0; -- per day; total = rate × booking.days
