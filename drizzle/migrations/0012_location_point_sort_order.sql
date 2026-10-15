-- Adds a manual sort order to production_locations so producers can drag-and-drop
-- to resequence itinerary stops instead of relying only on their start dates.
alter table public.production_locations
  add column if not exists sort_order integer not null default 0;

-- Seed existing rows with a stable order based on current display order (start date, then creation).
with ranked as (
  select id, row_number() over (partition by production_id order by starts_at nulls last, created_at) - 1 as rn
  from public.production_locations
)
update public.production_locations pl
set sort_order = ranked.rn
from ranked
where ranked.id = pl.id;
