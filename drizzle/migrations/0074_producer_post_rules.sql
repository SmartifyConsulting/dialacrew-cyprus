CREATE TABLE public.producer_post_rules (
  producer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rules text NOT NULL DEFAULT '', apply_to_all boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.producer_post_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.producer_post_rules FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.producer_post_rules TO authenticated;
GRANT ALL ON public.producer_post_rules TO service_role;
CREATE POLICY "producer manages own post rules" ON public.producer_post_rules FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR (producer_id=auth.uid() AND public.has_role(auth.uid(),'producer')))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR (producer_id=auth.uid() AND public.has_role(auth.uid(),'producer')));
CREATE POLICY "production members read producer rules" ON public.producer_post_rules FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM public.productions p WHERE p.created_by=producer_id AND public.is_site_member(p.id)));
ALTER TABLE public.productions ADD COLUMN post_rules_mode text NOT NULL DEFAULT 'custom'
 CHECK (post_rules_mode IN ('custom','producer','none'));
