-- Adds a company/business name, shown on the payroll muster roll and
-- other printed company documents. Safe to run against the live
-- project (additive only).

alter table public.payroll_settings
  add column if not exists business_name text not null default '';
