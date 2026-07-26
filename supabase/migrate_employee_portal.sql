-- Lets a business owner invite a specific employee to log in and see only
-- their own payslips, their own (read-only) personal/employment details,
-- and their leave balances + apply-for-leave. Safe to run against the
-- live project (additive only).

alter table public.employees
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists invited_at timestamptz;

-- role/owner_user_id/employee_id are deliberately never set by the
-- handle_new_user() trigger (which stays unconditional -- every signup
-- still gets a plain 'owner'-shaped row). They're only ever set by
-- api/invite-employee.js using the service-role key, right after it has
-- independently verified (server-side) that the calling owner really owns
-- the employee being invited. If the trigger itself branched on
-- client-suppliable signup metadata instead, a self-signup user could
-- forge {role:'employee', owner_user_id:X, employee_id:Y} and grant
-- themselves read access to a business they don't work for.
alter table public.profiles
  add column if not exists role text not null default 'owner' check (role in ('owner', 'employee')),
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists employee_id uuid references public.employees(id);

-- The existing "manage_own_*" policies on every table below are for-all,
-- untouched, and still scoped to the business owner's own auth.uid(). The
-- policies added here are additive, select-only (plus one narrow insert),
-- and scoped through employees.auth_user_id instead -- Postgres OR's
-- multiple policies on the same command together, so these only ever grant
-- a logged-in employee visibility into their OWN records, never weaken or
-- replace the owner's full access.
--
-- "and status <> 'terminated'" in every clause is what makes terminating
-- an employee an immediate, server-enforced login cutoff rather than a
-- client-side courtesy: the moment employees.status flips, every one of
-- these policies stops returning rows for that auth_user_id, even for an
-- already-open session.

create policy "employee_read_own_employee_record"
  on public.employees for select
  to authenticated
  using (auth_user_id = auth.uid() and status <> 'terminated');

-- Restricted to approved/processed runs -- a draft run's figures can still
-- change before approval, so it must never be shown to the employee it
-- belongs to.
create policy "employee_read_own_payslips"
  on public.payslips for select
  to authenticated
  using (
    employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated')
    and payroll_run_id in (select id from public.payroll_runs where status in ('approved', 'processed'))
  );

create policy "employee_read_own_payroll_runs"
  on public.payroll_runs for select
  to authenticated
  using (
    status in ('approved', 'processed')
    and id in (
      select payroll_run_id from public.payslips
      where employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated')
    )
  );

create policy "employee_read_own_business_leave_types"
  on public.leave_types for select
  to authenticated
  using (user_id in (select user_id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create policy "employee_read_own_business_holidays"
  on public.public_holidays for select
  to authenticated
  using (user_id in (select user_id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create policy "employee_read_own_business_settings"
  on public.payroll_settings for select
  to authenticated
  using (user_id in (select user_id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create policy "employee_read_own_leave_applications"
  on public.leave_applications for select
  to authenticated
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

-- An employee can only ever create a pending application for themselves,
-- under their own employer's user_id -- never approve/reject (no update
-- policy is granted to employees at all).
create policy "employee_apply_for_own_leave"
  on public.leave_applications for insert
  to authenticated
  with check (
    status = 'pending'
    and employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated')
    and user_id = (select user_id from public.employees where id = employee_id)
  );

create policy "employee_read_own_leave_adjustments"
  on public.leave_balance_adjustments for select
  to authenticated
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));
