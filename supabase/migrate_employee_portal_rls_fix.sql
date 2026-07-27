-- Fixes a circular RLS dependency introduced by migrate_employee_portal.sql:
-- employee_read_own_payslips (on payslips) referenced payroll_runs, and
-- employee_read_own_payroll_runs (on payroll_runs) referenced payslips
-- right back. Postgres detects that as infinite recursion and errors out
-- on ANY select against either table -- for every role, not just
-- employees, which is why payroll runs stopped loading for the owner too.
--
-- Fix: a single SECURITY DEFINER function does the employee/payslip/run
-- join itself. Table owners bypass their own tables' RLS by default (this
-- project already relies on that exact behavior for next_employee_number()
-- in migrate_employee_numbering.sql), so the function's internal query
-- never re-triggers either table's policies -- breaking the cycle instead
-- of just relocating it.
--
-- Safe to run against the live project. Run this AFTER
-- migrate_employee_portal.sql.

drop policy if exists "employee_read_own_payslips" on public.payslips;
drop policy if exists "employee_read_own_payroll_runs" on public.payroll_runs;

create or replace function public.employee_visible_payroll_run_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct p.payroll_run_id
  from public.payslips p
  join public.employees e on e.id = p.employee_id
  join public.payroll_runs r on r.id = p.payroll_run_id
  where e.auth_user_id = auth.uid()
    and e.status <> 'terminated'
    and r.status in ('approved', 'processed');
$$;

grant execute on function public.employee_visible_payroll_run_ids() to authenticated;

create policy "employee_read_own_payslips"
  on public.payslips for select
  to authenticated
  using (payroll_run_id in (select public.employee_visible_payroll_run_ids()));

create policy "employee_read_own_payroll_runs"
  on public.payroll_runs for select
  to authenticated
  using (id in (select public.employee_visible_payroll_run_ids()));
