-- Emails marios@moi.co.za whenever a new user signs up, by calling the notify-signup Edge
-- Function right after a row lands in auth.users. Separate from handle_new_user so a failure
-- here (e.g. the function being temporarily down) can never block account creation itself.
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://ntkkgahlqbbvduutjbef.supabase.co/functions/v1/notify-signup',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'email', new.email,
      'full_name', new.raw_user_meta_data ->> 'full_name',
      'role', new.raw_user_meta_data ->> 'role',
      'created_at', new.created_at
    )
  );
  return new;
exception when others then
  -- Never let a notification failure block sign-up.
  raise warning 'notify_new_signup failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_notify on auth.users;
create trigger on_auth_user_created_notify
  after insert on auth.users
  for each row execute function public.notify_new_signup();
