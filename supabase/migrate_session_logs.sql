-- Cross-tenant login log for the platform admin: one row per login
-- (owner or employee, any business), recording when, what
-- browser/device, and location if the browser granted it. Never blocks
-- a login on a declined/unavailable location -- browsers can't actually
-- be forced to share it (only prompted), and blocking a paying
-- customer's login over a declined permission would be its own support
-- and liability problem.
--
-- Deliberately denormalized (email/role/business_name/employee_name
-- snapshotted onto the row itself) rather than joined at read time:
-- profiles/payroll_settings/employees are all "manage_own"-only RLS, so
-- the admin reading session_logs later has no way to join across to
-- another tenant's profile or business name -- the only table they're
-- ever granted cross-tenant SELECT on is this one.
--
-- Safe to run against the live project (additive only).

create table public.session_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  email           text,
  role            text,
  business_name   text,
  employee_name   text,
  user_agent      text,
  location_status text not null default 'unavailable' check (location_status in ('granted', 'denied', 'unavailable')),
  latitude        numeric,
  longitude       numeric,
  created_at      timestamptz not null default now()
);

alter table public.session_logs enable row level security;

-- Any signed-in user (owner or employee, any tenant) can write their
-- own login row -- this is what makes the log cross-tenant in the first
-- place -- but only ever their own (auth.uid() = user_id), never on
-- behalf of someone else.
create policy "insert_own_session_log"
  on public.session_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Only the platform admin (profiles.is_admin) can read *any* row here.
-- No update/delete policy at all for anyone -- an append-only log that
-- not even the admin can edit or delete through the app is what makes
-- it trustworthy as a log.
create policy "admin_read_all_session_logs"
  on public.session_logs for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin));

create index session_logs_created_at_idx on public.session_logs(created_at desc);

-- Resolves "who is this, and which business are they part of" from the
-- caller's own session, entirely server-side -- an employee session has
-- no RLS access to their owner's profiles/payroll_settings row, so this
-- has to run as SECURITY DEFINER to look it up on their behalf. Always
-- returns exactly one row of plain scalar subqueries (never a join that
-- could come back empty if payroll_settings/employees rows don't exist
-- yet), so the client never has to handle a "no identity" case.
create or replace function public.session_log_identity()
returns table(role text, business_name text, employee_name text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
  v_owner_user_id uuid;
begin
  select p.role, coalesce(p.owner_user_id, p.id) into v_role, v_owner_user_id
  from public.profiles p where p.id = auth.uid();

  return query
    select
      coalesce(v_role, 'owner'),
      coalesce((select ps.business_name from public.payroll_settings ps where ps.user_id = v_owner_user_id), ''),
      coalesce((select e.first_name || ' ' || e.last_name from public.employees e where e.auth_user_id = auth.uid()), '');
end;
$$;

grant execute on function public.session_log_identity() to authenticated;
