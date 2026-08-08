-- Fixes Supabase's "Public Can Execute SECURITY DEFINER Function"
-- linter warning, raised against public._create_approval_actions but
-- applicable to every SECURITY DEFINER function in this schema:
-- Postgres grants EXECUTE to PUBLIC (which includes the unauthenticated
-- `anon` role) on every function by default, and none of these ever had
-- that default explicitly revoked.
--
-- _create_approval_actions is the one genuinely exploitable case: it
-- trusts its p_owner_user_id argument completely with no ownership
-- check of its own -- by design, since it's meant to only ever be
-- reached from submit_for_approval()/the leave-insert trigger, both of
-- which already verified the caller owns the record first. Called
-- directly via /rest/v1/rpc/_create_approval_actions, anyone could
-- fabricate approval_actions + notifications rows against ANY
-- business's user_id, spamming its approvers with fake pending items
-- for record_ids that don't even need to be real.
--
-- Every other function here was already safe in practice (each checks
-- auth.uid()/is_admin internally and fails closed for an unauthenticated
-- caller), but would each trip the same linter warning individually --
-- revoking PUBLIC from all of them now closes the underlying gap in one
-- pass instead of leaving it for the linter to surface 16 more times.
--
-- Safe to run against the live project: internal calls between
-- SECURITY DEFINER functions (e.g. submit_for_approval() calling
-- _create_approval_actions(), or a trigger calling
-- handle_leave_application_submitted()) execute as the function's own
-- owner, not the original external caller, so they are completely
-- unaffected by revoking PUBLIC/anon access here -- only a *direct*
-- external RPC call by an unprivileged role is blocked. Functions that
-- already had an explicit `grant ... to authenticated` keep working
-- for signed-in users exactly as before; that grant is untouched by
-- revoking PUBLIC.

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.next_employee_number() from public;
revoke execute on function public.employee_visible_payroll_run_ids() from public;
revoke execute on function public.my_active_employee_id() from public;
revoke execute on function public.employee_owner_user_id(uuid) from public;
revoke execute on function public._create_approval_actions(text, uuid, uuid) from public;
revoke execute on function public.submit_for_approval(text, uuid) from public;
revoke execute on function public.handle_leave_application_submitted() from public;
revoke execute on function public.record_approval_decision(uuid, text, text) from public;
revoke execute on function public.approver_assigned_leave_application_ids() from public;
revoke execute on function public.approver_visible_applicant_ids() from public;
revoke execute on function public.approver_assigned_payroll_run_ids() from public;
revoke execute on function public.approver_visible_payslip_ids() from public;
revoke execute on function public.session_log_identity() from public;
revoke execute on function public.admin_list_businesses() from public;
revoke execute on function public.admin_list_employees(uuid) from public;
revoke execute on function public.admin_set_business_blocked(uuid, boolean) from public;
revoke execute on function public.admin_set_employee_blocked(uuid, boolean) from public;
revoke execute on function public.is_my_owner_blocked() from public;
revoke execute on function public.check_login_security(numeric, numeric, text) from public;
