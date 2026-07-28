-- Fixes "new row violates row-level security policy for table
-- leave_applications" when an employee submits "Apply for leave" from
-- their own portal.
--
-- The original employee_apply_for_own_leave policy (migrate_employee_portal.sql)
-- checks the new row against two *raw* cross-table subqueries on the
-- employees table (itself RLS-protected):
--   employee_id in (select id from employees where auth_user_id = auth.uid() ...)
--   user_id = (select user_id from employees where id = employee_id)
-- In production this WITH CHECK can fail to resolve reliably even though
-- the same shape of subquery works fine in ordinary USING/select policies
-- -- the same underlying class of cross-table RLS fragility already found
-- and fixed for the approver-visibility policies in
-- migrate_approver_visibility_fix.sql. The fix there was to move the
-- lookup into a SECURITY DEFINER function, which runs with the function
-- owner's privileges and so never has to re-evaluate employees' own RLS
-- policies while it's in the middle of enforcing leave_applications'.
-- Applying that same proven pattern here.
--
-- Safe to run against the live project (drops and recreates one policy,
-- adds two small helper functions; no data changes).

create or replace function public.my_active_employee_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated' limit 1;
$$;

grant execute on function public.my_active_employee_id() to authenticated;

create or replace function public.employee_owner_user_id(p_employee_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select user_id from public.employees where id = p_employee_id;
$$;

grant execute on function public.employee_owner_user_id(uuid) to authenticated;

drop policy if exists "employee_apply_for_own_leave" on public.leave_applications;

create policy "employee_apply_for_own_leave"
  on public.leave_applications for insert
  to authenticated
  with check (
    status = 'pending'
    and employee_id = public.my_active_employee_id()
    and user_id = public.employee_owner_user_id(employee_id)
  );
