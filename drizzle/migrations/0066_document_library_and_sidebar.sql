BEGIN;
CREATE TABLE IF NOT EXISTS public.site_document_folders (
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  path text NOT NULL CHECK (path <> '' AND path !~ '(^/|/$|//)'),
  PRIMARY KEY (production_id, path)
);
ALTER TABLE public.site_document_folders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.site_document_folders TO authenticated;
GRANT ALL ON public.site_document_folders TO service_role;
CREATE POLICY "members read document folders" ON public.site_document_folders FOR SELECT TO authenticated USING (public.is_site_member(production_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "managers create document folders" ON public.site_document_folders FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(),'producer') AND public.is_site_member(production_id)) OR public.has_role(auth.uid(),'admin'));
INSERT INTO public.site_document_folders(production_id,path)
SELECT p.id,f.path FROM public.productions p CROSS JOIN unnest(ARRAY['Call Sheets','Contracts','Invoices','Permits','Releases','General']) AS f(path)
ON CONFLICT DO NOTHING;
INSERT INTO public.site_document_folders(production_id,path)
SELECT DISTINCT production_id,COALESCE(NULLIF(category,''),'General') FROM public.site_documents ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.initialize_document_folders() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.site_document_folders(production_id,path) SELECT NEW.id,unnest(ARRAY['Call Sheets','Contracts','Invoices','Permits','Releases','General']);
 RETURN NEW;
END $$;
CREATE TRIGGER production_document_folders AFTER INSERT ON public.productions FOR EACH ROW EXECUTE FUNCTION public.initialize_document_folders();

CREATE OR REPLACE FUNCTION public.manage_document_library(p_production text,p_action text,p_files uuid[] DEFAULT '{}',p_folders text[] DEFAULT '{}',p_destination text DEFAULT '',p_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE source text; target text; oldpath text;
BEGIN
 IF NOT (public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'producer') AND public.is_site_member(p_production))) THEN RAISE EXCEPTION 'Producer access required'; END IF;
 IF p_action NOT IN ('move','delete','rename') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 IF EXISTS(SELECT 1 FROM public.productions WHERE id=p_production AND status='Completed') THEN RAISE EXCEPTION 'Production is complete'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('documents:'||p_production,0));
 IF p_action IN ('move','rename') AND p_destination<>'' AND NOT EXISTS(SELECT 1 FROM public.site_document_folders WHERE production_id=p_production AND path=p_destination) THEN RAISE EXCEPTION 'Destination folder not found'; END IF;
 IF p_action='rename' AND (p_name IS NULL OR btrim(p_name)='' OR p_name LIKE '%/%' OR cardinality(p_files)+cardinality(p_folders)<>1) THEN RAISE EXCEPTION 'Select one item and enter a valid name'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_folders) f WHERE p_destination=f OR left(p_destination,length(f)+1)=f||'/') THEN RAISE EXCEPTION 'Cannot move a folder into itself'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_files) f WHERE NOT EXISTS(SELECT 1 FROM public.site_documents WHERE production_id=p_production AND id=f)) THEN RAISE EXCEPTION 'File not found'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_folders) f WHERE NOT EXISTS(SELECT 1 FROM public.site_document_folders WHERE production_id=p_production AND path=f)) THEN RAISE EXCEPTION 'Folder not found'; END IF;
 IF p_action='delete' THEN
  DELETE FROM public.site_documents d WHERE production_id=p_production AND (id=ANY(p_files) OR EXISTS(SELECT 1 FROM unnest(p_folders) f WHERE category=f OR left(category,length(f)+1)=f||'/'));
  DELETE FROM public.site_document_folders d WHERE production_id=p_production AND EXISTS(SELECT 1 FROM unnest(p_folders) f WHERE path=f OR left(path,length(f)+1)=f||'/');
  RETURN;
 END IF;
 FOR source IN SELECT f FROM unnest(p_folders) f WHERE NOT EXISTS(SELECT 1 FROM unnest(p_folders) parent WHERE parent<>f AND left(f,length(parent)+1)=parent||'/') LOOP
  target := concat_ws('/',NULLIF(p_destination,''),CASE WHEN p_action='rename' THEN btrim(p_name) ELSE regexp_replace(source,'^.*/','') END);
  IF target=source THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.site_document_folders WHERE production_id=p_production AND (path=target OR left(path,length(target)+1)=target||'/')) THEN RAISE EXCEPTION 'A folder with this name already exists'; END IF;
  UPDATE public.site_documents SET category=target||substring(category FROM length(source)+1) WHERE production_id=p_production AND (category=source OR left(category,length(source)+1)=source||'/');
  UPDATE public.site_document_folders SET path=target||substring(path FROM length(source)+1) WHERE production_id=p_production AND (path=source OR left(path,length(source)+1)=source||'/');
 END LOOP;
 IF p_action='rename' THEN
  UPDATE public.site_documents SET name=btrim(p_name) WHERE production_id=p_production AND id=ANY(p_files);
 ELSE
  UPDATE public.site_documents SET category=COALESCE(NULLIF(p_destination,''),'General') WHERE production_id=p_production AND id=ANY(p_files);
  IF p_destination='' AND cardinality(p_files)>0 THEN INSERT INTO public.site_document_folders VALUES(p_production,'General') ON CONFLICT DO NOTHING; END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.manage_document_library(text,text,uuid[],text[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_document_library(text,text,uuid[],text[],text,text) TO authenticated;

CREATE POLICY "admins manage production locations" ON public.production_locations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage productions" ON public.productions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage production documents" ON public.site_documents FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage storyboard shots" ON public.storyboard_shots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins read storyboard exports" ON public.storyboard_exports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins create storyboard exports" ON public.storyboard_exports FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') AND created_by=auth.uid());
COMMIT;
