-- Cover picture for a production, shown in a rounded square before the production name. Only producers can change it.
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS image_path text;
