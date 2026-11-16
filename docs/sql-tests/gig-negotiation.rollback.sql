BEGIN;
SELECT set_config('qa.manager',(SELECT user_id::text FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1),true);
SELECT set_config('qa.crew',(SELECT c.id FROM public.crew_members c WHERE c.user_id IS NOT NULL AND public.has_role(c.user_id,'crew') ORDER BY c.id LIMIT 1),true);
SELECT set_config('qa.crew_user',(SELECT user_id::text FROM public.crew_members WHERE id=current_setting('qa.crew')),true);
SELECT set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
INSERT INTO public.productions(id,name,client,created_by,status) VALUES('p_qa_negotiation','QA rollback negotiation','QA fixture',auth.uid(),'Draft');
INSERT INTO public.bookings(id,production_id,role,status,crew_rate,client_charge,days) VALUES('b_qa_negotiation','p_qa_negotiation','Camera','open',1000,1200,1);
UPDATE public.crew_members SET day_rate=1000 WHERE id=current_setting('qa.crew');
SELECT set_config('request.jwt.claim.sub',current_setting('qa.crew_user'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.gig_negotiate('b_qa_negotiation',current_setting('qa.crew'),'counter',900,false); RAISE EXCEPTION 'TEST FAILED below-usual acknowledgment bypassed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
END $$;
SELECT public.gig_negotiate('b_qa_negotiation',current_setting('qa.crew'),'counter',900,true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.gig_negotiations WHERE booking_id='b_qa_negotiation' AND latest_by='crew' AND status='pending_producer') THEN RAISE EXCEPTION 'Crew counter-offer not saved'; END IF;
 BEGIN PERFORM public.gig_negotiate('b_qa_negotiation',current_setting('qa.crew'),'counter',950,true); RAISE EXCEPTION 'TEST FAILED same party moved twice'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.manager'),true);
SET LOCAL ROLE authenticated;
SELECT public.gig_negotiate('b_qa_negotiation',current_setting('qa.crew'),'counter',1100,false);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.gig_negotiations WHERE booking_id='b_qa_negotiation' AND latest_by='producer' AND latest_rate=1100 AND status='pending_crew') THEN RAISE EXCEPTION 'Producer counter not saved'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',current_setting('qa.crew_user'),true);
SET LOCAL ROLE authenticated;
SELECT public.gig_negotiate('b_qa_negotiation',current_setting('qa.crew'),'accept',NULL,true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bookings WHERE id='b_qa_negotiation' AND crew_id=current_setting('qa.crew') AND crew_rate=1100 AND status='pencil') THEN RAISE EXCEPTION 'Agreed rate did not reserve booking pending terms'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gig_negotiations WHERE booking_id='b_qa_negotiation' AND status='accepted' AND agreed_rate=1100) THEN RAISE EXCEPTION 'Agreement not saved'; END IF;
 BEGIN PERFORM public.gig_negotiate('b_qa_negotiation',current_setting('qa.crew'),'accept',NULL,true); RAISE EXCEPTION 'TEST FAILED duplicate acceptance allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'TEST FAILED%' THEN RAISE; END IF; END;
END $$;
UPDATE public.bookings SET crew_rate=99999,travel_flight_cost=99999 WHERE id='b_qa_negotiation';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.bookings WHERE id='b_qa_negotiation' AND crew_rate=1100 AND travel_flight_cost=0) THEN RAISE EXCEPTION 'Crew rate or travel-cost tampering allowed'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.gig_negotiation_events WHERE production_id='p_qa_negotiation' AND action='below_usual_acknowledged') THEN RAISE EXCEPTION 'Below-usual acknowledgment not recorded'; END IF;
 IF EXISTS(SELECT 1 FROM public.invoices WHERE booking_id='b_qa_negotiation') THEN RAISE EXCEPTION 'Negotiation prematurely issued invoice'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: below-usual acknowledgment, alternating offers, producer/crew negotiation, agreed-rate reservation pending terms, duplicate acceptance denial, audit events; all fixtures rolled back.' AS result;
