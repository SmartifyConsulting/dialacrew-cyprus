-- In-house inventory (company-owned equipment pool, distinct from a crew
-- member's own kit in crew_assets). Tracks total count and check-outs.
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Equipment',
  total_count integer NOT NULL DEFAULT 1,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers manage inventory items" ON public.inventory_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.inventory_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  production_id text REFERENCES public.productions(id) ON DELETE SET NULL,
  checked_out_to text NOT NULL DEFAULT '',
  checked_out_at date NOT NULL DEFAULT current_date,
  expected_return_at date,
  returned_at date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_checkouts TO authenticated;
GRANT ALL ON public.inventory_checkouts TO service_role;
ALTER TABLE public.inventory_checkouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers manage inventory checkouts" ON public.inventory_checkouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'producer') OR public.has_role(auth.uid(), 'admin'));
