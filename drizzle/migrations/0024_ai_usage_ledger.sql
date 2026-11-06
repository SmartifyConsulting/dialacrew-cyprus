CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL,
  operation text NOT NULL,
  model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  cost_usd numeric(12,6),
  status integer NOT NULL DEFAULT 200,
  error_message text,
  user_id uuid,
  user_name text,
  production_id text
);
CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx ON public.ai_usage_events (created_at DESC);
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read AI usage" ON public.ai_usage_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));