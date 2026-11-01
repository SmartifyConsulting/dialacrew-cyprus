ALTER TABLE public.production_checklist_items
  ADD COLUMN IF NOT EXISTS due_date date;

-- Items created from a producer checklist template default to the Producer on that production,
-- instead of landing unassigned, so someone owns every item from the start.
CREATE OR REPLACE FUNCTION public.apply_checklist_template(p_template_id uuid,p_production_id text DEFAULT NULL,p_crew_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.checklist_templates%ROWTYPE; v_list uuid; v_item jsonb; v_ord integer:=0; v_producer text;
BEGIN
 SELECT * INTO t FROM public.checklist_templates WHERE id=p_template_id AND (owner_id IS NULL OR owner_id=auth.uid());
 IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable'; END IF;
 IF t.audience='producer' AND p_production_id IS NOT NULL AND p_crew_id IS NULL THEN
   IF NOT public.is_site_member(p_production_id) OR NOT (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Producer access required'; END IF;
   IF EXISTS(SELECT 1 FROM public.productions WHERE id=p_production_id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'Production completed'; END IF;
   SELECT b.crew_id INTO v_producer FROM public.bookings b WHERE b.production_id=p_production_id AND lower(b.role)='producer' AND b.status<>'cancelled' ORDER BY b.created_at LIMIT 1;
   INSERT INTO public.production_checklists(production_id,title,sort_order) VALUES(p_production_id,t.title,0) RETURNING id INTO v_list;
   FOR v_item IN SELECT * FROM jsonb_array_elements(t.items) LOOP
     INSERT INTO public.production_checklist_items(checklist_id,label,sort_order,assigned_to) VALUES(v_list,v_item#>>'{}',v_ord,v_producer); v_ord:=v_ord+1;
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
