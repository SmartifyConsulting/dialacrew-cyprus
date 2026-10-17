-- Photo order on checklist items (lower sort_order shows first).
ALTER TABLE public.production_checklist_item_photos
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Tasks are private by default: visible to the person who created them and to the crew member
-- they're assigned to. Setting is_public shares them with every member of the production.
ALTER TABLE public.site_tasks
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "members read tasks" ON public.site_tasks;
CREATE POLICY "read visible tasks" ON public.site_tasks FOR SELECT TO authenticated USING (
  public.is_site_member(production_id) AND (
    is_public
    OR created_by = auth.uid()
    OR assigned_crew_id IN (SELECT c.id FROM public.crew_members c WHERE c.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "members update tasks" ON public.site_tasks;
CREATE POLICY "update visible tasks" ON public.site_tasks FOR UPDATE TO authenticated USING (
  public.is_site_member(production_id) AND (
    is_public
    OR created_by = auth.uid()
    OR assigned_crew_id IN (SELECT c.id FROM public.crew_members c WHERE c.user_id = auth.uid())
  )
) WITH CHECK (public.is_site_member(production_id));
