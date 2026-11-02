-- Serial/Asset ID on each equipment item, a crew link on each checkout (so the person who took it
-- can be notified directly, not just shown by name), and a same-day due-back flag that notifies
-- both the producer(s) on that production and the person who checked the item out.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS serial_code text;

ALTER TABLE public.inventory_checkouts
  ADD COLUMN IF NOT EXISTS checked_out_crew_id text REFERENCES public.crew_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_notified_at timestamptz;

-- Run once a day (see the pg_cron schedule below): for every checkout due back today that hasn't
-- been returned or already notified, notify the crew member who took it (if linked to an app
-- account) and every producer booked on that production (or every producer, if the checkout isn't
-- tied to a production).
CREATE OR REPLACE FUNCTION public.flag_due_equipment_today()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_item text;
  v_crew_uid uuid;
  v_producer_id uuid;
BEGIN
  FOR r IN
    SELECT * FROM public.inventory_checkouts
    WHERE returned_at IS NULL AND expected_return_at = current_date AND due_notified_at IS NULL
  LOOP
    SELECT name INTO v_item FROM public.inventory_items WHERE id = r.item_id;

    IF r.checked_out_crew_id IS NOT NULL THEN
      SELECT user_id INTO v_crew_uid FROM public.crew_members WHERE id = r.checked_out_crew_id;
      IF v_crew_uid IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, production_id, title, body)
        VALUES (v_crew_uid, r.production_id, 'Equipment due back today', COALESCE(v_item, 'An item') || ' is due back today.');
      END IF;
    END IF;

    IF r.production_id IS NOT NULL THEN
      FOR v_producer_id IN
        SELECT cm.user_id FROM public.bookings b JOIN public.crew_members cm ON cm.id = b.crew_id
        WHERE b.production_id = r.production_id AND lower(b.role) = 'producer' AND b.status <> 'cancelled' AND cm.user_id IS NOT NULL
      LOOP
        INSERT INTO public.notifications (user_id, production_id, title, body)
        VALUES (v_producer_id, r.production_id, 'Equipment due back today', COALESCE(r.checked_out_to, 'Someone') || ' needs to return ' || COALESCE(v_item, 'an item') || ' today.');
      END LOOP;
    ELSE
      FOR v_producer_id IN SELECT user_id FROM public.user_roles WHERE role = 'producer' LOOP
        INSERT INTO public.notifications (user_id, production_id, title, body)
        VALUES (v_producer_id, NULL, 'Equipment due back today', COALESCE(r.checked_out_to, 'Someone') || ' needs to return ' || COALESCE(v_item, 'an item') || ' today.');
      END LOOP;
    END IF;

    UPDATE public.inventory_checkouts SET due_notified_at = now() WHERE id = r.id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.flag_due_equipment_today() FROM PUBLIC;

-- Schedules the daily check at 06:00 UTC, only if pg_cron is enabled on this project (Supabase:
-- Database → Extensions → pg_cron). If it isn't enabled, this block is skipped — the function
-- above still exists and can be called manually or wired to another scheduler.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'equipment-due-today';
    PERFORM cron.schedule('equipment-due-today', '0 6 * * *', $cron$ SELECT public.flag_due_equipment_today(); $cron$);
  END IF;
END $$;

