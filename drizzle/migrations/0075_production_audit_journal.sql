CREATE TABLE public.production_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text, production_owner uuid, production_name text,
  actor_id uuid, actor_name text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
  entity_table text NOT NULL, entity_id text NOT NULL, action text NOT NULL,
  changed_fields text[] NOT NULL DEFAULT '{}', before_values jsonb, after_values jsonb
);
CREATE INDEX production_audit_by_date ON public.production_audit_events(production_id,occurred_at DESC,id);
ALTER TABLE public.production_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.production_audit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.production_audit_events TO authenticated;
CREATE POLICY "managers read production audit" ON public.production_audit_events FOR SELECT TO authenticated
 USING(public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin'));

CREATE FUNCTION public.reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Audit records are read-only'; END $$;
CREATE TRIGGER immutable_production_audit BEFORE UPDATE OR DELETE ON public.production_audit_events
 FOR EACH ROW EXECUTE FUNCTION public.reject_audit_mutation();

CREATE FUNCTION public.record_production_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous jsonb; following jsonb; payload jsonb; pid text; owner_id uuid; pname text; actor text; fields text[];
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN following := to_jsonb(NEW); END IF;
  payload := COALESCE(following,previous);
  IF TG_TABLE_NAME='productions' THEN
    pid := payload->>'id'; pname := payload->>'name'; owner_id := (payload->>'created_by')::uuid;
  ELSIF TG_TABLE_NAME='production_checklist_items' THEN
    SELECT c.production_id INTO pid FROM public.production_checklists c WHERE c.id=(payload->>'checklist_id')::uuid;
  ELSE pid := payload->>'production_id'; END IF;
  IF pid IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_TABLE_NAME<>'productions' THEN SELECT name,created_by INTO pname,owner_id FROM public.productions WHERE id=pid; END IF;
  SELECT array_agg(key ORDER BY key) INTO fields FROM (
    SELECT key FROM jsonb_object_keys(COALESCE(previous,'{}')||COALESCE(following,'{}')) key
    WHERE key NOT IN ('updated_at','due_notified_at') AND previous->key IS DISTINCT FROM following->key
  ) changes;
  IF TG_OP='UPDATE' AND COALESCE(array_length(fields,1),0)=0 THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(full_name,''),'Unknown user') INTO actor FROM public.profiles WHERE id=auth.uid();
  INSERT INTO public.production_audit_events(production_id,production_owner,production_name,actor_id,actor_name,entity_table,entity_id,action,changed_fields,before_values,after_values)
  VALUES(pid,owner_id,pname,auth.uid(),COALESCE(actor,CASE WHEN auth.uid() IS NULL THEN 'System' ELSE 'Unknown user' END),TG_TABLE_NAME,
    COALESCE(payload->>'id',pid||':'||COALESCE(payload->>'recce_date',payload->>'date','record')),lower(TG_OP),COALESCE(fields,'{}'),previous,following);
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_production_audit() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reject_audit_mutation() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE item text; BEGIN
  FOREACH item IN ARRAY ARRAY['productions','production_locations','bookings','site_posts','site_tasks','site_documents','site_photos','production_checklists','production_checklist_items','storyboard_shots','production_recce_plans','inventory_checkouts','production_retrospectives'] LOOP
    IF to_regclass('public.'||item) IS NOT NULL THEN
      EXECUTE format('CREATE TRIGGER journal_production_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.record_production_audit()',item);
    END IF;
  END LOOP;
END $$;
