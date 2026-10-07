-- platform_settings (e.g. producer_self_signup_enabled) needs to be readable
-- on the signup page, which is visited while signed out — the previous
-- "authenticated only" policy silently broke that for every real visitor.
GRANT SELECT ON public.platform_settings TO anon;
CREATE POLICY "anon read settings" ON public.platform_settings FOR SELECT TO anon USING (true);
