-- Backfills approval_actions (+ notifications) for pending leave
-- applications that were created *before* the leave approval workflow
-- existed or was turned active.
--
-- The on_leave_application_created trigger only fires on new inserts --
-- it can never retroactively route an already-existing row to an
-- approver. Once a leave workflow goes active, the owner's own
-- Approve/Reject buttons disappear for every pending application
-- (approval power moves entirely to the appointed approvers), but any
-- pending row that predates the workflow has zero approval_actions rows,
-- so it shows "Not yet submitted" in the owner's Leave > Applications
-- table with no way for anyone to act on it -- permanently stuck.
--
-- Deliberately scoped to leave_applications only, NOT payroll_runs: a
-- leave application is considered "submitted" the instant it's created
-- (see handle_leave_application_submitted()), but a payroll run requires
-- the owner's own explicit "Submit for approval" action -- silently
-- backfilling draft runs here would submit runs the owner never chose to
-- submit yet.
--
-- Safe to run repeatedly: _create_approval_actions() is a no-op for any
-- record that already has approval_actions rows, and for a record whose
-- workflow isn't active.

do $$
declare
  r record;
begin
  for r in
    select id, user_id from public.leave_applications la
    where status = 'pending'
      and not exists (
        select 1 from public.approval_actions aa
        where aa.action_type = 'leave_application' and aa.record_id = la.id
      )
  loop
    perform public._create_approval_actions('leave_application', r.id, r.user_id);
  end loop;
end $$;
