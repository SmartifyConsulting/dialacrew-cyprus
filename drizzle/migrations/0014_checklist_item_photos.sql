-- Continuity photos: one or more reference photos per checklist item (e.g. wardrobe, set
-- dressing) so the team can match details across takes and shoot days.
CREATE TABLE public.production_checklist_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.production_checklist_items(id) ON DELETE CASCADE,
  path text NOT NULL,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_checklist_item_photos TO authenticated;
GRANT ALL ON public.production_checklist_item_photos TO service_role;
ALTER TABLE public.production_checklist_item_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read checklist item photos" ON public.production_checklist_item_photos FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.production_checklist_items i
    JOIN public.production_checklists c ON c.id = i.checklist_id
    WHERE i.id = item_id AND public.is_site_member(c.production_id)
  )
);
CREATE POLICY "producers add checklist item photos" ON public.production_checklist_item_photos FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'producer') AND EXISTS (
    SELECT 1 FROM public.production_checklist_items i
    JOIN public.production_checklists c ON c.id = i.checklist_id
    WHERE i.id = item_id AND public.is_site_member(c.production_id)
  )
);
CREATE POLICY "producers delete checklist item photos" ON public.production_checklist_item_photos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'producer'));
