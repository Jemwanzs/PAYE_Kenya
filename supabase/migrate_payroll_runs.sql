-- Run once in the Supabase SQL Editor to add payroll run + payslip tables
-- (Phase 2 of the employee/payroll system).

create table public.payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  period_label   text not null,
  period_start   date not null,
  period_end     date not null,
  status         text not null default 'draft'
                  check (status in ('draft', 'approved', 'processed')),
  created_at     timestamptz not null default now(),
  approved_at    timestamptz,
  processed_at   timestamptz
);

alter table public.payroll_runs enable row level security;

create policy "manage_own_payroll_runs"
  on public.payroll_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index payroll_runs_user_id_idx on public.payroll_runs(user_id);

create table public.payslips (
  id                     uuid primary key default gen_random_uuid(),
  payroll_run_id         uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id            uuid not null references public.employees(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  -- Frozen at run time so a payslip stays accurate even if the employee's
  -- name/job details or compensation are edited afterward.
  employee_snapshot      jsonb not null,
  compensation_snapshot  jsonb not null,
  -- Full computePayroll() output (grossPay, taxablePay, paye, netPay,
  -- nssfEmployee, shif, ahlEmployee, employerPension, nitaLevy, etc.)
  results                jsonb not null,
  is_final_dues          boolean not null default false,
  created_at             timestamptz not null default now()
);

alter table public.payslips enable row level security;

create policy "manage_own_payslips"
  on public.payslips for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index payslips_run_idx on public.payslips(payroll_run_id);
create index payslips_employee_idx on public.payslips(employee_id);
