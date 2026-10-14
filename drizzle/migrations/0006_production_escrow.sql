CREATE TABLE public.production_escrow (
  production_id text PRIMARY KEY REFERENCES public.productions(id) ON DELETE CASCADE,
  escrow_transaction_id text,
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'awaiting_funds',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.production_escrow TO authenticated;
GRANT ALL ON public.production_escrow TO service_role;
ALTER TABLE public.production_escrow ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage escrow" ON public.production_escrow FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'producer') OR public.has_role(auth.uid(),'admin'));
ALTER TABLE public.bookings ADD COLUMN escrow_released_at timestamptz;