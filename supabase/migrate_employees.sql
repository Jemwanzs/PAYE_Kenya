-- Run once in the Supabase SQL Editor to add the employee directory and
-- per-company payroll settings tables (Phase 1 of the employee/payroll
-- system). Unlike `profiles`, these tables are directly managed by the
-- owning user from the client, so RLS grants full CRUD on own rows.

create table public.payroll_settings (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references auth.users(id) on delete cascade,
  nssf_rate                numeric not null default 6,
  nssf_upper_limit         numeric not null default 108000,
  shif_rate                numeric not null default 2.75,
  shif_minimum             numeric not null default 300,
  ahl_employee_rate        numeric not null default 1.5,
  ahl_employer_rate        numeric not null default 1.5,
  personal_relief          numeric not null default 2400,
  nita_levy                numeric not null default 50,
  insurance_relief_cap     numeric not null default 5000,
  telephone_threshold      numeric not null default 5000,
  meals_threshold          numeric not null default 5000,
  allowable_deduction_cap  numeric not null default 30000,
  per_diem_threshold       numeric not null default 10000,
  days_in_month            integer not null default 30,
  secondary_flat_rate      numeric not null default 35,
  contractor_wht_rate      numeric not null default 5,
  pwd_exemption            numeric not null default 150000,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.payroll_settings enable row level security;

create policy "manage_own_payroll_settings"
  on public.payroll_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  first_name           text not null,
  last_name            text not null,
  email                text,
  phone                text,
  job_position         text,
  department           text,
  sub_department       text,
  employee_type        text not null default 'primary'
                         check (employee_type in ('primary', 'secondary', 'contractor', 'pwd')),
  contract_start_date  date,
  status               text not null default 'active'
                         check (status in ('active', 'terminated')),
  termination_date     date,
  termination_reason   text,
  -- Keyed by the same field ids the calculator uses (basicPay,
  -- regularAllowances, ... employeePensionRate, lifeInsurance,
  -- educationInsurance, otherDeductions) so the shared calculation engine
  -- can consume it directly without a translation layer.
  compensation         jsonb not null default '{}'::jsonb,
  -- { regularAllowances: { nssf: true, shif: true, ahl: true }, ... }
  statutory_toggles    jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "manage_own_employees"
  on public.employees for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index employees_user_id_idx on public.employees(user_id);
create index employees_status_idx on public.employees(status);
