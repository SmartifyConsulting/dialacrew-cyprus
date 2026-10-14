-- Crew banking details for international transfers, encrypted at rest. Sensitive fields are stored only
-- as pgcrypto ciphertext; the symmetric key lives in Supabase Vault, never in application code or the
-- database schema itself, and is only ever read inside SECURITY DEFINER functions on the server.
--
-- ONE-TIME MANUAL STEP before this works: run, once, with your own long random secret
-- (e.g. generate one with `openssl rand -base64 32` and paste it in place of the placeholder):
--
--   select vault.create_secret('REPLACE-WITH-A-LONG-RANDOM-SECRET', 'banking_details_key');
--
-- Do not reuse this value anywhere else, and do not commit the real secret to source control.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.crew_banking_details (
  crew_id text PRIMARY KEY REFERENCES public.crew_members(id) ON DELETE CASCADE,
  account_holder_name text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  bank_country text NOT NULL DEFAULT '',
  bank_address text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT '',
  account_number_enc bytea,
  iban_enc bytea,
  swift_bic_enc bytea,
  routing_or_sort_code_enc bytea,
  notes_enc bytea,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crew_banking_details ENABLE ROW LEVEL SECURITY;

-- No policy is created, and table grants are revoked below — every read/write goes through the
-- SECURITY DEFINER functions, which enforce "self or producer/admin" and do the encrypt/decrypt.
REVOKE ALL ON public.crew_banking_details FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.banking_key() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault, extensions AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'banking_details_key' LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_access_banking(_crew_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.crew_members WHERE id = _crew_id AND user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.upsert_banking_details(
  _crew_id text, _account_holder_name text, _bank_name text, _bank_country text, _bank_address text,
  _account_number text, _iban text, _swift_bic text, _routing_or_sort_code text, _currency text, _notes text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.can_access_banking(_crew_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.crew_banking_details (
    crew_id, account_holder_name, bank_name, bank_country, bank_address,
    account_number_enc, iban_enc, swift_bic_enc, routing_or_sort_code_enc, currency, notes_enc, updated_by, updated_at
  ) VALUES (
    _crew_id, coalesce(_account_holder_name, ''), coalesce(_bank_name, ''), coalesce(_bank_country, ''), coalesce(_bank_address, ''),
    pgp_sym_encrypt(coalesce(_account_number, ''), public.banking_key()),
    pgp_sym_encrypt(coalesce(_iban, ''), public.banking_key()),
    pgp_sym_encrypt(coalesce(_swift_bic, ''), public.banking_key()),
    pgp_sym_encrypt(coalesce(_routing_or_sort_code, ''), public.banking_key()),
    coalesce(_currency, ''),
    pgp_sym_encrypt(coalesce(_notes, ''), public.banking_key()),
    auth.uid(), now()
  )
  ON CONFLICT (crew_id) DO UPDATE SET
    account_holder_name = excluded.account_holder_name,
    bank_name = excluded.bank_name,
    bank_country = excluded.bank_country,
    bank_address = excluded.bank_address,
    account_number_enc = excluded.account_number_enc,
    iban_enc = excluded.iban_enc,
    swift_bic_enc = excluded.swift_bic_enc,
    routing_or_sort_code_enc = excluded.routing_or_sort_code_enc,
    currency = excluded.currency,
    notes_enc = excluded.notes_enc,
    updated_by = excluded.updated_by,
    updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.get_banking_details(_crew_id text)
RETURNS TABLE (
  account_holder_name text, bank_name text, bank_country text, bank_address text,
  account_number text, iban text, swift_bic text, routing_or_sort_code text, currency text, notes text, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.can_access_banking(_crew_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT b.account_holder_name, b.bank_name, b.bank_country, b.bank_address,
      pgp_sym_decrypt(b.account_number_enc, public.banking_key()),
      pgp_sym_decrypt(b.iban_enc, public.banking_key()),
      pgp_sym_decrypt(b.swift_bic_enc, public.banking_key()),
      pgp_sym_decrypt(b.routing_or_sort_code_enc, public.banking_key()),
      b.currency, pgp_sym_decrypt(b.notes_enc, public.banking_key()), b.updated_at
    FROM public.crew_banking_details b WHERE b.crew_id = _crew_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_banking_details(text,text,text,text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_banking_details(text) TO authenticated;
