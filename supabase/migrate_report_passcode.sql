-- Adds an optional per-business passcode gate in front of report
-- downloads/prints (payslip, muster roll, leave balances). Opt-in: null
-- means no passcode has been configured yet, so reports stay ungated
-- exactly as before -- existing tenants aren't suddenly locked out
-- until they choose to turn this on in Settings.
--
-- Stores a SHA-256 hash (salted with the owner's own user_id), computed
-- client-side via the Web Crypto API, never the plaintext passcode.
-- Covered by payroll_settings' existing "manage_own" all-commands RLS
-- policy -- no new policy needed, since only the owning business can
-- ever read or write its own row.
--
-- Safe to run against the live project (additive only).

alter table public.payroll_settings
  add column if not exists report_passcode_hash text;
