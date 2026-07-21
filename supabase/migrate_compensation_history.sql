-- Dated compensation entries: lets an employee's basic pay, earnings/
-- benefits, and deductions change over time (raises, temporary
-- allowances, time-boxed deductions) instead of being a single static
-- value. A payroll run for a given period only picks up entries whose
-- date range overlaps that period; components that never get a dated
-- entry keep using the existing flat employees.compensation value as
-- before (zero impact on employees nobody touches this for).
--
-- component_key is one of: 'basicPay', one of the 13 earningComponents
-- ids from script.js (transportAllowance, overtimePay, ...), or one of
-- 'employeePensionRate' / 'employerPensionRate' / 'lifeInsurance' /
-- 'educationInsurance' / 'otherDeductions'. For the three "catch-all"
-- keys (otherCashAllowance, otherNonCashBenefit, otherDeductions) the
-- label is admin-provided free text and multiple simultaneous entries
-- are allowed (differentiated by label); for every other key the label
-- is the fixed component name and only one entry may be active at a
-- time. Both rules are enforced client-side before insert/update.
-- Safe to run against the live project (additive only).

create table if not exists public.employee_compensation_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  component_key text not null,
  label         text not null,
  amount        numeric not null default 0,
  start_date    date not null,
  end_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.employee_compensation_items enable row level security;

create policy "manage_own_employee_compensation_items"
  on public.employee_compensation_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists employee_compensation_items_employee_idx on public.employee_compensation_items(employee_id);
create index if not exists employee_compensation_items_key_idx on public.employee_compensation_items(employee_id, component_key);
