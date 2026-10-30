-- Personal reusable checklist templates and personal crew checklists.
CREATE TABLE IF NOT EXISTS public.checklist_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 audience text NOT NULL CHECK (audience IN ('producer','crew')),
 title text NOT NULL,
 items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,audience,title)
);
CREATE TABLE IF NOT EXISTS public.crew_checklists (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 crew_id text NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
 title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crew_checklist_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 checklist_id uuid NOT NULL REFERENCES public.crew_checklists(id) ON DELETE CASCADE,
 label text NOT NULL, done boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS crew_checklists_crew_idx ON public.crew_checklists(crew_id);
CREATE INDEX IF NOT EXISTS crew_checklist_items_list_idx ON public.crew_checklist_items(checklist_id);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_checklist_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.checklist_templates,public.crew_checklists,public.crew_checklist_items TO authenticated;
CREATE POLICY "read default or own templates" ON public.checklist_templates FOR SELECT TO authenticated
 USING (owner_id IS NULL OR owner_id=auth.uid());
CREATE POLICY "create own templates" ON public.checklist_templates FOR INSERT TO authenticated WITH CHECK (owner_id=auth.uid());
CREATE POLICY "edit own templates" ON public.checklist_templates FOR UPDATE TO authenticated USING (owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY "delete own templates" ON public.checklist_templates FOR DELETE TO authenticated USING(owner_id=auth.uid());
CREATE POLICY "own crew checklists read" ON public.crew_checklists FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklists create" ON public.crew_checklists FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklists edit" ON public.crew_checklists FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklists delete" ON public.crew_checklists FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items read" ON public.crew_checklist_items FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items create" ON public.crew_checklist_items FOR INSERT TO authenticated
 WITH CHECK (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items edit" ON public.crew_checklist_items FOR UPDATE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));
CREATE POLICY "own crew checklist items delete" ON public.crew_checklist_items FOR DELETE TO authenticated
 USING (EXISTS(SELECT 1 FROM public.crew_checklists l JOIN public.crew_members c ON c.id=l.crew_id WHERE l.id=checklist_id AND c.user_id=auth.uid()));

-- Server-side creation copies template items; templates remain reusable and independent.
CREATE OR REPLACE FUNCTION public.apply_checklist_template(p_template_id uuid,p_production_id text DEFAULT NULL,p_crew_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.checklist_templates%ROWTYPE; v_list uuid; v_item jsonb; v_ord integer:=0;
BEGIN
 SELECT * INTO t FROM public.checklist_templates WHERE id=p_template_id AND (owner_id IS NULL OR owner_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable'; END IF;
 IF t.audience='producer' AND p_production_id IS NOT NULL AND p_crew_id IS NULL THEN
   IF NOT public.is_site_member(p_production_id) OR NOT (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Producer access required'; END IF;
   IF EXISTS(SELECT 1 FROM public.productions WHERE id=p_production_id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Production completed'; END IF;
   INSERT INTO public.production_checklists(production_id,title,sort_order) VALUES(p_production_id,t.title,0) RETURNING id INTO v_list;
   FOR v_item IN SELECT * FROM jsonb_array_elements(t.items) LOOP
     INSERT INTO public.production_checklist_items(checklist_id,label,sort_order) VALUES(v_list,v_item#>>'{}',v_ord); v_ord:=v_ord+1;
   END LOOP;
 ELSIF t.audience='crew' AND p_crew_id IS NOT NULL AND p_production_id IS NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.crew_members WHERE id=p_crew_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Crew access required'; END IF;
   INSERT INTO public.crew_checklists(crew_id,title) VALUES(p_crew_id,t.title) RETURNING id INTO v_list;
   FOR v_item IN SELECT * FROM jsonb_array_elements(t.items) LOOP
     INSERT INTO public.crew_checklist_items(checklist_id,label,sort_order) VALUES(v_list,v_item#>>'{}',v_ord); v_ord:=v_ord+1;
   END LOOP;
 ELSE RAISE EXCEPTION 'Template audience and target must match'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.apply_checklist_template(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_checklist_template(uuid,text,text) TO authenticated;
