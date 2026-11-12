-- Preserve historical checkouts; new rows start as requests.
ALTER TABLE public.inventory_checkouts
  ADD COLUMN request_state text,
  ADD COLUMN requested_by uuid,
  ADD COLUMN approved_by uuid,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN collected_by uuid,
  ADD COLUMN collected_at timestamptz;
UPDATE public.inventory_checkouts SET request_state = CASE WHEN returned_at IS NULL THEN 'collected' ELSE 'returned' END;
ALTER TABLE public.inventory_checkouts ALTER COLUMN request_state SET DEFAULT 'requested', ALTER COLUMN request_state SET NOT NULL;
ALTER TABLE public.inventory_checkouts ADD CONSTRAINT inventory_request_state CHECK (request_state IN ('requested','approved','declined','collected','returned'));

CREATE POLICY "crew read inventory library" ON public.inventory_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'crew'));
CREATE POLICY "crew read own loans" ON public.inventory_checkouts FOR SELECT TO authenticated
  USING (checked_out_crew_id = public.my_crew_id());
CREATE POLICY "crew request own loans" ON public.inventory_checkouts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'crew') AND checked_out_crew_id = public.my_crew_id()
    AND production_id IS NOT NULL AND public.is_site_member(production_id));

CREATE FUNCTION public.guard_inventory_loan() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE manager boolean; recipient uuid; stock integer; reserved integer;
BEGIN
  manager := public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin');
  IF TG_OP = 'INSERT' THEN
    IF NEW.request_state <> 'requested' OR NEW.returned_at IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.collected_by IS NOT NULL OR NEW.collected_at IS NOT NULL THEN
      RAISE EXCEPTION 'New inventory bookings must start as requests';
    END IF;
    IF NOT manager AND (NOT public.has_role(auth.uid(),'crew') OR NEW.checked_out_crew_id IS DISTINCT FROM public.my_crew_id()) THEN RAISE EXCEPTION 'Not authorized to request this loan'; END IF;
    SELECT user_id INTO recipient FROM public.crew_members WHERE id = NEW.checked_out_crew_id;
    IF recipient IS NULL THEN RAISE EXCEPTION 'Select a crew member with a linked app account'; END IF;
    IF NEW.production_id IS NULL THEN RAISE EXCEPTION 'Select a production'; END IF;
    IF NEW.quantity < 1 OR NEW.expected_return_at IS NULL OR NEW.expected_return_at < NEW.checked_out_at THEN RAISE EXCEPTION 'Enter a positive quantity and valid collection/return dates'; END IF;
    NEW.requested_by := auth.uid();
  ELSE
    -- The existing due-back scheduler may update only its delivery marker.
    IF (to_jsonb(NEW) - 'due_notified_at') = (to_jsonb(OLD) - 'due_notified_at') THEN RETURN NEW; END IF;
    IF NOT manager THEN RAISE EXCEPTION 'Only a producer can approve or confirm inventory handover'; END IF;
    IF (to_jsonb(NEW) - ARRAY['request_state','returned_at','approved_by','approved_at','collected_by','collected_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['request_state','returned_at','approved_by','approved_at','collected_by','collected_at']) THEN RAISE EXCEPTION 'Loan details cannot be changed after requesting'; END IF;
    IF NOT ((OLD.request_state='requested' AND NEW.request_state IN ('approved','declined')) OR
      (OLD.request_state='approved' AND NEW.request_state='collected') OR
      (OLD.request_state='collected' AND NEW.request_state='returned')) THEN RAISE EXCEPTION 'Invalid inventory loan transition'; END IF;
    NEW.approved_by := OLD.approved_by; NEW.approved_at := OLD.approved_at;
    NEW.collected_by := OLD.collected_by; NEW.collected_at := OLD.collected_at;
    NEW.returned_at := OLD.returned_at;
    IF NEW.request_state='approved' THEN NEW.approved_by := auth.uid(); NEW.approved_at := now(); END IF;
    IF NEW.request_state='collected' THEN NEW.collected_by := auth.uid(); NEW.collected_at := now(); END IF;
    IF NEW.request_state='returned' THEN NEW.returned_at := current_date; END IF;
  END IF;
  -- Serialize reservations of the same item to prevent concurrent overbooking.
  SELECT total_count INTO stock FROM public.inventory_items WHERE id=NEW.item_id FOR UPDATE;
  IF stock IS NULL THEN RAISE EXCEPTION 'Inventory item not found'; END IF;
  IF NEW.request_state IN ('requested','approved','collected') THEN
    SELECT COALESCE(sum(quantity),0) INTO reserved FROM public.inventory_checkouts
      WHERE item_id=NEW.item_id AND id<>NEW.id AND request_state IN ('approved','collected') AND returned_at IS NULL;
    IF reserved + NEW.quantity > stock THEN RAISE EXCEPTION 'Not enough inventory available'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_inventory_loan BEFORE INSERT OR UPDATE ON public.inventory_checkouts FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_loan();
REVOKE ALL ON FUNCTION public.guard_inventory_loan() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.notify_inventory_loan() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient uuid; item_name text; production_name text;
BEGIN
  IF NEW.request_state = OLD.request_state OR NEW.request_state NOT IN ('approved','collected') THEN RETURN NEW; END IF;
  SELECT user_id INTO recipient FROM public.crew_members WHERE id=NEW.checked_out_crew_id;
  IF recipient IS NULL THEN RAISE EXCEPTION 'The crew member must have a linked account'; END IF;
  SELECT name INTO item_name FROM public.inventory_items WHERE id=NEW.item_id;
  SELECT name INTO production_name FROM public.productions WHERE id=NEW.production_id;
  INSERT INTO public.notifications(user_id,production_id,title,body) VALUES(recipient,NEW.production_id,
    CASE NEW.request_state WHEN 'approved' THEN 'Inventory booking approved' ELSE 'Inventory collection confirmed' END,
    CASE NEW.request_state WHEN 'approved' THEN 'Your inventory booking for '||COALESCE(production_name,'your production')||' has been approved: '||NEW.quantity||' × '||item_name||'. Awaiting collection.'
    ELSE 'Collection confirmed for '||COALESCE(production_name,'your production')||': '||NEW.quantity||' × '||item_name||'. Expected return: '||COALESCE(NEW.expected_return_at::text,'not set')||'.' END);
  RETURN NEW;
END $$;
CREATE TRIGGER notify_inventory_loan AFTER UPDATE ON public.inventory_checkouts FOR EACH ROW EXECUTE FUNCTION public.notify_inventory_loan();
REVOKE ALL ON FUNCTION public.notify_inventory_loan() FROM PUBLIC, anon, authenticated;

-- Aggregate stock counts without disclosing other crew members' loan records.
CREATE FUNCTION public.inventory_stock() RETURNS TABLE(item_id uuid,reserved bigint,collected bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT i.id, COALESCE(sum(c.quantity) FILTER (WHERE c.request_state IN ('approved','collected') AND c.returned_at IS NULL),0),
   COALESCE(sum(c.quantity) FILTER (WHERE c.request_state='collected' AND c.returned_at IS NULL),0)
 FROM public.inventory_items i LEFT JOIN public.inventory_checkouts c ON c.item_id=i.id
 WHERE public.has_role(auth.uid(),'crew') OR public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin') GROUP BY i.id
$$;
REVOKE ALL ON FUNCTION public.inventory_stock() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_stock() TO authenticated;

-- Pending requests and approved reservations must never trigger a return reminder.
DO $$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef('public.flag_due_equipment_today()'::regprocedure) INTO definition;
  IF position('WHERE returned_at IS NULL AND expected_return_at' IN definition)=0 THEN RAISE EXCEPTION 'Review due-back scheduler before migrating'; END IF;
  definition := replace(definition,'WHERE returned_at IS NULL AND expected_return_at','WHERE request_state = ''collected'' AND returned_at IS NULL AND expected_return_at');
  EXECUTE definition;
END $$;
