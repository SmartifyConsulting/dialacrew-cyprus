-- Project risks can now belong to one location. Null means the risk applies to the whole project.
-- Existing risks stay project-wide; deleting a location removes the risks attached to it.
ALTER TABLE public.production_risks
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.production_locations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS production_risks_location_id_idx ON public.production_risks(location_id);
