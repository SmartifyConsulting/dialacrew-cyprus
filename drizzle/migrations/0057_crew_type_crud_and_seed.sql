-- Crew Type becomes fully producer-managed (create/rename/delete tiers), not fixed to exactly
-- Small/Medium/Large/Extra-Large — drop the check constraint that enforced that fixed set.
ALTER TABLE public.crew_groups DROP CONSTRAINT IF EXISTS crew_groups_size_tier_check;

-- Seed membership for the 4 default tiers using whatever crew already exists, split roughly
-- evenly by day rate (cheaper crew into Small, pricier into Extra-Large) so there's real data to
-- look at. Skips a tier if it already has members (safe to re-run) or if there's no crew yet.
DO $$
DECLARE
  v_small uuid; v_medium uuid; v_large uuid; v_xl uuid;
  v_total int;
BEGIN
  SELECT id INTO v_small FROM public.crew_groups WHERE size_tier = 'Small';
  SELECT id INTO v_medium FROM public.crew_groups WHERE size_tier = 'Medium';
  SELECT id INTO v_large FROM public.crew_groups WHERE size_tier = 'Large';
  SELECT id INTO v_xl FROM public.crew_groups WHERE size_tier = 'Extra-Large';
  SELECT count(*) INTO v_total FROM public.crew_members;

  IF v_small IS NOT NULL AND v_total > 0 AND NOT EXISTS (SELECT 1 FROM public.crew_group_members WHERE group_id = v_small) THEN
    INSERT INTO public.crew_group_members (group_id, crew_id)
    SELECT v_small, id FROM (
      SELECT id, ntile(4) OVER (ORDER BY day_rate NULLS LAST) AS bucket FROM public.crew_members
    ) t WHERE bucket = 1
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_medium IS NOT NULL AND v_total > 0 AND NOT EXISTS (SELECT 1 FROM public.crew_group_members WHERE group_id = v_medium) THEN
    INSERT INTO public.crew_group_members (group_id, crew_id)
    SELECT v_medium, id FROM (
      SELECT id, ntile(4) OVER (ORDER BY day_rate NULLS LAST) AS bucket FROM public.crew_members
    ) t WHERE bucket = 2
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_large IS NOT NULL AND v_total > 0 AND NOT EXISTS (SELECT 1 FROM public.crew_group_members WHERE group_id = v_large) THEN
    INSERT INTO public.crew_group_members (group_id, crew_id)
    SELECT v_large, id FROM (
      SELECT id, ntile(4) OVER (ORDER BY day_rate NULLS LAST) AS bucket FROM public.crew_members
    ) t WHERE bucket = 3
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_xl IS NOT NULL AND v_total > 0 AND NOT EXISTS (SELECT 1 FROM public.crew_group_members WHERE group_id = v_xl) THEN
    INSERT INTO public.crew_group_members (group_id, crew_id)
    SELECT v_xl, id FROM (
      SELECT id, ntile(4) OVER (ORDER BY day_rate NULLS LAST) AS bucket FROM public.crew_members
    ) t WHERE bucket = 4
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
