-- Records the actual from/to clock times for a partial-day leave
-- application, alongside the already-computed partial_hours duration.
-- Safe to run against the live project (additive only).

alter table public.leave_applications
  add column if not exists partial_start_time time,
  add column if not exists partial_end_time time;
