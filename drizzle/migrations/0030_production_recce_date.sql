-- An optional scouting/recce date is visible to all production-site members.
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS recce_date date;
