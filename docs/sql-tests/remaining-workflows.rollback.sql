-- Transaction-only integration fixtures. Nothing is retained; no external payments or pushes run.
BEGIN;
SELECT set_config('qa.manager',(SELECT user_id::text FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.crew',(SELECT c.id FROM public.crew_members c WHERE c.user_id IS NOT NULL AND public.has_role(c.user_id,'crew') ORDER BY c.id LIMIT 1),true);
SELECT set_config('qa.crew_user',(SELECT user_id::text FROM public.crew_members WHERE id=current_setting('qa.crew')),true);
DO $$ BEGIN IF nullif(current_setting('qa.manager'),'') IS NULL OR nullif(current_setting('qa.crew'),'') IS NULL THEN RAISE EXCEPTION 'Linked admin and crew fixtures are required'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
INSERT INTO public.productions(id,name,client,created_by,status,date,days,budget,travel_required,passport_requirements)
VALUES('p_qa_complete_rollback','QA rollback production','QA fixture',auth.uid(),'Draft',current_date+10,1,100,true,'Valid passport for the destination');
INSERT INTO public.inventory_items(id,name,total_count) VALUES('00000000-0000-4000-8000-000000000181','QA rollback inventory',1);
INSERT INTO public.crew_invoice_settings(crew_id,vat_registered,vat_rate,tax_number) VALUES(current_setting('qa.crew'),true,15,'QA-TEST-TAX') ON CONFLICT(crew_id) DO UPDATE SET vat_registered=true,vat_rate=15,tax_number='QA-TEST-TAX';
INSERT INTO public.bookings(id,production_id,crew_id,role,status,crew_rate,client_charge,days)
VALUES('b_qa_complete_rollback','p_qa_complete_rollback',current_setting('qa.crew'),'Camera','confirmed',100,100,1);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.crew_user'),true);
SET LOCAL ROLE authenticated;
INSERT INTO public.inventory_checkouts(id,item_id,production_id,checked_out_crew_id,quantity,expected_return_at)
VALUES('00000000-0000-4000-8000-000000000182','00000000-0000-4000-8000-000000000181','p_qa_complete_rollback',current_setting('qa.crew'),1,current_date+2);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.inventory_checkouts WHERE id='00000000-0000-4000-8000-000000000182' AND request_state='requested' AND requested_by=auth.uid()) THEN RAISE EXCEPTION 'Crew request failed'; END IF;
 IF (SELECT reserved FROM public.inventory_stock() WHERE item_id='00000000-0000-4000-8000-000000000181')<>0 THEN RAISE EXCEPTION 'Pending request reserved stock'; END IF;
 BEGIN UPDATE public.inventory_checkouts SET request_state='approved' WHERE id='00000000-0000-4000-8000-000000000182'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.inventory_checkouts WHERE id='00000000-0000-4000-8000-000000000182' AND request_state<>'requested') THEN RAISE EXCEPTION 'Crew self-approved'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
SET LOCAL ROLE authenticated;
UPDATE public.inventory_checkouts SET request_state='approved' WHERE id='00000000-0000-4000-8000-000000000182';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.inventory_checkouts WHERE id='00000000-0000-4000-8000-000000000182' AND request_state='approved' AND approved_by=auth.uid() AND approved_at IS NOT NULL) THEN RAISE EXCEPTION 'Approval stamp missing'; END IF;
 IF (SELECT reserved FROM public.inventory_stock() WHERE item_id='00000000-0000-4000-8000-000000000181')<>1 THEN RAISE EXCEPTION 'Approval did not reserve stock'; END IF;
END $$;
UPDATE public.inventory_checkouts SET request_state='collected' WHERE id='00000000-0000-4000-8000-000000000182';
DO $$ BEGIN
 IF (SELECT collected FROM public.inventory_stock() WHERE item_id='00000000-0000-4000-8000-000000000181')<>1 THEN RAISE EXCEPTION 'Collection stock count wrong'; END IF;

 BEGIN
  INSERT INTO public.inventory_checkouts(item_id,production_id,checked_out_crew_id,quantity,expected_return_at) VALUES('00000000-0000-4000-8000-000000000181','p_qa_complete_rollback',current_setting('qa.crew'),1,current_date+2);
  RAISE EXCEPTION 'TEST FAILED overbooking allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.notifications WHERE production_id='p_qa_complete_rollback' AND user_id=current_setting('qa.crew_user')::uuid AND title IN ('Inventory booking approved','Inventory collection confirmed'))<>2 THEN RAISE EXCEPTION 'Approval or collection notification missing'; END IF;
