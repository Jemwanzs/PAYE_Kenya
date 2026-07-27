-- Fixes the actual reason approval workflows didn't "work seamlessly":
-- an approver's own portal session had no RLS read access to (a) the
-- leave_applications row they're assigned to approve, (b) the applicant's
-- basic employee record (name), or (c) the payroll_runs row they're
-- assigned to approve while it's still in draft (the only status it can
-- be in *before* full approval). The approve/reject action itself always
-- worked correctly (record_approval_decision is SECURITY DEFINER and
-- bypasses RLS), but the display queries in the portal's "For my
-- approval" / "Payroll approvals" screens were silently blocked, showing
-- "Unknown" for the applicant's name and "Record no longer available"
-- for the record itself.
--
-- Each new policy is backed by its own SECURITY DEFINER function that
-- does the entire join internally (bypassing RLS throughout, since the
-- function runs as the table owner) rather than a raw cross-table
-- subquery -- the same fix pattern already used for
-- employee_visible_payroll_run_ids() after the circular-recursion bug.
-- None of these three functions call each other or re-trigger any
-- table's RLS, so there's no risk of reintroducing that bug here.
--
-- Safe to run against the live project (additive only).

create or replace function public.approver_assigned_leave_application_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select aa.record_id
  from public.approval_actions aa
  join public.employees me on me.id = aa.employee_id
  where aa.action_type = 'leave_application'
    and me.auth_user_id = auth.uid()
    and me.status <> 'terminated';
$$;

grant execute on function public.approver_assigned_leave_application_ids() to authenticated;

create policy "approver_read_assigned_leave_applications"
  on public.leave_applications for select
  to authenticated
  using (id in (select public.approver_assigned_leave_application_ids()));

create or replace function public.approver_visible_applicant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct la.employee_id
  from public.leave_applications la
  join public.approval_actions aa on aa.action_type = 'leave_application' and aa.record_id = la.id
  join public.employees me on me.id = aa.employee_id
  where me.auth_user_id = auth.uid()
    and me.status <> 'terminated';
$$;

grant execute on function public.approver_visible_applicant_ids() to authenticated;

create policy "approver_read_applicant_employee_records"
  on public.employees for select
  to authenticated
  using (id in (select public.approver_visible_applicant_ids()));

create or replace function public.approver_assigned_payroll_run_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select aa.record_id
  from public.approval_actions aa
  join public.employees me on me.id = aa.employee_id
  where aa.action_type = 'payroll_run'
    and me.auth_user_id = auth.uid()
    and me.status <> 'terminated';
$$;

grant execute on function public.approver_assigned_payroll_run_ids() to authenticated;

create policy "approver_read_assigned_payroll_runs"
  on public.payroll_runs for select
  to authenticated
  using (id in (select public.approver_assigned_payroll_run_ids()));
