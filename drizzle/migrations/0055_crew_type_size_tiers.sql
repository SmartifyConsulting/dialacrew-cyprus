-- Two distinct kinds of crew_groups now: "Crew Type" is a fixed set of 4 size tiers (applied at
-- the day level, to Crew Required / Scenario 1), and "Crew Mix" is the existing free-form curated
-- combos (applied per Sandbox scenario). size_tier set = Crew Type; null = Crew Mix.
ALTER TABLE public.crew_groups
  ADD COLUMN IF NOT EXISTS size_tier text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crew_groups_size_tier_check') THEN
    ALTER TABLE public.crew_groups ADD CONSTRAINT crew_groups_size_tier_check
      CHECK (size_tier IS NULL OR size_tier IN ('Small', 'Medium', 'Large', 'Extra-Large'));
  END IF;
END $$;

INSERT INTO public.crew_groups (name, size_tier)
SELECT t.name, t.name FROM (VALUES ('Small'), ('Medium'), ('Large'), ('Extra-Large')) AS t(name)
WHERE NOT EXISTS (SELECT 1 FROM public.crew_groups g WHERE g.size_tier = t.name);
