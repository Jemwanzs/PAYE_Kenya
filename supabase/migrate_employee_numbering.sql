-- Adds a configurable, auto-assigned employee/payroll number.
-- Safe to run against the live project (additive only).

alter table public.payroll_settings
  add column if not exists employee_number_prefix        text not null default 'EMP',
  add column if not exists employee_number_padding        integer not null default 3,
  add column if not exists employee_number_include_year   boolean not null default false,
  add column if not exists employee_number_include_month  boolean not null default false,
  add column if not exists employee_number_next           integer not null default 1;

alter table public.employees
  add column if not exists employee_number text;

create unique index if not exists employees_user_number_idx
  on public.employees(user_id, employee_number)
  where employee_number is not null;

-- Atomically formats and reserves the next employee number for the
-- calling user, locking their payroll_settings row for the duration of
-- the call so concurrent "Add employee" submissions can never collide.
create or replace function public.next_employee_number()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  settings_row public.payroll_settings%rowtype;
  formatted text;
begin
  select * into settings_row
  from public.payroll_settings
  where user_id = auth.uid()
  for update;

  if not found then
    insert into public.payroll_settings (user_id)
    values (auth.uid())
    returning * into settings_row;
  end if;

  formatted := coalesce(settings_row.employee_number_prefix, '');
  if settings_row.employee_number_include_year then
    formatted := formatted || to_char(now(), 'YYYY');
  end if;
  if settings_row.employee_number_include_month then
    formatted := formatted || to_char(now(), 'MM');
  end if;
  formatted := formatted || lpad(settings_row.employee_number_next::text, greatest(coalesce(settings_row.employee_number_padding, 3), 1), '0');

  update public.payroll_settings
  set employee_number_next = settings_row.employee_number_next + 1
  where user_id = auth.uid();

  return formatted;
end;
$$;

grant execute on function public.next_employee_number() to authenticated;
