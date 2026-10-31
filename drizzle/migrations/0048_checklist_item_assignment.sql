ALTER TABLE public.production_checklist_items
  ADD COLUMN IF NOT EXISTS assigned_to text REFERENCES public.crew_members(id) ON DELETE SET NULL;

ALTER TABLE public.site_tasks
  ADD COLUMN IF NOT EXISTS checklist_item_id uuid REFERENCES public.production_checklist_items(id) ON DELETE CASCADE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_tasks_checklist_item_id_key') THEN
    ALTER TABLE public.site_tasks ADD CONSTRAINT site_tasks_checklist_item_id_key UNIQUE (checklist_item_id);
  END IF;
END $$;

-- Assigning (or re-assigning) a checklist item creates/updates a linked task on the crew
-- member's task list and notifies them. Marking the item done/undone mirrors onto the task.
CREATE OR REPLACE FUNCTION public.sync_checklist_item_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_production_id text; v_crew_uid uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    SELECT pc.production_id INTO v_production_id FROM public.production_checklists pc WHERE pc.id = NEW.checklist_id;
    SELECT user_id INTO v_crew_uid FROM public.crew_members WHERE id = NEW.assigned_to;

    INSERT INTO public.site_tasks (production_id, title, assigned_crew_id, done, checklist_item_id, created_by)
    VALUES (v_production_id, NEW.label, NEW.assigned_to, NEW.done, NEW.id, auth.uid())
    ON CONFLICT (checklist_item_id) DO UPDATE SET assigned_crew_id = EXCLUDED.assigned_crew_id, title = EXCLUDED.title;

    IF v_crew_uid IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, production_id, title, body)
      VALUES (v_crew_uid, v_production_id, 'Checklist item assigned to you', 'You''ve been assigned: ' || NEW.label);
    END IF;
  ELSIF NEW.assigned_to IS NULL AND TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT NULL THEN
    DELETE FROM public.site_tasks WHERE checklist_item_id = NEW.id;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.done IS DISTINCT FROM OLD.done THEN
    UPDATE public.site_tasks SET done = NEW.done WHERE checklist_item_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS production_checklist_items_assign ON public.production_checklist_items;
CREATE TRIGGER production_checklist_items_assign AFTER INSERT OR UPDATE ON public.production_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.sync_checklist_item_assignment();

-- Checking a linked task off from the crew member's own task list mirrors back onto the checklist item.
CREATE OR REPLACE FUNCTION public.sync_task_to_checklist_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.checklist_item_id IS NOT NULL AND NEW.done IS DISTINCT FROM OLD.done THEN
    UPDATE public.production_checklist_items SET done = NEW.done, done_at = CASE WHEN NEW.done THEN now() ELSE NULL END WHERE id = NEW.checklist_item_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS site_tasks_sync_checklist ON public.site_tasks;
CREATE TRIGGER site_tasks_sync_checklist AFTER UPDATE ON public.site_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_to_checklist_item();
