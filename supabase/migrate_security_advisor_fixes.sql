-- Fixes two more Supabase Security Advisor findings.
--
-- 1. "RLS Enabled No Policy" on public.login_otps -- this was actually
-- intentional (see migrate_login_otp.sql): only the service-role key,
-- used inside api/send-login-otp.js / api/verify-login-otp.js, should
-- ever touch this table, so it was deliberately left with zero
-- policies for authenticated/anon (RLS enabled + no policy = default
-- deny for every client-side role). The linter can't distinguish "no
-- policy on purpose" from "forgot to add one," so it flags both the
-- same way. Adds an explicit deny-all policy instead -- functionally
-- identical (service_role still bypasses RLS entirely either way; a
-- client session still gets zero rows either way), but now the intent
-- is on record as a real policy instead of an absence the linter has
-- to guess about.
--
-- 2. "Public Bucket Allows Listing" on storage.business-logos -- the
-- business_logos_public_read SELECT policy on storage.objects turns
-- out to be unnecessary for what this app actually uses the bucket
-- for: employees.js only ever calls .upload() (needs the existing
-- INSERT/UPDATE/DELETE policies, untouched here) and .getPublicUrl()
-- (pure client-side string building, no RLS-gated request at all).
-- Since the bucket itself is already marked public in storage.buckets,
-- Supabase serves individual objects at the dedicated
-- /storage/v1/object/public/... URL without consulting storage.objects
-- RLS at all -- so this SELECT policy was never actually needed for
-- payslip/muster-roll/leave-balance logos to keep working. Its only
-- real effect was letting anyone list/enumerate every file (and every
-- business's user_id, used as the folder name) in the bucket via the
-- RLS-gated object-listing endpoint. Dropping it removes that
-- enumeration ability while logo images keep loading exactly as before.
--
-- Safe to run against the live project.

create policy "no_client_access_login_otps"
  on public.login_otps for all
  to authenticated, anon
  using (false)
  with check (false);

drop policy if exists "business_logos_public_read" on storage.objects;
