-- Repair the uninstalled travel-cost portion of migration 0061 without changing existing values.
BEGIN;
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS travel_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS travel_flight_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_visa_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_accommodation_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_food_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_per_diem_rate numeric NOT NULL DEFAULT 0;
NOTIFY pgrst, 'reload schema';
COMMIT;
