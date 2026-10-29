-- Immutable, database-generated Job ID; optional external production reference.
CREATE SEQUENCE IF NOT EXISTS public.production_job_number_seq;
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS external_ref text;

-- Move the sequence beyond existing generated-style IDs, if any.
SELECT setval('public.production_job_number_seq',
  GREATEST(1, COALESCE((SELECT max(substring(job_id from '^JOB-([0-9]+)$')::bigint)
    FROM public.productions WHERE job_id ~ '^JOB-[0-9]+$'), 0) + 1), false);

CREATE OR REPLACE FUNCTION public.assign_production_job_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
   NEW.job_id := 'JOB-' || lpad(nextval('public.production_job_number_seq')::text, 6, '0');
 ELSIF NEW.job_id IS DISTINCT FROM OLD.job_id THEN
   RAISE EXCEPTION 'Job ID is generated automatically and cannot be changed';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS assign_production_job_id ON public.productions;
CREATE TRIGGER assign_production_job_id BEFORE INSERT OR UPDATE ON public.productions
 FOR EACH ROW EXECUTE FUNCTION public.assign_production_job_id();

-- Assign a Job ID to older records that were created without one.
UPDATE public.productions SET job_id = 'JOB-' || lpad(nextval('public.production_job_number_seq')::text, 6, '0')
 WHERE job_id IS NULL OR btrim(job_id) = '';
ALTER TABLE public.productions ALTER COLUMN job_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS production_job_id_unique ON public.productions(job_id);
COMMENT ON COLUMN public.productions.external_ref IS 'Optional producer-entered reference in an external system such as Farmers Wife';