END $$;
SET LOCAL ROLE authenticated;
UPDATE public.inventory_checkouts SET request_state='returned' WHERE id='00000000-0000-4000-8000-000000000182';
DO $$ BEGIN IF (SELECT reserved FROM public.inventory_stock() WHERE item_id='00000000-0000-4000-8000-000000000181')<>0 THEN RAISE EXCEPTION 'Return did not release stock'; END IF; END $$;
INSERT INTO public.site_tasks(id,production_id,title,assigned_crew_id) VALUES('00000000-0000-4000-8000-000000000183','p_qa_complete_rollback','QA assigned task',current_setting('qa.crew'));
INSERT INTO public.production_checklists(id,production_id,title) VALUES('00000000-0000-4000-8000-000000000184','p_qa_complete_rollback','QA checklist');
INSERT INTO public.production_checklist_items(id,checklist_id,label,assigned_to) VALUES('00000000-0000-4000-8000-000000000185','00000000-0000-4000-8000-000000000184','QA item',current_setting('qa.crew'));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.site_tasks WHERE id='00000000-0000-4000-8000-000000000183' AND assigned_by=auth.uid() AND assigned_at IS NOT NULL AND assigned_to_name IS NOT NULL) THEN RAISE EXCEPTION 'Task assignment attribution missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.production_checklist_items WHERE id='00000000-0000-4000-8000-000000000185' AND assigned_by=auth.uid() AND assigned_at IS NOT NULL AND assigned_to_name IS NOT NULL) THEN RAISE EXCEPTION 'Checklist assignment attribution missing'; END IF;
END $$;
UPDATE public.site_tasks SET assigned_by_name='forged',assigned_at='2000-01-01' WHERE id='00000000-0000-4000-8000-000000000183';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.site_tasks WHERE id='00000000-0000-4000-8000-000000000183' AND assigned_by_name='forged') THEN RAISE EXCEPTION 'Assignment attribution could be forged'; END IF; END $$;
UPDATE public.site_tasks SET assigned_crew_id=NULL WHERE id='00000000-0000-4000-8000-000000000183';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.site_tasks WHERE id='00000000-0000-4000-8000-000000000183' AND assigned_crew_id IS NULL AND assigned_to_name IS NULL AND assigned_at IS NOT NULL) THEN RAISE EXCEPTION 'Clearing assignment not attributed'; END IF; END $$;
INSERT INTO public.production_locations(id,production_id,label,address,latitude,longitude,recce_date,recce_start_time,recce_end_time,starts_at,ends_at)
VALUES('00000000-0000-4000-8000-000000000186','p_qa_complete_rollback','QA map location','161 Maude St, Sandown, Sandton, 2196, South Africa',-26.1078,28.0524,current_date+9,'08:00','10:00',(current_date+10)::timestamptz+interval '8 hours',(current_date+10)::timestamptz+interval '17 hours');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.production_locations WHERE id='00000000-0000-4000-8000-000000000186' AND latitude=-26.1078 AND longitude=28.0524 AND recce_date=current_date+9 AND recce_start_time='08:00') THEN RAISE EXCEPTION 'Map location fields did not persist'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.productions WHERE id='p_qa_complete_rollback' AND travel_required AND passport_requirements='Valid passport for the destination') THEN RAISE EXCEPTION 'Travel requirements missing'; END IF;
END $$;

DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE booking_id='b_qa_complete_rollback' AND status='draft' AND vat_rate=15 AND vat_amount=15 AND total=115) THEN RAISE EXCEPTION 'Draft invoice or configured VAT missing'; END IF; END $$;
RESET ROLE;
INSERT INTO public.crew_members(id,name,role,department,location,day_rate,available,experience) VALUES
('c_qa_pass_valid','QA valid','Camera','Camera','Test',100,true,1),
('c_qa_pass_expired','QA expires before trip','Camera','Camera','Test',100,true,1),
('c_qa_pass_missing','QA missing','Camera','Camera','Test',100,true,1);
SET LOCAL ROLE authenticated;
SELECT public.upsert_passport_details('c_qa_pass_valid','QA FIXTURE','QA-NOT-A-REAL-PASSPORT',current_date+20);
SELECT public.upsert_passport_details('c_qa_pass_expired','QA FIXTURE','QA-NOT-A-REAL-PASSPORT',current_date+5);
DO $$ DECLARE statuses jsonb; BEGIN
 SELECT jsonb_object_agg(crew_id,passport_status) INTO statuses FROM public.crew_travel_status(ARRAY['c_qa_pass_valid','c_qa_pass_expired','c_qa_pass_missing'],current_date+10);
 IF statuses<>jsonb_build_object('c_qa_pass_valid','valid','c_qa_pass_expired','expired','c_qa_pass_missing','missing') THEN RAISE EXCEPTION 'Passport trip-date status incorrect'; END IF;
 IF (SELECT count(*) FROM public.crew_members WHERE id LIKE 'c_qa_pass_%' AND available)<>3 THEN RAISE EXCEPTION 'Passport status hid available crew'; END IF;
