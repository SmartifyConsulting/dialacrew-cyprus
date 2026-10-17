-- Store the country a user signed up with (set at sign-up for producers).
-- Runs after on_auth_user_created, which creates the profile row (triggers fire in name order).
CREATE OR REPLACE FUNCTION public.save_signup_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'country' IS NOT NULL THEN
    UPDATE public.profiles SET country = NEW.raw_user_meta_data->>'country' WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS zz_save_signup_country ON auth.users;
CREATE TRIGGER zz_save_signup_country AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.save_signup_country();

-- Each production is priced in the currency of its creator's country (mirrors src/lib/countries.ts).
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ZAR';

CREATE OR REPLACE FUNCTION public.set_production_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text;
BEGIN
  SELECT country INTO c FROM public.profiles WHERE id = auth.uid();
  NEW.currency := CASE c
    WHEN 'ZA' THEN 'ZAR' WHEN 'CY' THEN 'EUR' WHEN 'GB' THEN 'GBP' WHEN 'US' THEN 'USD'
    WHEN 'NA' THEN 'NAD' WHEN 'BW' THEN 'BWP' WHEN 'ZW' THEN 'USD' WHEN 'KE' THEN 'KES'
    WHEN 'NG' THEN 'NGN' WHEN 'AU' THEN 'AUD' WHEN 'DE' THEN 'EUR' WHEN 'FR' THEN 'EUR'
    WHEN 'AE' THEN 'AED' ELSE NEW.currency END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS productions_set_currency ON public.productions;
CREATE TRIGGER productions_set_currency BEFORE INSERT ON public.productions
  FOR EACH ROW EXECUTE FUNCTION public.set_production_currency();
