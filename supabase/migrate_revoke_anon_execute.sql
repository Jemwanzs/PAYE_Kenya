-- Follow-up to migrate_revoke_public_execute.sql -- that migration
-- revoked EXECUTE from the plain Postgres-wide `PUBLIC` pseudo-role,
-- but the Security Advisor still flagged all 20 functions afterward
-- with zero change. The reason: Supabase applies its own default
-- privileges in the `public` schema, granting EXECUTE directly to
-- `anon` and `authenticated` on every new function (that's what makes a
-- freshly created function immediately RPC-callable without a manual
-- grant) -- independent of, and not touched by, revoking the separate
-- implicit `PUBLIC` grant. This migration revokes from the actual role
-- the linter checks.
--
-- Three functions are never meant to be reached by ANY client role
-- directly, only internally (from another SECURITY DEFINER function or
-- a database trigger) -- these get `authenticated` revoked too, not
-- just `anon`:
--   _create_approval_actions -- trusts its p_owner_user_id argument
--     completely with no ownership check of its own by design.
--   handle_new_user / handle_leave_application_submitted -- trigger
--     functions, never called via RPC by this app at all.
--
-- Every other function keeps its existing explicit
-- `grant execute ... to authenticated` from when it was first created
-- (untouched by this migration) -- only `anon` loses access. Each of
-- these is also called directly by this app's own client code or
-- referenced inside an RLS policy under the `authenticated` role, so
-- `authenticated` access must be preserved for the app to keep working.
--
-- Safe to run against the live project.

revoke execute on function public._create_approval_actions(text, uuid, uuid) from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_leave_application_submitted() from anon, authenticated;

revoke execute on function public.next_employee_number() from anon;
revoke execute on function public.employee_visible_payroll_run_ids() from anon;
revoke execute on function public.my_active_employee_id() from anon;
revoke execute on function public.employee_owner_user_id(uuid) from anon;
revoke execute on function public.submit_for_approval(text, uuid) from anon;
revoke execute on function public.record_approval_decision(uuid, text, text) from anon;
revoke execute on function public.approver_assigned_leave_application_ids() from anon;
revoke execute on function public.approver_visible_applicant_ids() from anon;
revoke execute on function public.approver_assigned_payroll_run_ids() from anon;
revoke execute on function public.approver_visible_payslip_ids() from anon;
revoke execute on function public.session_log_identity() from anon;
revoke execute on function public.admin_list_businesses() from anon;
revoke execute on function public.admin_list_employees(uuid) from anon;
revoke execute on function public.admin_set_business_blocked(uuid, boolean) from anon;
revoke execute on function public.admin_set_employee_blocked(uuid, boolean) from anon;
revoke execute on function public.is_my_owner_blocked() from anon;
revoke execute on function public.check_login_security(numeric, numeric, text) from anon;
