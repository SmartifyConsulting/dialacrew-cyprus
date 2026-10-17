-- Rules of engagement for posts on a production. Set by the producer, shown to everyone on the job.
ALTER TABLE public.productions ADD COLUMN IF NOT EXISTS post_rules text NOT NULL DEFAULT '';
