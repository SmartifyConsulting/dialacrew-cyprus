ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  ADD COLUMN IF NOT EXISTS recce_start_time time,
  ADD COLUMN IF NOT EXISTS recce_end_time time,
  ADD COLUMN IF NOT EXISTS gear_pickup_date date,
  ADD COLUMN IF NOT EXISTS gear_pickup_time time,
  ADD COLUMN IF NOT EXISTS gear_dropoff_date date,
  ADD COLUMN IF NOT EXISTS gear_dropoff_time time;

CREATE OR REPLACE FUNCTION public.validate_production_schedule() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.recce_start_time IS NOT NULL AND NEW.recce_end_time IS NOT NULL AND NEW.recce_end_time <= NEW.recce_start_time THEN
    RAISE EXCEPTION 'Recce end time must be after start time';
  END IF;
  IF NEW.gear_pickup_date IS NOT NULL AND NEW.gear_dropoff_date IS NOT NULL THEN
    IF NEW.gear_dropoff_date < NEW.gear_pickup_date THEN
      RAISE EXCEPTION 'Gear drop-off must be after pickup';
    END IF;
    IF NEW.gear_dropoff_date = NEW.gear_pickup_date AND NEW.gear_pickup_time IS NOT NULL AND NEW.gear_dropoff_time IS NOT NULL AND NEW.gear_dropoff_time <= NEW.gear_pickup_time THEN
      RAISE EXCEPTION 'Gear drop-off must be after pickup';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS productions_validate_schedule ON public.productions;
CREATE TRIGGER productions_validate_schedule BEFORE INSERT OR UPDATE ON public.productions FOR EACH ROW EXECUTE FUNCTION public.validate_production_schedule();

ALTER TABLE public.crew_reviews
  ADD COLUMN IF NOT EXISTS framework text,
  ADD COLUMN IF NOT EXISTS scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS criterion_comments jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS work_again text,
  ADD COLUMN IF NOT EXISTS overall_score numeric;

CREATE OR REPLACE FUNCTION public.validate_crew_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ratee_user uuid;
BEGIN
  IF NEW.framework IS NOT NULL AND NEW.framework NOT IN ('cast','creative','crew') THEN RAISE EXCEPTION 'Unknown rating framework'; END IF;
  IF NEW.work_again IS NOT NULL AND NEW.work_again NOT IN ('yes','maybe','no') THEN RAISE EXCEPTION 'Invalid work-again answer'; END IF;
  IF NEW.framework IS NOT NULL AND NEW.work_again IS NULL THEN RAISE EXCEPTION 'Please answer whether you would work with them again'; END IF;
  SELECT user_id INTO ratee_user FROM public.crew_members WHERE id = NEW.crew_id;
  IF ratee_user IS NOT NULL AND ratee_user = NEW.reviewer_id THEN RAISE EXCEPTION 'You cannot rate yourself'; END IF;
  IF ratee_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = ratee_user AND role = 'producer') THEN
    RAISE EXCEPTION 'Producers are not rated';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.production_id IS NULL THEN RAISE EXCEPTION 'A rating must belong to a production'; END IF;
    IF NOT (
      EXISTS (SELECT 1 FROM public.bookings b WHERE b.production_id = NEW.production_id AND b.crew_id = NEW.crew_id
              AND b.status IN ('awaiting_review','payment_released','completed'))
      OR EXISTS (SELECT 1 FROM public.site_wraps w WHERE w.production_id = NEW.production_id AND w.crew_id = NEW.crew_id)
      OR EXISTS (SELECT 1 FROM public.productions p WHERE p.id = NEW.production_id AND p.status = 'Wrapped')
    ) THEN
      RAISE EXCEPTION 'You can rate this person once they have wrapped or completed the job';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crew_reviews_validate ON public.crew_reviews;
CREATE TRIGGER crew_reviews_validate BEFORE INSERT OR UPDATE ON public.crew_reviews FOR EACH ROW EXECUTE FUNCTION public.validate_crew_review();

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  user_id uuid PRIMARY KEY,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_feed_tokens TO authenticated;
GRANT ALL ON public.calendar_feed_tokens TO service_role;
ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feed token" ON public.calendar_feed_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());