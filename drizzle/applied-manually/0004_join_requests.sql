CREATE TABLE IF NOT EXISTS public.join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  job_description text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
GRANT INSERT ON public.join_requests TO anon, authenticated;
--> statement-breakpoint
GRANT SELECT, DELETE ON public.join_requests TO authenticated;
--> statement-breakpoint
GRANT ALL ON public.join_requests TO service_role;
--> statement-breakpoint
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "anyone can apply" ON public.join_requests;
--> statement-breakpoint
CREATE POLICY "anyone can apply" ON public.join_requests FOR INSERT TO anon, authenticated
  WITH CHECK (length(name) BETWEEN 1 AND 120 AND length(email) BETWEEN 3 AND 255 AND length(message) <= 2000);
--> statement-breakpoint
DROP POLICY IF EXISTS "producers read applications" ON public.join_requests;
--> statement-breakpoint
CREATE POLICY "producers read applications" ON public.join_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'producer'));
--> statement-breakpoint
DROP POLICY IF EXISTS "producers delete applications" ON public.join_requests;
--> statement-breakpoint
CREATE POLICY "producers delete applications" ON public.join_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'producer'));
