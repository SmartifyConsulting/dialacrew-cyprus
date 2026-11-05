CREATE POLICY "Admins upload brand logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brand-logos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update brand logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'brand-logos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete brand logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'brand-logos' AND public.has_role(auth.uid(), 'admin'));
INSERT INTO public.platform_settings(key, value) VALUES ('country_logos', '{
 "ZA": {"nav": "/__l5e/assets-v1/101438cc-513b-4663-9cd7-edb252585001/bookacrew-sa-logo.png", "signup": "/__l5e/assets-v1/badc31a6-c964-4355-9201-9699dcca1362/bookacrew-za-signup.png"},
 "CY": {"nav": "/__l5e/assets-v1/3c2b2476-830c-4eba-b195-8b9edd87f737/bookacrew-cy-nav.jpg", "signup": "/__l5e/assets-v1/1b6618a3-b396-4999-bcb6-489cb667fa0e/bookacrew-cy-signup.jpg"},
 "NG": {"nav": "/__l5e/assets-v1/0642a875-3d96-421a-a691-dee8c835b63c/bookacrew-ng-nav.jpg", "signup": "/__l5e/assets-v1/7c77c801-54d7-4d53-8f24-b14014fde5b0/bookacrew-ng-signup.jpg"},
 "IN": {"nav": "/__l5e/assets-v1/116d54ec-79da-40a5-a673-f588d9415b20/bookacrew-in-nav.jpg", "signup": "/__l5e/assets-v1/d4efcfe9-6011-44e3-be44-aa9cceca7fd1/bookacrew-in-signup.jpg"}
}'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();