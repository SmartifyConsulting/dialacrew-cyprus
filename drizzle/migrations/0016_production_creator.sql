-- Who created each production. Used to count a producer's first five productions, during which
-- the AI memory summary is withheld until it has enough history to make useful suggestions.
-- Productions created before this migration have no creator and are not counted.
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS productions_created_by_created_at_idx ON public.productions(created_by, created_at);
