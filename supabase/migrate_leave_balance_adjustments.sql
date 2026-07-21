-- Manual leave balance adjustments (opening balances, ad-hoc HR
-- corrections). Each row is a dated +/- delta that feeds into
-- computeLeaveBalance() alongside entitlement/carry-forward/usage, so
-- an adjustment only affects "as of" reports on or after its date.
-- Safe to run against the live project (additive only).

create table if not exists public.leave_balance_adjustments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  leave_type_id   uuid not null references public.leave_types(id) on delete cascade,
  adjustment_date date not null,
  days            numeric not null,
  reason          text,
  created_at      timestamptz not null default now()
);

alter table public.leave_balance_adjustments enable row level security;

create policy "manage_own_leave_balance_adjustments"
  on public.leave_balance_adjustments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists leave_balance_adjustments_employee_idx on public.leave_balance_adjustments(employee_id);
create index if not exists leave_balance_adjustments_type_idx on public.leave_balance_adjustments(leave_type_id);
