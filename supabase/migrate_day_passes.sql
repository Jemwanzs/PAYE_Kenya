-- Run once in the Supabase SQL Editor to upgrade an existing project from
-- the recurring Paystack subscription model to prepaid day-pass access.
-- Safe to run even if some of these columns were already removed.

alter table public.profiles
  add column if not exists access_expires_at timestamptz;

alter table public.profiles
  drop column if exists subscription_status;

alter table public.profiles
  drop column if exists paystack_subscription_code;

alter table public.profiles
  drop column if exists paystack_customer_code;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, trial_started_at)
  values (new.id, new.email, now());
  return new;
end;
$$;