-- Seed the inventory with the supplied kit list. Serial/Asset IDs aren't known yet — fill them in
-- via Admin ▸ Equipment once tags are on hand. Skips any name that's already in the library.
INSERT INTO public.inventory_items (name, category, total_count)
SELECT v.name, v.category, 1 FROM (VALUES
  ('Focusrite Scarlett 2i2 Audio Interface', 'Sound'),
  ('Universal Audio Apollo Twin X Duo', 'Sound'),
  ('Shure SM7B Dynamic Vocal Microphone', 'Sound'),
  ('Rode NT1-A Large-Diaphragm Condenser Microphone', 'Sound'),
  ('Neumann U 87 Ai Condenser Microphone', 'Sound'),
  ('Audio-Technica ATH-M50x Closed-Back Studio Headphones', 'Sound'),
  ('Sennheiser HD 600 Open-Back Headphones', 'Sound'),
  ('Yamaha HS8 Active Studio Monitor (Pair)', 'Sound'),
  ('Cloud Microphones Cloudlifter CL-1 Mic Activator', 'Sound'),
  ('Radial J48 Active Direct Box (DI Box)', 'Sound'),
  ('Arturia KeyLab Essential 61 MIDI Controller', 'Sound'),
  ('Novation Launchkey 49 MK3', 'Sound'),
  ('Moog Subsequent 37 Analog Synthesizer', 'Sound'),
  ('Roland JU-06A Sound Module', 'Sound'),
  ('Korg Minilogue XD Synthesizer', 'Sound'),
  ('Ableton Push 3 Standalone', 'Sound'),
  ('Akai Professional MPC One+', 'Sound'),
  ('Native Instruments Maschine MK3', 'Sound'),
  ('Native Instruments Komplete Kontrol S88', 'Sound'),
  ('Mogami Gold Studio XLR Cable (20 ft)', 'Sound'),
  ('Livewire Advantage 1/4" TRS Instrument Cable (10 ft)', 'Sound'),
  ('K&M 210/9 Telescopic Boom Microphone Stand', 'Sound'),
  ('Kaotica Eyeball Acoustic Microphone Shield', 'Sound'),
  ('Neewer Heavy-Duty Desktop Mic Arm', 'Sound'),
  ('Apple MacBook Pro 16" (M3 Max / 36GB RAM)', 'Equipment'),
  ('SanDisk 2TB Extreme Portable SSD', 'Equipment'),
  ('CalDigit TS4 Thunderbolt 4 Dock', 'Equipment'),
  ('Furman M-8x2 Power Conditioner', 'Equipment'),
  ('Anker 737 Power Bank (PowerCore 24K)', 'Equipment'),
  ('QSC K12.2 2000W 12-inch Powered Speaker', 'Sound'),
  ('Electro-Voice EKX-18SP 18-inch Powered Subwoofer', 'Sound'),
  ('JBL PRX815XLFW 15-inch Self-Powered Subwoofer System', 'Sound'),
  ('Yamaha DBR10 10-inch Powered Loudspeaker', 'Sound'),
  ('Mackie Thump15A 1300W 15-inch Powered Loudspeaker', 'Sound'),
  ('Behringer X32 Digital Mixing Console (32-Channel)', 'Sound'),
  ('Allen & Heath SQ-5 48-Channel Digital Mixer', 'Sound'),
  ('Behringer S16 Digital Stage Box / Snake', 'Sound'),
  ('Soundcraft Ui16 16-Input Remote-Controlled Digital Mixer', 'Sound'),
  ('Yamaha MG12XU 12-Channel Analog Mixer with FX', 'Sound'),
  ('Shure BLX24R/SM58 Wireless Handheld Microphone System', 'Sound'),
  ('Sennheiser EW-D SKM-S Wireless Base Set (R1-6)', 'Sound'),
  ('Shure PSM 300 Wireless In-Ear Monitoring System (P3T/P3RA)', 'Sound'),
  ('Sennheiser ew IEM G4 Wireless In-Ear Monitor System', 'Sound'),
  ('Behringer Powerplay P2 Ultra-Compact Personal IEM Amplifier', 'Sound'),
  ('Shure SM58 Dynamic Vocal Microphone', 'Sound'),
  ('Shure SM57 Dynamic Instrument Microphone', 'Sound'),
  ('Sennheiser e 604 Dynamic Drum Microphone', 'Sound'),
  ('Shure Beta 52A Dynamic Kick Drum Microphone', 'Sound'),
  ('Radial ProDI Passive Direct Box', 'Sound'),
  ('Radial ProD2 2-Channel Passive Stereo Direct Box', 'Sound'),
  ('Whirlwind Medusa Series 16x4 Audio Stage Snake (50 ft)', 'Grip'),
  ('Pro Co 100 ft 4-Channel XLR Snake', 'Grip'),
  ('Mogami Stage Line Heavy-Duty XLR Cable (50 ft)', 'Grip'),
  ('NL4 SpeakON to SpeakON Speaker Cable (50 ft)', 'Grip'),
  ('Furman SS-6B 6-Outlet Pro Surge Block', 'Grip'),
  ('Tripp Lite 14-Gauge Heavy-Duty Power Extension Cord (50 ft)', 'Grip'),
  ('Ultimate Support TS-90B TeleLock Speaker Stand', 'Grip'),
  ('K&M 210/2 Heavy-Duty Tripod Microphone Boom Stand', 'Grip'),
  ('On-Stage Deluxe Adjustable Subwoofer Pole', 'Grip'),
  ('Gator Cases 12U Audio Rack Flight Case with Wheels', 'Grip'),
  ('ProX ATA Flight Case for 32-Channel Digital Console', 'Grip'),
  ('Chauvet DJ Intimidator Spot 260X LED Moving Head', 'Lighting'),
  ('ADJ Focus Spot 4Z LED Moving Head Fixture', 'Lighting'),
  ('Chauvet DJ SLIMPAR Pro Q USB LED Par Can', 'Lighting'),
  ('ADJ Mega Hex Par LED Wash Light', 'Lighting'),
  ('Chauvet DJ FREEDOM Flex H4 IP Wireless Battery Par', 'Lighting'),
  ('ADJ Saber Bar 6-Head White LED Pinspot Array', 'Lighting'),
  ('Chauvet DJ COLORband T3 USB LED Linear Wash', 'Lighting'),
  ('Elation Professional Fuze Wash FR LED Fresnel', 'Lighting'),
  ('Chauvet DJ ShowXpress 512-Channel USB DMX Interface', 'Lighting'),
  ('ADJ Link 4-Universe iPad/Tablet DMX Controller', 'Lighting'),
  ('ChamSys QuickQ 10 Compact DMX Console', 'Lighting'),
  ('Elation Professional Obsidian ONYX NX Touch Console', 'Lighting'),
  ('Chauvet DJ FlareCON Air Wireless DMX Transmitter', 'Lighting'),
  ('Chauvet DJ Data Stream 4-Output DMX Optical Splitter', 'Lighting'),
  ('Accu-Cable 5-Pin DMX Cable (50 ft)', 'Lighting'),
  ('Accu-Cable 3-Pin to 5-Pin DMX Adapter Cable', 'Lighting'),
  ('Global Truss F34 Square Aluminum Truss Segment (3.28 ft / 1.0 m)', 'Lighting'),
  ('Global Truss F34 Square Aluminum Truss Segment (6.56 ft / 2.0 m)', 'Lighting'),
  ('Global Truss F34 Base Plate (24" x 24" Heavy Duty Steel)', 'Lighting'),
  ('Global Truss F34 2-Way 90-Degree Corner Block', 'Lighting'),
  ('Chauvet DJ CH-05 Heavy-Duty Lighting C-Clamp', 'Lighting'),
  ('Global Truss Slim Snap Clamp for 2-inch Tubing', 'Lighting'),
  ('ProX T-LS35M Heavy-Duty Crank Lighting Tower Stand (16 ft Max Height)', 'Lighting'),
  ('K&M 24625 Heavy-Duty Lighting Stand with T-Bar', 'Lighting'),
  ('Chauvet DJ Hurricane 1800 Flex DMX Fog Machine', 'Lighting'),
  ('ADJ Entour Venue DMX Professional Fazer / Haze Machine', 'Lighting'),
  ('Chauvet DJ Geyser P7 Vertical RGB LED Fogger', 'Lighting')
) AS v(name, category)
WHERE NOT EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.name = v.name);
