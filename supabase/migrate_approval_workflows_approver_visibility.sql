-- Fixes a real gap in migrate_approval_workflows.sql: approval_workflows
-- and approval_workflow_approvers only ever had owner-facing policies
-- ("manage_own_*", scoped to auth.uid() = user_id). An appointed
-- approver's own portal session has no way to read either table, so
-- checkIsApprover()-style client checks always silently return zero rows
-- for a real employee session -- the Approvals UI never appeared for
-- anyone, regardless of actual appointment.
--
-- Both new policies route through `employees` only, the same
-- non-circular shape used everywhere else in this app's employee-portal
-- RLS. The approval_workflows policy additionally routes through
-- approval_workflow_approvers, but only in that one direction (workflows
-- -> approvers -> employees) -- approval_workflow_approvers' own new
-- policy below never references approval_workflows back, so this stays a
-- one-way lookup, not the two-way circular reference that caused the
-- payroll_runs/payslips recursion bug fixed earlier.
--
-- Safe to run against the live project. Run this AFTER
-- migrate_approval_workflows.sql.

create policy "approver_read_own_workflow_approver_rows"
  on public.approval_workflow_approvers for select
  to authenticated
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create policy "approver_read_relevant_workflows"
  on public.approval_workflows for select
  to authenticated
  using (
    id in (
      select workflow_id from public.approval_workflow_approvers
      where employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated')
    )
  );