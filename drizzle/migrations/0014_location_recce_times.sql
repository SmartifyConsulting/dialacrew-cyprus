ALTER TABLE public.production_locations ADD COLUMN IF NOT EXISTS recce_start_time time, ADD COLUMN IF NOT EXISTS recce_end_time time;
CREATE OR REPLACE FUNCTION public.validate_recce_times() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.recce_start_time IS NOT NULL AND NEW.recce_end_time IS NOT NULL AND NEW.recce_end_time <= NEW.recce_start_time THEN
    RAISE EXCEPTION 'Recce end time must be after start time';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS production_locations_recce_times ON public.production_locations;
CREATE TRIGGER production_locations_recce_times BEFORE INSERT OR UPDATE ON public.production_locations FOR EACH ROW EXECUTE FUNCTION public.validate_recce_times();