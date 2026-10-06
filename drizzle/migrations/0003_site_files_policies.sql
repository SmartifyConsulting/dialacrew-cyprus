CREATE POLICY "site files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-files' AND ((storage.foldername(name))[1] = 'crew' OR public.is_site_member((storage.foldername(name))[1])));
CREATE POLICY "site files upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-files' AND (
    ((storage.foldername(name))[1] = 'crew' AND ((storage.foldername(name))[2] = public.my_crew_id() OR public.has_role(auth.uid(),'producer')))
    OR public.is_site_member((storage.foldername(name))[1])));
CREATE POLICY "site files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-files' AND (owner = auth.uid() OR public.has_role(auth.uid(),'producer')));
