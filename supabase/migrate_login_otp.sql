-- Backs the 5-digit email verification code required after every
-- password sign-in/sign-up (see api/send-login-otp.js and
-- api/verify-login-otp.js). Doubles as email verification for new
-- signups, since a code delivered to the address is proof it's real
-- and reachable -- no separate "confirm email" flow needed.
--
-- Deliberately has NO RLS policies granted to `authenticated`/`anon` at
-- all -- every read/write goes through the service-role key in the two
-- serverless functions above, never a direct client query. A code hash
-- must never be readable by the client session it's verifying, even via
-- a "select own row" policy -- that would let a compromised anon-key
-- session read its own hash back and attempt an offline brute force
-- with no rate limit or attempt cap.
--
-- Safe to run against the live project (additive only).

create table public.login_otps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.login_otps enable row level security;

create index login_otps_user_id_idx on public.login_otps(user_id, created_at desc);
