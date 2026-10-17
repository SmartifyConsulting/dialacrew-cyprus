-- Document checklist templates, managed by admins. One template is the default and seeds every new production.
CREATE TABLE IF NOT EXISTS public.document_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'documents' CHECK (kind IN ('documents', 'cashflow')),
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_default_document_checklist ON public.document_checklist_templates (kind) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.document_checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.document_checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  amount numeric,
  sort_order integer NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_checklist_templates, public.document_checklist_template_items TO authenticated;
GRANT ALL ON public.document_checklist_templates, public.document_checklist_template_items TO service_role;
ALTER TABLE public.document_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_checklist_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage document checklist templates" ON public.document_checklist_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage document checklist template items" ON public.document_checklist_template_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- The checklist on a production. Producers add, remove and reorder these; site members see them.
CREATE TABLE IF NOT EXISTS public.production_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_id text NOT NULL REFERENCES public.productions(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_document_items TO authenticated;
GRANT ALL ON public.production_document_items TO service_role;
ALTER TABLE public.production_document_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site members read document items" ON public.production_document_items FOR SELECT TO authenticated USING (public.is_site_member(production_id));
CREATE POLICY "producers manage document items" ON public.production_document_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id))
  WITH CHECK (public.has_role(auth.uid(), 'producer') AND public.is_site_member(production_id));

-- An uploaded document can be filed against a checklist record.
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS checklist_item_id uuid REFERENCES public.production_document_items(id) ON DELETE SET NULL;

-- Every new production starts from the default template.
CREATE OR REPLACE FUNCTION public.seed_production_document_items() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.production_document_items (production_id, label, sort_order)
  SELECT NEW.id, i.label, i.sort_order
  FROM public.document_checklist_template_items i
  JOIN public.document_checklist_templates t ON t.id = i.template_id
  WHERE t.is_default AND t.kind = 'documents'
  ORDER BY i.sort_order;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS productions_seed_document_items ON public.productions;
CREATE TRIGGER productions_seed_document_items AFTER INSERT ON public.productions
  FOR EACH ROW EXECUTE FUNCTION public.seed_production_document_items();

-- Starter default checklist. Admins can edit it on the Document Checklists page.
INSERT INTO public.document_checklist_templates (id, name, is_default, created_by)
VALUES ('00000000-0000-4000-8000-000000000001', 'Standard shoot', true, NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_checklist_template_items (template_id, label, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Call sheet', 1),
  ('00000000-0000-4000-8000-000000000001', 'Shooting schedule', 2),
  ('00000000-0000-4000-8000-000000000001', 'Script or treatment', 3),
  ('00000000-0000-4000-8000-000000000001', 'Location release forms', 4),
  ('00000000-0000-4000-8000-000000000001', 'Permits', 5),
  ('00000000-0000-4000-8000-000000000001', 'Crew contracts', 6),
  ('00000000-0000-4000-8000-000000000001', 'Insurance certificates', 7),
  ('00000000-0000-4000-8000-000000000001', 'Risk assessment', 8),
  ('00000000-0000-4000-8000-000000000001', 'Model releases', 9),
  ('00000000-0000-4000-8000-000000000001', 'Equipment hire agreements', 10),
  ('00000000-0000-4000-8000-000000000001', 'Catering and food safety', 11),
  ('00000000-0000-4000-8000-000000000001', 'Invoices and purchase orders', 12)
ON CONFLICT DO NOTHING;

-- Producers can read the saved checklists, load one onto a production, and save their own named checklists.
-- Only admins can set the default or change templates they didn't create.
CREATE POLICY "producers read document checklist templates" ON public.document_checklist_templates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'producer'));
CREATE POLICY "producers save named document checklists" ON public.document_checklist_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'producer') AND NOT is_default AND created_by = auth.uid());
CREATE POLICY "producers read document checklist items" ON public.document_checklist_template_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'producer'));
CREATE POLICY "producers save items to their checklists" ON public.document_checklist_template_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'producer') AND EXISTS (
    SELECT 1 FROM public.document_checklist_templates t WHERE t.id = template_id AND t.created_by = auth.uid() AND NOT t.is_default));

-- Default cashflow checklist, from the ROADCOVER cashflow sheet (budgeted buy amounts, ZAR).
INSERT INTO public.document_checklist_templates (id, name, kind, is_default, created_by)
VALUES ('00000000-0000-4000-8000-000000000002', 'ROADCOVER cashflow', 'cashflow', true, NULL)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.document_checklist_template_items (template_id, label, amount, sort_order) VALUES
  ('00000000-0000-4000-8000-000000000002', 'Location (HOTEL)', 6000, 1),
  ('00000000-0000-4000-8000-000000000002', 'Permit (JMPD)', 10000, 2),
  ('00000000-0000-4000-8000-000000000002', 'Make up (Amy)', 9000, 3),
  ('00000000-0000-4000-8000-000000000002', 'DOP (Krewkut)', 16000, 4),
  ('00000000-0000-4000-8000-000000000002', 'Crew (CALLACREW)', 90000, 5),
  ('00000000-0000-4000-8000-000000000002', 'Wardrobe stylist (Emma)', 20000, 6),
  ('00000000-0000-4000-8000-000000000002', 'Catering (Shisa catering)', 15000, 7),
  ('00000000-0000-4000-8000-000000000002', 'Rain machine (SFX Guys)', 35000, 8),
  ('00000000-0000-4000-8000-000000000002', 'Art (charlie)', 10000, 9),
  ('00000000-0000-4000-8000-000000000002', 'Gear (magic)', 8000, 10),
  ('00000000-0000-4000-8000-000000000002', 'Car rental (Taxi TBC)', 16500, 11),
  ('00000000-0000-4000-8000-000000000002', 'Contingency', 15000, 12),
  ('00000000-0000-4000-8000-000000000002', 'Cast (33andMe)', 60000, 13)
ON CONFLICT DO NOTHING;
