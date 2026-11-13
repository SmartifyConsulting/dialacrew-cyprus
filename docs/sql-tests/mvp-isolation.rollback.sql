-- Requires migration 0077, either installed or tested in the same transaction.
-- Uses designated rollback fixtures only. ROLLBACK is mandatory.
BEGIN;

UPDATE profiles SET account_stage='mvp' WHERE id IN ('1ac5f8d8-b2c8-44c0-a7ea-6880ee7b898d','6b518ab5-e4cb-4d35-bc38-363db8fddbd3');
SELECT set_config('request.jwt.claim.sub','1ac5f8d8-b2c8-44c0-a7ea-6880ee7b898d',true);
INSERT INTO productions(id,name,client,created_by,status,date,days,budget) VALUES('p_trial_test_a','ROLLBACK Trial A','Trial A',auth.uid(),'Draft',current_date+10,1,100);
INSERT INTO productions(id,name,client,created_by,status,date,days,budget) VALUES('p_trial_real','ROLLBACK Committed dataset','Other company','f3c0a668-ea61-4443-83f9-9523d83291b5','Draft',current_date+10,1,100);
INSERT INTO crew_members(id,name,role,department,location,day_rate,available,experience) VALUES('c_trial_test_a','ROLLBACK Crew A','Camera','Camera','South Africa',100,true,1);
INSERT INTO inventory_items(id,name,total_count) VALUES('00000000-0000-4000-8000-000000000078','ROLLBACK Inventory A',1);
INSERT INTO clients(id,name,company) VALUES('00000000-0000-4000-8000-000000000078','ROLLBACK Client A','Trial A');
INSERT INTO bookings(id,production_id,crew_id,role,status,crew_rate,client_charge,days) VALUES('b_trial_test_a','p_trial_test_a','c_trial_test_a','Camera','pencil',100,100,1),('b_trial_open_a','p_trial_test_a',NULL,'Camera','open',100,100,1);
INSERT INTO storage.objects(bucket_id,name) VALUES('site-files','p_trial_test_a/rollback-test.txt');
SELECT set_config('request.jwt.claim.sub','6b518ab5-e4cb-4d35-bc38-363db8fddbd3',true);
INSERT INTO productions(id,name,client,created_by,status,date,days,budget) VALUES('p_trial_test_b','ROLLBACK Trial B','Trial B',auth.uid(),'Draft',current_date+10,1,100);
INSERT INTO crew_members(id,name,role,department,location,day_rate,available,experience) VALUES('c_trial_test_b','ROLLBACK Crew B','Camera','Camera','Cyprus',100,true,1);
INSERT INTO inventory_items(id,name,total_count) VALUES('00000000-0000-4000-8000-000000000079','ROLLBACK Inventory B',1);
INSERT INTO clients(id,name,company) VALUES('00000000-0000-4000-8000-000000000079','ROLLBACK Client B','Trial B');
INSERT INTO bookings(id,production_id,crew_id,role,status,crew_rate,client_charge,days) VALUES('b_trial_open_b','p_trial_test_b',NULL,'Camera','open',100,100,1);
INSERT INTO storage.objects(bucket_id,name) VALUES('site-files','p_trial_test_b/rollback-test.txt');
SELECT set_config('request.jwt.claim.sub','1ac5f8d8-b2c8-44c0-a7ea-6880ee7b898d',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT count(*) FROM productions WHERE id='p_trial_test_a')<>1 THEN RAISE EXCEPTION 'Trial cannot read own production'; END IF;
 IF EXISTS(SELECT 1 FROM productions WHERE id IN ('p_trial_test_b','p_trial_real')) THEN RAISE EXCEPTION 'Foreign or real production leaked'; END IF;
 IF EXISTS(SELECT 1 FROM crew_members WHERE id IN ('c_trial_test_b','c2cb64be4de')) THEN RAISE EXCEPTION 'Foreign or real crew leaked'; END IF;
 IF EXISTS(SELECT 1 FROM clients WHERE company='Trial B') THEN RAISE EXCEPTION 'Foreign client leaked'; END IF;
 IF EXISTS(SELECT 1 FROM inventory_stock() WHERE item_id='00000000-0000-4000-8000-000000000079') THEN RAISE EXCEPTION 'Inventory RPC leaked'; END IF;
 IF EXISTS(SELECT 1 FROM open_gigs() g JOIN productions p ON p.id=g.production_id WHERE p.created_by IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Open gigs RPC leaked'; END IF;
 IF (SELECT count(*) FROM open_gigs() WHERE production_id='p_trial_test_a')<>1 THEN RAISE EXCEPTION 'Own trial gig disappeared'; END IF;
 IF EXISTS(SELECT 1 FROM site_members('p_trial_test_b')) THEN RAISE EXCEPTION 'Members RPC leaked'; END IF;
 IF EXISTS(SELECT 1 FROM crew_travel_status(ARRAY['c_trial_test_b'])) THEN RAISE EXCEPTION 'Travel status RPC leaked'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='site-files' AND name='p_trial_test_b/rollback-test.txt') THEN RAISE EXCEPTION 'Foreign file metadata leaked'; END IF;
 UPDATE productions SET summary='FORBIDDEN' WHERE id='p_trial_test_b'; IF FOUND THEN RAISE EXCEPTION 'Foreign production update allowed'; END IF;
 BEGIN PERFORM claim_gig('b_trial_open_b'); RAISE EXCEPTION 'TEST FAILED foreign RPC mutation allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
 UPDATE profiles SET account_stage='committed' WHERE id=auth.uid();
 IF (SELECT count(*) FROM productions WHERE id='p_trial_test_a')<>1 THEN RAISE EXCEPTION 'Commit lost trial data'; END IF;
 IF (SELECT count(*) FROM productions WHERE id='p_trial_real')<>1 THEN RAISE EXCEPTION 'Committed producer access broken'; END IF;

END $$;
SELECT set_config('request.jwt.claim.sub','6b518ab5-e4cb-4d35-bc38-363db8fddbd3',true);
UPDATE profiles SET account_stage='committed' WHERE id=auth.uid();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND account_stage='committed') THEN RAISE EXCEPTION 'Crew commit failed'; END IF;
 BEGIN UPDATE profiles SET account_stage='mvp' WHERE id=auth.uid(); RAISE EXCEPTION 'TEST FAILED self-downgrade allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN IF has_function_privilege('anon','public.open_gigs()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous private RPC access remains'; END IF; END $$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('00000000-0000-4000-8000-000000000088','rollback-mvp-import@example.invalid','{"full_name":"Rollback MVP","role":"crew"}');
UPDATE profiles SET account_stage='mvp' WHERE id='00000000-0000-4000-8000-000000000088';
INSERT INTO crew_members(id,name,email,role,department,location) VALUES('c_import_rollback','Imported real record','rollback-mvp-import@example.invalid','Camera','Camera','Cape Town');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000088',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE claimed text; BEGIN
 claimed:=claim_crew_profile();
 IF claimed='c_import_rollback' OR claimed NOT LIKE 'trial-%' THEN RAISE EXCEPTION 'Imported record claimed by trial'; END IF;
 IF NOT EXISTS(SELECT 1 FROM crew_members WHERE id=claimed AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Fresh trial crew not readable'; END IF;
 BEGIN PERFORM get_passport_details('c_import_rollback'); RAISE EXCEPTION 'TEST FAILED passport details leaked'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
ROLLBACK;
