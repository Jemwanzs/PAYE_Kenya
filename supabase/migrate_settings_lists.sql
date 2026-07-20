-- Run once in the Supabase SQL Editor to add configurable dropdown lists
-- (job positions, departments, sub departments) to payroll_settings.

alter table public.payroll_settings
  add column if not exists job_positions jsonb not null default '[]'::jsonb;

alter table public.payroll_settings
  add column if not exists departments jsonb not null default '[]'::jsonb;

alter table public.payroll_settings
  add column if not exists sub_departments jsonb not null default '[]'::jsonb;
