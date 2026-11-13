-- Existing accounts retain access. Only subsequently created accounts default to MVP.
ALTER TABLE public.profiles ADD COLUMN account_stage text NOT NULL DEFAULT 'committed'
  CHECK(account_stage IN ('mvp','committed'));
ALTER TABLE public.profiles ALTER COLUMN account_stage SET DEFAULT 'mvp';
CREATE FUNCTION public.is_mvp_user() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT account_stage='mvp' FROM public.profiles WHERE id=auth.uid()),auth.uid() IS NOT NULL)
$$;
CREATE FUNCTION public.is_trial_account(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT account_stage='mvp' FROM public.profiles WHERE id=p_user),false)
$$;
CREATE FUNCTION public.trial_user_visible(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_user=auth.uid() OR (NOT public.is_mvp_user() AND (public.has_role(auth.uid(),'admin') OR NOT public.is_trial_account(p_user)))
$$;
CREATE FUNCTION public.guard_account_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.account_stage IS DISTINCT FROM OLD.account_stage AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(),'admin') THEN
   IF NEW.id<>auth.uid() OR OLD.account_stage<>'mvp' OR NEW.account_stage<>'committed' THEN RAISE EXCEPTION 'Account stage can only be committed by its owner'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_account_stage BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_account_stage();

DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['crew_members','clients','companies','inventory_items','service_providers'] LOOP
   EXECUTE format('ALTER TABLE public.%I ADD COLUMN trial_owner_id uuid',item);
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN trial_owner_id SET DEFAULT auth.uid()',item);
 END LOOP;
END $$;
CREATE FUNCTION public.guard_trial_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN NEW.trial_owner_id:=auth.uid(); ELSE NEW.trial_owner_id:=OLD.trial_owner_id; END IF;
 IF TG_TABLE_NAME='crew_members' THEN
  IF public.is_mvp_user() AND NEW.user_id IS NOT NULL AND NEW.user_id<>auth.uid() THEN RAISE EXCEPTION 'Trial crew cannot be linked to another account'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['crew_members','clients','companies','inventory_items','service_providers'] LOOP
   EXECUTE format('CREATE TRIGGER guard_trial_owner BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_trial_owner()',item);
 END LOOP;
END $$;

CREATE FUNCTION public.trial_production_visible(p_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.productions WHERE id=p_id AND public.trial_user_visible(created_by))
$$;
CREATE FUNCTION public.trial_crew_visible(p_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.crew_members WHERE id=p_id AND (user_id=auth.uid() OR trial_owner_id=auth.uid() OR
   (NOT public.is_mvp_user() AND (public.has_role(auth.uid(),'admin') OR (NOT public.is_trial_account(user_id) AND NOT public.is_trial_account(trial_owner_id))))))
