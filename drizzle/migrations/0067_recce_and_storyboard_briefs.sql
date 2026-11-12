BEGIN;
CREATE TABLE public.production_recce_plans (
 production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
 recce_date date NOT NULL,
 selection jsonb NOT NULL DEFAULT '{}'::jsonb,
 total numeric NOT NULL DEFAULT 0 CHECK(total>=0),
 PRIMARY KEY(production_id,recce_date)
);
ALTER TABLE public.production_recce_plans ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.production_recce_plans TO authenticated;
GRANT ALL ON public.production_recce_plans TO service_role;
CREATE POLICY "managers manage recce plans" ON public.production_recce_plans FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'producer') AND public.is_site_member(production_id))) WITH CHECK(public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'producer') AND public.is_site_member(production_id)));
CREATE TABLE public.storyboard_briefs (
 production_id text PRIMARY KEY REFERENCES public.productions(id) ON DELETE CASCADE,
 original_prompt text NOT NULL DEFAULT '',
 working_prompt text NOT NULL DEFAULT '',
 pdf_summary text NOT NULL DEFAULT '',
 extracted_text text NOT NULL DEFAULT '',
 source_path text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.storyboard_briefs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.storyboard_briefs TO authenticated;
GRANT ALL ON public.storyboard_briefs TO service_role;
CREATE POLICY "managers persist storyboard briefs" ON public.storyboard_briefs FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'producer') AND public.is_site_member(production_id))) WITH CHECK(public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'producer') AND public.is_site_member(production_id)));
CREATE POLICY "admins upload production files" ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='site-files' AND public.has_role(auth.uid(),'admin') AND EXISTS(SELECT 1 FROM public.productions p WHERE p.id=(storage.foldername(name))[1]));
CREATE POLICY "admins read production files" ON storage.objects FOR SELECT TO authenticated USING(bucket_id='site-files' AND public.has_role(auth.uid(),'admin') AND EXISTS(SELECT 1 FROM public.productions p WHERE p.id=(storage.foldername(name))[1]));
CREATE OR REPLACE FUNCTION public.save_storyboard_breakdown(p_production text,p_shots jsonb,p_original text,p_improved text,p_characters text,p_replace boolean,p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE start_order integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('storyboard:'||p_production,0));
 IF jsonb_typeof(p_shots)<>'array' OR jsonb_array_length(p_shots)=0 THEN RAISE EXCEPTION 'No shots returned'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.productions WHERE id=p_production AND status<>'Completed') THEN RAISE EXCEPTION 'Production not editable'; END IF;
 IF p_replace THEN DELETE FROM public.storyboard_shots WHERE production_id=p_production; END IF;
 SELECT COALESCE(max(sort_order)+1,0) INTO start_order FROM public.storyboard_shots WHERE production_id=p_production;
 INSERT INTO public.storyboard_shots(production_id,scene_number,shot_number,description,duration_seconds,sort_order,created_by)
 SELECT p_production,(s.value->>'scene_number')::integer,(s.value->>'shot_number')::integer,s.value->>'description',greatest(1,(s.value->>'duration_seconds')::numeric),start_order+s.ordinality::integer-1,p_user FROM jsonb_array_elements(p_shots) WITH ORDINALITY s(value,ordinality);
 INSERT INTO public.storyboard_briefs(production_id,original_prompt,working_prompt) VALUES(p_production,p_original,p_improved)
 ON CONFLICT(production_id) DO UPDATE SET original_prompt=CASE WHEN storyboard_briefs.original_prompt='' THEN excluded.original_prompt ELSE storyboard_briefs.original_prompt END,working_prompt=excluded.working_prompt,updated_at=now();
 UPDATE public.productions SET storyboard_characters=p_characters WHERE id=p_production;
END $$;
REVOKE ALL ON FUNCTION public.save_storyboard_breakdown(text,jsonb,text,text,text,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_storyboard_breakdown(text,jsonb,text,text,text,boolean,uuid) TO service_role;
COMMIT;
