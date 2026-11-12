-- Record future assignment changes; do not invent history for existing items.
ALTER TABLE public.site_tasks
  ADD COLUMN assigned_by uuid,
  ADD COLUMN assigned_by_name text,
  ADD COLUMN assigned_to_name text,
  ADD COLUMN assigned_at timestamptz;
ALTER TABLE public.production_checklist_items
  ADD COLUMN assigned_by uuid,
  ADD COLUMN assigned_by_name text,
  ADD COLUMN assigned_to_name text,
  ADD COLUMN assigned_at timestamptz;

CREATE FUNCTION public.stamp_item_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE previous_assignee text; next_assignee text;
BEGIN
  next_assignee := to_jsonb(NEW)->>TG_ARGV[0];
  IF TG_OP = 'UPDATE' THEN
    previous_assignee := to_jsonb(OLD)->>TG_ARGV[0];
    IF next_assignee IS NOT DISTINCT FROM previous_assignee THEN
      NEW.assigned_by := OLD.assigned_by;
      NEW.assigned_by_name := OLD.assigned_by_name;
      NEW.assigned_to_name := OLD.assigned_to_name;
      NEW.assigned_at := OLD.assigned_at;
      RETURN NEW;
    END IF;
  ELSIF next_assignee IS NULL THEN
    NEW.assigned_by := NULL; NEW.assigned_by_name := NULL;
    NEW.assigned_to_name := NULL; NEW.assigned_at := NULL;
    RETURN NEW;
  END IF;
  NEW.assigned_by := auth.uid();
  SELECT COALESCE(NULLIF(full_name,''),email,'Unknown user') INTO NEW.assigned_by_name
    FROM public.profiles WHERE id = auth.uid();
  NEW.assigned_by_name := COALESCE(NEW.assigned_by_name, CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'Unknown user' END);
  SELECT name INTO NEW.assigned_to_name FROM public.crew_members WHERE id = next_assignee;
  NEW.assigned_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_item_assignment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER stamp_task_assignment BEFORE INSERT OR UPDATE ON public.site_tasks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_item_assignment('assigned_crew_id');
CREATE TRIGGER stamp_checklist_assignment BEFORE INSERT OR UPDATE ON public.production_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.stamp_item_assignment('assigned_to');
