-- Producer-defined checklists per production (e.g. "Wardrobe checklist"), each holding
-- free-form tickable items. Replaces the old fixed crew-role checklist, which is now
-- shown against actual bookings on the Members tab instead.
CREATE TABLE public.production_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_checklists TO authenticated;
GRANT ALL ON public.production_checklists TO service_role;
ALTER TABLE public.production_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read checklists" ON public.production_checklists FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers add checklists" ON public.production_checklists FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'producer') AND public.is_site_member(production_id));
CREATE POLICY "producers update checklists" ON public.production_checklists FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'producer')) WITH CHECK (public.has_role(auth.uid(),'producer'));
CREATE POLICY "producers delete checklists" ON public.production_checklists FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'producer'));

CREATE TABLE public.production_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.production_checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_checklist_items TO authenticated;
GRANT ALL ON public.production_checklist_items TO service_role;
ALTER TABLE public.production_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read checklist items" ON public.production_checklist_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.production_checklists c WHERE c.id = checklist_id AND public.is_site_member(c.production_id))
);
CREATE POLICY "producers add checklist items" ON public.production_checklist_items FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'producer') AND EXISTS (SELECT 1 FROM public.production_checklists c WHERE c.id = checklist_id AND public.is_site_member(c.production_id))
);
CREATE POLICY "producers update checklist items" ON public.production_checklist_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'producer')) WITH CHECK (public.has_role(auth.uid(),'producer'));
CREATE POLICY "producers delete checklist items" ON public.production_checklist_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'producer'));
