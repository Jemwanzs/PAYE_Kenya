-- Run once in the Supabase SQL Editor to add the admin bypass flag.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Grant permanent free access to the app owner's account.
update public.profiles set is_admin = true where email = 'jamosammy@gmail.com';
