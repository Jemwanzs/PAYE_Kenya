-- Super-admin business/user management: lets the platform admin see
-- every business that has signed up, block/unblock a whole business
-- (its owner login, cascading to every one of its employees' portal
-- sessions), or block/unblock a single employee's portal access without
-- touching the owner's own account.
--
-- Blocking takes effect the next time the affected session actually
-- re-checks access (next login, next page load/refresh, or the next
-- time the existing 10-minute idle timer fires and re-renders) -- there
-- is no realtime channel in this app, so an already-open tab isn't
-- force-closed the instant a block is applied. Same characteristic the
-- existing "terminated" employee status already has.
--
-- Deliberately routed through narrow SECURITY DEFINER RPCs rather than
-- broad "is_admin can select/update any row" RLS policies on
-- profiles/payroll_settings/employees -- each function has its own
-- explicit is_admin check *inside* it (required: a SECURITY DEFINER
-- function bypasses RLS entirely, so without this check any
-- authenticated caller could read/write every tenant's data). This
-- keeps the admin surface to exactly the columns/actions intended,
-- auditable in one place, rather than opening the underlying tables
-- themselves to cross-tenant admin access.
--
-- Safe to run against the live project (additive only).

alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

alter table public.employees
  add column if not exists portal_blocked boolean not null default false;

-- One row per business (profiles.role = 'owner'), with its business
-- name and active employee count. Returns zero rows for a non-admin
-- caller rather than raising -- lets the client treat "not admin" and
-- "no businesses yet" the same way (an empty table), same pattern as
-- RLS-scoped queries elsewhere in this app.
create or replace function public.admin_list_businesses()
returns table(
  user_id uuid,
  email text,
  business_name text,
  is_admin boolean,
  is_blocked boolean,
  trial_started_at timestamptz,
  access_expires_at timestamptz,
  employee_count bigint,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.email,
    ps.business_name,
    p.is_admin,
    p.is_blocked,
    p.trial_started_at,
    p.access_expires_at,
    (select count(*) from public.employees e where e.user_id = p.id and e.status <> 'terminated'),
    p.created_at
  from public.profiles p
  left join public.payroll_settings ps on ps.user_id = p.id
  where p.role = 'owner'
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
  order by p.created_at desc;
$$;

grant execute on function public.admin_list_businesses() to authenticated;

-- Employees for one specific business, for the admin's drill-down view.
create or replace function public.admin_list_employees(p_owner_user_id uuid)
returns table(
  id uuid,
  first_name text,
  last_name text,
  email text,
  status text,
  auth_user_id uuid,
  portal_blocked boolean,
  employee_number text
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.first_name, e.last_name, e.email, e.status, e.auth_user_id, e.portal_blocked, e.employee_number
  from public.employees e
  where e.user_id = p_owner_user_id
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.is_admin)
  order by e.first_name;
$$;

grant execute on function public.admin_list_employees(uuid) to authenticated;

-- Blocks/unblocks a whole business (its owner's own login). Refuses to
-- let an admin block their own account -- a self-lockout would need a
-- second admin (or direct DB access) to undo.
create or replace function public.admin_set_business_blocked(p_user_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot block your own account';
  end if;
  update public.profiles set is_blocked = p_blocked, updated_at = now() where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_business_blocked(uuid, boolean) to authenticated;

-- Blocks/unblocks one employee's own portal access, independent of the
-- owner's account and independent of employees.status (which carries
-- payroll/termination meaning this deliberately doesn't touch).
create or replace function public.admin_set_employee_blocked(p_employee_id uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not authorized';
  end if;
  update public.employees set portal_blocked = p_blocked, updated_at = now() where id = p_employee_id;
end;
$$;

grant execute on function public.admin_set_employee_blocked(uuid, boolean) to authenticated;

-- Called by an *employee's own* portal session to find out whether
-- their business's owner has been blocked -- they have no RLS access to
-- the owner's profiles row otherwise. Blocking a business this way
-- cascades to every one of its employees automatically, without the
-- admin having to separately block each one.
create or replace function public.is_my_owner_blocked()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select p.is_blocked
    from public.profiles p
    join public.employees e on e.user_id = p.id
    where e.auth_user_id = auth.uid()
  ), false);
$$;

grant execute on function public.is_my_owner_blocked() to authenticated;
