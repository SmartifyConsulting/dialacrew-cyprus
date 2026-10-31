ALTER TABLE public.production_checklist_items
  ADD COLUMN IF NOT EXISTS done_at timestamptz;
