-- Leave management: leave types (with eligibility/accrual rules), leave
-- applications (pending/approved/rejected), public holidays, and the two
-- small columns leave rules need on existing tables. Safe to run against
-- the live project (additive only).

alter table public.employees
  add column if not exists gender text check (gender in ('male', 'female', 'other'));

alter table public.payroll_settings
  add column if not exists work_hours_per_day numeric not null default 8;

create table if not exists public.leave_types (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  name                        text not null,
  annual_days                 numeric not null default 0,
  accrual_method              text not null default 'immediate'
                               check (accrual_method in ('immediate', 'monthly')),
  notice_period_days          integer not null default 0,
  max_carry_forward           numeric not null default 0,
  allow_negative_balance      boolean not null default false,
  allow_partial_day           boolean not null default false,
  requires_documentation      boolean not null default false,
  effective_start_date        date,
  -- { genders: [], employee_types: [], departments: [], job_positions: [],
  --   specific_employee_ids: [] } — empty array on a dimension means "no
  --   restriction on that dimension"; a listed employee id is always
  --   eligible regardless of the other filters.
  eligibility                 jsonb not null default '{}'::jsonb,
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.leave_types enable row level security;

create policy "manage_own_leave_types"
  on public.leave_types for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists leave_types_user_id_idx on public.leave_types(user_id);

create table if not exists public.public_holidays (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  holiday_date  date not null,
  created_at    timestamptz not null default now()
);

alter table public.public_holidays enable row level security;

create policy "manage_own_public_holidays"
  on public.public_holidays for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create unique index if not exists public_holidays_user_date_idx on public.public_holidays(user_id, holiday_date);

create table if not exists public.leave_applications (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  employee_id          uuid not null references public.employees(id) on delete cascade,
  leave_type_id        uuid not null references public.leave_types(id) on delete restrict,
  start_date           date not null,
  end_date             date not null,
  is_partial_day       boolean not null default false,
  partial_hours        numeric,
  days_requested       numeric not null,
  reason               text,
  documentation_note   text,
  status               text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
  decision_comment     text,
  decided_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.leave_applications enable row level security;

create policy "manage_own_leave_applications"
  on public.leave_applications for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists leave_applications_user_id_idx on public.leave_applications(user_id);
create index if not exists leave_applications_employee_idx on public.leave_applications(employee_id);
create index if not exists leave_applications_type_idx on public.leave_applications(leave_type_id);
create index if not exists leave_applications_status_idx on public.leave_applications(status);
