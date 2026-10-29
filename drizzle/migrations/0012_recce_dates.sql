ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS recce_date date;
ALTER TABLE public.production_locations ADD COLUMN IF NOT EXISTS recce_date date;