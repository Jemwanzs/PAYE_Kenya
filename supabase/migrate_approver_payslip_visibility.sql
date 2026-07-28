-- Lets an appointed payroll approver actually see what they're approving.
--
-- Their portal session already has RLS access to the payroll_runs row
-- itself (approver_read_assigned_payroll_runs, migrate_approver_visibility_fix.sql),
-- but not to any payslips in it -- the only existing payslip-read policy
-- (employee_visible_payroll_run_ids/employee_read_own_payslips) is
-- deliberately restricted to approved/processed runs, since a draft run's
-- figures can still change and an ordinary employee should never see
-- them early. An approver reviewing a still-draft run is the opposite
-- case: they need to see the actual employee/net-pay breakdown *before*
-- approving, not after. Adds a narrow, separate policy for exactly that,
-- following the same SECURITY DEFINER helper-function pattern as the
-- other approver-visibility policies (avoids raw cross-table RLS
-- subqueries -- see migrate_leave_apply_rls_fix.sql for why those are
-- unreliable here).
--
-- Safe to run against the live project (additive only).

create or replace function public.approver_visible_payslip_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.id
  from public.payslips p
  join public.approval_actions aa on aa.action_type = 'payroll_run' and aa.record_id = p.payroll_run_id
  join public.employees me on me.id = aa.employee_id
  where me.auth_user_id = auth.uid()
    and me.status <> 'terminated';
$$;

grant execute on function public.approver_visible_payslip_ids() to authenticated;

create policy "approver_read_assigned_payroll_payslips"
  on public.payslips for select
  to authenticated
  using (id in (select public.approver_visible_payslip_ids()));
