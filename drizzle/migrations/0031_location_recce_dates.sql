-- Each shoot location can have its own scouting/recce date.
ALTER TABLE public.production_locations
  ADD COLUMN IF NOT EXISTS recce_date date;
