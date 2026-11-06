alter table public.profiles
  add column if not exists preferred_language text;

alter table public.profiles
  add constraint profiles_preferred_language_supported check (
    preferred_language is null or preferred_language in (
      'en','af','zu','xh','sn','sw','ha','ig','yo','ar','he','fr','de','es','pt',
      'it','nl','el','pl','ru','tr','hi','zh','ja','ko','mr','ur','te','ta','ml'
    )
  );
