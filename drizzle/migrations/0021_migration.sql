ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS spotlight_links jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.post_production_change_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE msg text := ''; who uuid := auth.uid(); who_name text;
BEGIN
  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.days IS DISTINCT FROM OLD.days THEN
    msg := msg || 'Shoot rescheduled: now ' || COALESCE(to_char(NEW.date, 'DD Mon YYYY'), 'date TBC')
      || CASE WHEN NEW.end_date IS NOT NULL AND NEW.end_date <> NEW.date THEN ' to ' || to_char(NEW.end_date, 'DD Mon YYYY') ELSE '' END
      || ' (' || COALESCE(NEW.days, 1) || ' day(s)). ';
  END IF;
  IF NEW.recce_date IS DISTINCT FROM OLD.recce_date THEN
    msg := msg || 'Recce date changed to ' || COALESCE(to_char(NEW.recce_date, 'DD Mon YYYY'), 'TBC') || '. ';
  END IF;
  IF NEW.address IS DISTINCT FROM OLD.address OR NEW.location IS DISTINCT FROM OLD.location THEN
    msg := msg || 'Location changed to ' || COALESCE(NULLIF(NEW.location, ''), 'TBC') || '. ';
  END IF;
  IF msg = '' OR who IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE production_id = NEW.id AND status <> 'cancelled') THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(full_name, ''), 'Production') INTO who_name FROM public.profiles WHERE id = who;
  INSERT INTO public.posts (production_id, author_id, author_name, body)
  VALUES (NEW.id, who, COALESCE(who_name, 'Production'), msg || 'All pencilled and booked crew: please check your availability.');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS productions_change_notice ON public.productions;
CREATE TRIGGER productions_change_notice AFTER UPDATE ON public.productions
FOR EACH ROW EXECUTE FUNCTION public.post_production_change_notice();