$$;
CREATE FUNCTION public.trial_company_visible(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.companies WHERE id=p_id AND public.trial_user_visible(trial_owner_id))
$$;
CREATE FUNCTION public.trial_parent_visible(p_kind text,p_id text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE p_kind
 WHEN 'booking' THEN EXISTS(SELECT 1 FROM public.bookings WHERE id=p_id AND public.trial_production_visible(production_id))
 WHEN 'production_checklist' THEN EXISTS(SELECT 1 FROM public.production_checklists WHERE id::text=p_id AND public.trial_production_visible(production_id))
 WHEN 'crew_checklist' THEN EXISTS(SELECT 1 FROM public.crew_checklists WHERE id::text=p_id AND public.trial_crew_visible(crew_id))
 WHEN 'crew_group' THEN EXISTS(SELECT 1 FROM public.crew_groups WHERE id::text=p_id AND public.trial_user_visible(created_by))
 WHEN 'checklist_item' THEN EXISTS(SELECT 1 FROM public.production_checklist_items WHERE id::text=p_id AND public.trial_parent_visible('production_checklist',checklist_id::text))
 WHEN 'document_template' THEN EXISTS(SELECT 1 FROM public.document_checklist_templates WHERE id::text=p_id AND (created_by IS NULL OR public.trial_user_visible(created_by)))
 WHEN 'photo_group' THEN EXISTS(SELECT 1 FROM public.site_photo_groups WHERE id::text=p_id AND public.trial_production_visible(production_id))
 WHEN 'location' THEN EXISTS(SELECT 1 FROM public.production_locations WHERE id::text=p_id AND public.trial_production_visible(production_id))
 WHEN 'inventory' THEN EXISTS(SELECT 1 FROM public.inventory_items WHERE id::text=p_id AND public.trial_user_visible(trial_owner_id))
 ELSE false END
$$;

-- Restrictive policies cannot be bypassed by an older permissive producer/admin policy.
DO $$ DECLARE item record; columns text[]; predicate text; check_predicate text; reference text; BEGIN
 FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
   IF item.tablename IN ('platform_settings','membership_plans','legal_documents','default_crew_roles','production_types','storyboard_audio_packages','storyboard_audio_pricing') THEN CONTINUE; END IF;
   SELECT array_agg(column_name::text) INTO columns FROM information_schema.columns WHERE table_schema='public' AND table_name=item.tablename;
   predicate := 'NOT public.is_mvp_user()';
   IF item.tablename='profiles' THEN predicate:='public.trial_user_visible(id)';
   ELSIF item.tablename='productions' THEN predicate:='public.trial_user_visible(created_by)';
   ELSIF item.tablename='crew_members' THEN predicate:='user_id=auth.uid() OR trial_owner_id=auth.uid() OR (NOT public.is_mvp_user() AND (public.has_role(auth.uid(),''admin'') OR (NOT public.is_trial_account(user_id) AND NOT public.is_trial_account(trial_owner_id))))';
   ELSIF item.tablename='production_audit_events' THEN predicate:='public.trial_user_visible(production_owner)';
   ELSIF item.tablename='producer_post_rules' THEN predicate:='public.trial_user_visible(producer_id)';
   ELSIF item.tablename='production_checklist_item_photos' THEN predicate:='public.trial_parent_visible(''checklist_item'',item_id::text)';
   ELSIF item.tablename='document_checklist_template_items' THEN predicate:='public.trial_parent_visible(''document_template'',template_id::text)';
   ELSIF item.tablename='crew_checklist_items' THEN predicate:='public.trial_parent_visible(''crew_checklist'',checklist_id::text)';
   ELSIF item.tablename='checklist_templates' THEN predicate:='owner_id IS NULL OR public.trial_user_visible(owner_id)';
   ELSIF 'trial_owner_id'=ANY(columns) THEN predicate:='public.trial_user_visible(trial_owner_id)';
   ELSIF 'production_id'=ANY(columns) THEN predicate:='public.trial_production_visible(production_id) OR (production_id IS NULL AND '||CASE WHEN 'user_id'=ANY(columns) THEN 'public.trial_user_visible(user_id)' ELSE 'NOT public.is_mvp_user()' END||')';
   ELSIF 'booking_id'=ANY(columns) THEN predicate:='public.trial_parent_visible(''booking'',booking_id) OR (booking_id IS NULL AND NOT public.is_mvp_user())';
   ELSIF item.tablename='crew_group_members' THEN predicate:='public.trial_parent_visible(''crew_group'',group_id::text) AND public.trial_crew_visible(crew_id)';
   ELSIF 'crew_id'=ANY(columns) THEN predicate:='public.trial_crew_visible(crew_id)';
   ELSIF 'company_id'=ANY(columns) THEN predicate:='public.trial_company_visible(company_id)';
   ELSIF 'group_id'=ANY(columns) THEN predicate:='public.trial_parent_visible(''crew_group'',group_id::text)';
   ELSIF 'checklist_id'=ANY(columns) THEN predicate:='public.trial_parent_visible(''production_checklist'',checklist_id::text)';
   ELSIF 'user_id'=ANY(columns) THEN predicate:='public.trial_user_visible(user_id)';
   ELSIF 'owner_id'=ANY(columns) THEN predicate:='public.trial_user_visible(owner_id)';
   ELSIF 'posted_by'=ANY(columns) THEN predicate:='public.trial_user_visible(posted_by)';
   ELSIF 'created_by'=ANY(columns) THEN predicate:='public.trial_user_visible(created_by)';
   END IF;
   check_predicate := '('||predicate||')';
   -- Trial writes may not attach foreign crew, inventory, locations or accounts to an owned production.
   FOREACH reference IN ARRAY ARRAY['crew_id','checked_out_crew_id','assigned_crew_id','assigned_to'] LOOP
     IF reference=ANY(columns) THEN check_predicate:=check_predicate||format(' AND (NOT public.is_mvp_user() OR %I IS NULL OR public.trial_crew_visible(%I))',reference,reference); END IF;
   END LOOP;
   IF 'item_id'=ANY(columns) AND item.tablename='inventory_checkouts' THEN check_predicate:=check_predicate||' AND public.trial_parent_visible(''inventory'',item_id::text)'; END IF;
   IF 'company_id'=ANY(columns) THEN check_predicate:=check_predicate||' AND (NOT public.is_mvp_user() OR company_id IS NULL OR public.trial_company_visible(company_id))'; END IF;
   IF 'location_id'=ANY(columns) THEN check_predicate:=check_predicate||' AND (NOT public.is_mvp_user() OR location_id IS NULL OR public.trial_parent_visible(''location'',location_id::text))'; END IF;
   IF 'user_id'=ANY(columns) AND item.tablename<>'profiles' THEN check_predicate:=check_predicate||' AND (NOT public.is_mvp_user() OR user_id IS NULL OR user_id=auth.uid())'; END IF;
   EXECUTE format('CREATE POLICY trial_data_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',item.tablename,predicate,check_predicate);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_site_member(_prod text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.trial_production_visible(_prod) AND (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin') OR EXISTS(
 SELECT 1 FROM public.bookings b JOIN public.crew_members c ON c.id=b.crew_id WHERE b.production_id=_prod AND c.user_id=auth.uid() AND b.status<>'cancelled'))
$$;

-- Guard SECURITY DEFINER RPCs as well as direct table access. Committed callers retain the original checks.
DO $$ DECLARE f record; source text; definition text; guarded text; guard text; args text[]; arg text; output_names text; BEGIN
 FOR f IN SELECT p.*,l.lanname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
   WHERE n.nspname='public' AND p.prosecdef AND p.prorettype<>'trigger'::regtype AND has_function_privilege('authenticated',p.oid,'EXECUTE') LOOP
   IF f.proname LIKE 'trial_%' OR f.proname IN ('is_mvp_user','is_trial_account','has_role','my_crew_id','claim_crew_profile','gig_setting','register_native_push_device','revoke_native_push_device','claim_native_push','is_site_member') THEN CONTINUE; END IF;
   args:=f.proargnames; guard:='true';
   IF f.proname IN ('auto_approve_reviews','expire_pencils','flag_due_equipment_today','get_invite','decide_join_request','set_company_admin','company_should_auto_admin','buy_crew_refeature','allocate_storyboard_audio_credits','finalize_storyboard_audio_charge','release_storyboard_audio_reservation','reserve_storyboard_audio_credits') THEN guard:='false';
   ELSE
     FOREACH arg IN ARRAY COALESCE(args,'{}') LOOP
       IF arg IN ('p_booking_id','_booking') THEN guard:=guard||format(' AND public.trial_parent_visible(''booking'',%I)',arg);
       ELSIF arg IN ('p_production_id','_production_id','p_production','_prod') THEN guard:=guard||format(' AND public.trial_production_visible(%I)',arg);
       ELSIF arg IN ('p_crew_id','_crew_id') THEN guard:=guard||format(' AND (%I IS NULL OR public.trial_crew_visible(%I))',arg,arg);
       ELSIF arg IN ('_company','_company_id') THEN guard:=guard||format(' AND public.trial_company_visible(%I)',arg);
       ELSIF arg='_gig' THEN guard:=guard||' AND EXISTS(SELECT 1 FROM public.community_gigs WHERE id=_gig AND posted_by=auth.uid())';
       ELSIF arg='p_invoice_id' THEN guard:=guard||' AND EXISTS(SELECT 1 FROM public.invoices WHERE id=p_invoice_id AND public.trial_production_visible(production_id))';
       ELSIF arg='p_notification_id' THEN guard:=guard||' AND EXISTS(SELECT 1 FROM public.notifications WHERE id=p_notification_id AND user_id=auth.uid())';
       END IF;
     END LOOP;
     IF f.proname='open_gigs' THEN guard:='public.trial_production_visible(scoped.production_id)';
     ELSIF f.proname='site_members' THEN guard:=guard||' AND public.trial_crew_visible(scoped.crew_id)';
     ELSIF f.proname='crew_travel_status' THEN guard:='public.trial_crew_visible(scoped.crew_id)';
     ELSIF f.proname='inventory_stock' THEN guard:='public.trial_parent_visible(''inventory'',scoped.item_id::text)'; END IF;
   END IF;
   source:=f.prosrc;
   IF f.lanname='plpgsql' THEN
     guarded:=regexp_replace(source,'\mBEGIN\M','BEGIN IF public.is_mvp_user() AND NOT ('||guard||') THEN RAISE EXCEPTION ''This action is outside your MVP workspace. Commit your account to continue.''; END IF;','i');
     IF guarded=source THEN RAISE EXCEPTION 'Review trial guard for %',f.proname; END IF;
   ELSIF f.lanname='sql' THEN
     source:=regexp_replace(btrim(source),';\s*$','');
     SELECT string_agg(quote_ident(name),',' ORDER BY ordinal) INTO output_names FROM unnest(f.proargnames) WITH ORDINALITY parts(name,ordinal) WHERE f.proargmodes[ordinal] IN ('o','b','t');
     IF f.prorettype='void'::regtype THEN
       guarded:='BEGIN IF public.is_mvp_user() AND NOT ('||guard||') THEN RAISE EXCEPTION ''This action is outside your MVP workspace.''; END IF; '||source||'; RETURN; END';
     ELSIF f.proretset THEN guarded:='SELECT * FROM ('||source||') scoped'||COALESCE('('||output_names||')','')||' WHERE NOT public.is_mvp_user() OR ('||guard||')';
     ELSE guarded:='SELECT CASE WHEN NOT public.is_mvp_user() OR ('||guard||') THEN ('||source||') ELSE '||CASE WHEN f.prorettype='boolean'::regtype THEN 'false' ELSE 'NULL' END||' END'; END IF;
   ELSE RAISE EXCEPTION 'Review unsupported trial RPC language for %',f.proname; END IF;
   definition:=pg_get_functiondef(f.oid);
   IF f.lanname='sql' AND f.prorettype='void'::regtype THEN definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql'); END IF;
   EXECUTE replace(definition,f.prosrc,guarded);
 END LOOP;
END $$;

-- No anonymous RPC access to private datasets. Keep explicit bearer-token invitations and public pricing.
-- MVP signup must never claim an imported real crew record merely by matching an email.
DO $$ DECLARE definition text; source text; guarded text; BEGIN
 SELECT pg_get_functiondef('public.claim_crew_profile()'::regprocedure),prosrc INTO definition,source FROM pg_proc WHERE oid='public.claim_crew_profile()'::regprocedure;
 guarded:=regexp_replace(source,'\mBEGIN\M',$guard$BEGIN
  IF public.is_mvp_user() THEN
    PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
    RETURN public.claim_trial_crew_profile();
  END IF;
 $guard$,'i');
 -- The separately declared helper is resolved when the function executes.
 EXECUTE replace(definition,source,guarded);
END $$;
CREATE FUNCTION public.claim_trial_crew_profile() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE crew text; me public.profiles;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_mvp_user() THEN RAISE EXCEPTION 'MVP account required'; END IF;
 SELECT * INTO me FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
 SELECT id INTO crew FROM public.crew_members WHERE user_id=auth.uid() LIMIT 1;
 IF crew IS NOT NULL THEN RETURN crew; END IF;
 crew:='trial-'||gen_random_uuid()::text;
 INSERT INTO public.crew_members(id,name,role,department,location,user_id,email,country)
 VALUES(crew,COALESCE(NULLIF(me.full_name,''),'Trial crew'),'Crew','General','',auth.uid(),COALESCE(me.email,''),COALESCE(me.country,'ZA'));
 RETURN crew;
END $$;
REVOKE ALL ON FUNCTION public.claim_trial_crew_profile() FROM PUBLIC,anon,authenticated;

-- No anonymous RPC access to private datasets. Keep explicit bearer-token invitations and public pricing.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND p.prorettype<>'trigger'::regtype AND has_function_privilege('authenticated',p.oid,'EXECUTE') LOOP
  IF f.proname NOT IN ('get_invite','gig_setting') THEN EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon',f.oid::regprocedure); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure); END IF;
 END LOOP;
END $$;

CREATE POLICY trial_file_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT public.is_mvp_user() OR (bucket_id='site-files' AND (
   public.trial_production_visible((storage.foldername(name))[1]) OR
   ((storage.foldername(name))[1]='crew' AND public.trial_crew_visible((storage.foldername(name))[2])) OR
   ((storage.foldername(name))[1]='avatars' AND (storage.foldername(name))[2]=auth.uid()::text)
 ))) WITH CHECK (NOT public.is_mvp_user() OR (bucket_id='site-files' AND (
   public.trial_production_visible((storage.foldername(name))[1]) OR
   ((storage.foldername(name))[1]='crew' AND public.trial_crew_visible((storage.foldername(name))[2])) OR
   ((storage.foldername(name))[1]='avatars' AND (storage.foldername(name))[2]=auth.uid()::text)
 )));

CREATE FUNCTION public.suppress_trial_external_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF public.is_mvp_user() AND NEW.user_id IS DISTINCT FROM auth.uid() THEN RETURN NULL; END IF; RETURN NEW; END $$;
CREATE TRIGGER suppress_trial_external_notifications BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.suppress_trial_external_notifications();
REVOKE ALL ON FUNCTION public.guard_account_stage(),public.guard_trial_owner(),public.suppress_trial_external_notifications() FROM PUBLIC,anon,authenticated;
