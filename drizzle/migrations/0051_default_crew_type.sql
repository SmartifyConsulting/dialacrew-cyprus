-- Seed a starter "Default Crew Type" so producers have a ready-made template covering the
-- standard roles (see CREW_ROLES in the app) to fill in with real crew, instead of starting blank.
INSERT INTO public.crew_groups (name)
SELECT 'Default Crew Type'
WHERE NOT EXISTS (SELECT 1 FROM public.crew_groups WHERE name = 'Default Crew Type');
