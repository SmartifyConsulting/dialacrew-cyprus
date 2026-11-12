BEGIN;
CREATE OR REPLACE FUNCTION public.ensure_uploaded_document_folder() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parts text[]; position integer; folder_path text;
BEGIN
 parts:=string_to_array(COALESCE(NULLIF(NEW.category,''),'General'),'/');
 FOR position IN 1..cardinality(parts) LOOP
  folder_path:=array_to_string(parts[1:position],'/');
  INSERT INTO public.site_document_folders(production_id,path) VALUES(NEW.production_id,folder_path) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER uploaded_document_folder AFTER INSERT ON public.site_documents FOR EACH ROW EXECUTE FUNCTION public.ensure_uploaded_document_folder();
COMMIT;
