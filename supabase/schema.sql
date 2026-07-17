-- Run once in the Supabase SQL Editor for this project.

create table public.profiles (
  id                          uuid primary key references auth.users(id) on delete cascade,
  email                       text,
  trial_started_at           timestamptz not null default now(),
  subscription_status        text not null default 'none'
                               check (subscription_status in
                                 ('none', 'active', 'non-renewing', 'attention', 'completed', 'cancelled')),
  paystack_customer_code     text unique,
  paystack_subscription_code text unique,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Deliberately no insert/update/delete policy for the `authenticated` role.
-- Writes only ever happen via handle_new_user() (SECURITY DEFINER, below)
-- or the Paystack webhook using the service-role key, both of which bypass
-- RLS. This makes it structurally impossible for a signed-in user to grant
-- themselves access by calling supabase.from('profiles').update(...).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, trial_started_at, subscription_status)
  values (new.id, new.email, now(), 'none');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