END $$;
INSERT INTO public.production_recce_plans(production_id,recce_date,selection,total) VALUES('p_qa_complete_rollback',current_date+9,jsonb_build_object(current_setting('qa.crew'),jsonb_build_object('selected',true,'rate',1200)),1200);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.production_recce_plans WHERE production_id='p_qa_complete_rollback' AND total=1200 AND selection ? current_setting('qa.crew')) THEN RAISE EXCEPTION 'Recce crew/cost not saved'; END IF; END $$;
RESET ROLE;
SELECT public.save_storyboard_breakdown('p_qa_complete_rollback','[{"scene_number":1,"shot_number":1,"description":"QA first shot","duration_seconds":3}]'::jsonb,'QA ORIGINAL PROMPT','QA working prompt','QA refs',true,current_setting('qa.manager')::uuid);
SELECT public.save_storyboard_breakdown('p_qa_complete_rollback','[{"scene_number":1,"shot_number":2,"description":"QA appended shot","duration_seconds":4}]'::jsonb,'SHOULD NOT REPLACE ORIGINAL','QA revised working prompt','QA refs',false,current_setting('qa.manager')::uuid);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.storyboard_briefs WHERE production_id='p_qa_complete_rollback' AND original_prompt='QA ORIGINAL PROMPT' AND working_prompt='QA revised working prompt') THEN RAISE EXCEPTION 'Original storyboard prompt lost'; END IF;
 IF (SELECT count(*) FROM public.storyboard_shots WHERE production_id='p_qa_complete_rollback')<>2 THEN RAISE EXCEPTION 'Storyboard append failed'; END IF;
 BEGIN PERFORM public.save_storyboard_breakdown('p_qa_complete_rollback','[]'::jsonb,'','', '',true,current_setting('qa.manager')::uuid); RAISE EXCEPTION 'TEST FAILED empty replacement allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.storyboard_shots WHERE production_id='p_qa_complete_rollback')<>2 THEN RAISE EXCEPTION 'Failed replacement lost storyboard'; END IF;
END $$;

-- Isolated service-side wallet operations, rolled back with the surrounding transaction.
INSERT INTO public.ai_balances(user_id,balance_micros) VALUES(current_setting('qa.manager')::uuid,0) ON CONFLICT(user_id) DO UPDATE SET balance_micros=0;
INSERT INTO public.ai_balance_purchases(user_id,reference,amount_minor,currency,usd_micros,fx_rate) VALUES(current_setting('qa.manager')::uuid,'qa_rollback_ai_topup',20000,'ZAR',10000000,20);
SELECT public.credit_ai_purchase('qa_rollback_ai_topup');
SELECT public.credit_ai_purchase('qa_rollback_ai_topup');
SELECT public.change_ai_balance(current_setting('qa.manager')::uuid,'qa_rollback_ai_action','charge',40000,'image');
SELECT public.change_ai_balance(current_setting('qa.manager')::uuid,'qa_rollback_ai_action','charge',40000,'image');
DO $$ BEGIN IF (SELECT balance_micros FROM public.ai_balances WHERE user_id=current_setting('qa.manager')::uuid)<>9960000 THEN RAISE EXCEPTION 'Duplicate credit/debit changed balance'; END IF; END $$;
SELECT public.change_ai_balance(current_setting('qa.manager')::uuid,'qa_rollback_ai_action','refund',40000,'image');
SELECT public.change_ai_balance(current_setting('qa.manager')::uuid,'qa_rollback_ai_action','refund',40000,'image');
DO $$ BEGIN
 IF (SELECT balance_micros FROM public.ai_balances WHERE user_id=current_setting('qa.manager')::uuid)<>10000000 THEN RAISE EXCEPTION 'Refund idempotency failed'; END IF;
 BEGIN PERFORM public.change_ai_balance(current_setting('qa.manager')::uuid,'qa_rollback_too_large','charge',11000000,'image'); RAISE EXCEPTION 'TEST FAILED negative balance allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
SELECT 'PASS: draft invoice/VAT, passport trip-date statuses, recce selection/cost, original storyboard prompt and atomic replacement, crew request, producer approval/collection/return, stock, two notification records, assignment stamps/tamper protection, map/date persistence, travel and wallet credit/debit/refund idempotency. All fixtures rolled back; no external push or money movement.' AS result;
