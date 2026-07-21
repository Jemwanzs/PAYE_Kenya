-- Company working schedule: which days count as working days (so
-- weekends can be anything, not just hardcoded Sat/Sun), plus the
-- start time and break length that pair with the existing
-- work_hours_per_day to describe a full working day. Used by the
-- leave calendar/weekend detection and partial-day hour math.
-- Safe to run against the live project (additive only).

alter table public.payroll_settings
  add column if not exists working_days text[] not null default array['mon','tue','wed','thu','fri'],
  add column if not exists work_start_time time not null default '08:00',
  add column if not exists break_minutes integer not null default 60;
