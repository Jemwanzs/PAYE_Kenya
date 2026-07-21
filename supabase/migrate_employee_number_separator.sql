-- Adds an optional separator (e.g. "-" or "/") between the prefix/
-- year/month/number segments of an auto-assigned employee number, and
-- updates next_employee_number() to use it. Safe to run against the
-- live project (additive only).

alter table public.payroll_settings
  add column if not exists employee_number_separator text not null default '';

create or replace function public.next_employee_number()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  settings_row public.payroll_settings%rowtype;
  parts text[] := '{}';
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

  if coalesce(settings_row.employee_number_prefix, '') <> '' then
    parts := array_append(parts, settings_row.employee_number_prefix);
  end if;
  if settings_row.employee_number_include_year then
    parts := array_append(parts, to_char(now(), 'YYYY'));
  end if;
  if settings_row.employee_number_include_month then
    parts := array_append(parts, to_char(now(), 'MM'));
  end if;
  parts := array_append(parts, lpad(settings_row.employee_number_next::text, greatest(coalesce(settings_row.employee_number_padding, 3), 1), '0'));

  formatted := array_to_string(parts, coalesce(settings_row.employee_number_separator, ''));

  update public.payroll_settings
  set employee_number_next = settings_row.employee_number_next + 1
  where user_id = auth.uid();

  return formatted;
end;
$$;

grant execute on function public.next_employee_number() to authenticated;
