CREATE TABLE IF NOT EXISTS public.crew_rate_cards (
 crew_id text PRIMARY KEY REFERENCES public.crew_members(id) ON DELETE CASCADE,
 hourly_rate numeric NOT NULL CHECK(hourly_rate>0),
 daily_rate numeric NOT NULL CHECK(daily_rate>0),
 standard_day_hours numeric NOT NULL DEFAULT 8 CHECK(standard_day_hours>0),
 discounted_daily_rate boolean GENERATED ALWAYS AS (daily_rate < hourly_rate * standard_day_hours) STORED,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crew_rate_cards ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.crew_rate_cards TO authenticated;
CREATE POLICY "rate cards readable" ON public.crew_rate_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "crew manages own rate card" ON public.crew_rate_cards FOR INSERT TO authenticated WITH CHECK (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE POLICY "crew updates own rate card" ON public.crew_rate_cards FOR UPDATE TO authenticated USING (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM public.crew_members c WHERE c.id=crew_id AND c.user_id=auth.uid()));
CREATE INDEX IF NOT EXISTS crew_rate_cards_discounted_idx ON public.crew_rate_cards(discounted_daily_rate);
