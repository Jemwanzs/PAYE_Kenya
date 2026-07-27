-- Run once in the Supabase SQL Editor for this project.

create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  trial_started_at   timestamptz not null default now(),
  access_expires_at  timestamptz,
  is_admin           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "select_own_profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Deliberately no insert/update/delete policy for the `authenticated` role.
-- Writes only ever happen via handle_new_user() (SECURITY DEFINER, below)
-- or the Paystack webhook using the service-role key, both of which bypass
-- RLS. This makes it structurally impossible for a signed-in user to grant
-- themselves access by calling supabase.from('profiles').update(...).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, trial_started_at)
  values (new.id, new.email, now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Employee directory + per-company payroll settings (see
-- migrate_employees.sql for the version-controlled description of these
-- tables; kept in sync here so a fresh install gets everything in one run).

create table public.payroll_settings (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null unique references auth.users(id) on delete cascade,
  nssf_rate                numeric not null default 6,
  nssf_upper_limit         numeric not null default 108000,
  shif_rate                numeric not null default 2.75,
  shif_minimum             numeric not null default 300,
  ahl_employee_rate        numeric not null default 1.5,
  ahl_employer_rate        numeric not null default 1.5,
  personal_relief          numeric not null default 2400,
  nita_levy                numeric not null default 50,
  insurance_relief_cap     numeric not null default 5000,
  telephone_threshold      numeric not null default 5000,
  meals_threshold          numeric not null default 5000,
  allowable_deduction_cap  numeric not null default 30000,
  per_diem_threshold       numeric not null default 10000,
  days_in_month            integer not null default 30,
  secondary_flat_rate      numeric not null default 35,
  contractor_wht_rate      numeric not null default 5,
  pwd_exemption            numeric not null default 150000,
  job_positions            jsonb not null default '[]'::jsonb,
  departments              jsonb not null default '[]'::jsonb,
  sub_departments          jsonb not null default '[]'::jsonb,
  employee_number_prefix       text not null default 'EMP',
  employee_number_padding      integer not null default 3,
  employee_number_include_year boolean not null default false,
  employee_number_include_month boolean not null default false,
  employee_number_next         integer not null default 1,
  employee_number_separator    text not null default '',
  business_name            text not null default '',
  business_logo_url        text,
  work_hours_per_day       numeric not null default 8,
  working_days             text[] not null default array['mon','tue','wed','thu','fri'],
  work_start_time          time not null default '08:00',
  break_minutes            integer not null default 60,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.payroll_settings enable row level security;

create policy "manage_own_payroll_settings"
  on public.payroll_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  first_name           text not null,
  last_name            text not null,
  email                text,
  phone                text,
  job_position         text,
  department           text,
  sub_department       text,
  employee_type        text not null default 'primary'
                         check (employee_type in ('primary', 'secondary', 'contractor', 'pwd')),
  contract_start_date  date,
  status               text not null default 'active'
                         check (status in ('active', 'terminated')),
  termination_date     date,
  termination_reason   text,
  compensation         jsonb not null default '{}'::jsonb,
  statutory_toggles    jsonb not null default '{}'::jsonb,
  employee_number      text,
  gender               text check (gender in ('male', 'female', 'other')),
  auth_user_id         uuid unique references auth.users(id) on delete set null,
  invited_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "manage_own_employees"
  on public.employees for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index employees_user_id_idx on public.employees(user_id);
create index employees_status_idx on public.employees(status);
create unique index employees_user_number_idx on public.employees(user_id, employee_number) where employee_number is not null;

-- Employee self-service portal login linkage (see
-- migrate_employee_portal.sql for the version-controlled description;
-- kept in sync here for fresh installs). employees is defined above this
-- point, so profiles.employee_id can only be added here, not inline in
-- the original create table profiles block at the top of this file.
alter table public.profiles
  add column if not exists role text not null default 'owner' check (role in ('owner', 'employee')),
  add column if not exists owner_user_id uuid references auth.users(id),
  add column if not exists employee_id uuid references public.employees(id);

create policy "employee_read_own_employee_record"
  on public.employees for select
  to authenticated
  using (auth_user_id = auth.uid() and status <> 'terminated');

-- Dated compensation entries (see migrate_compensation_history.sql for
-- the version-controlled description; kept in sync here for fresh
-- installs).

create table public.employee_compensation_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  component_key text not null,
  label         text not null,
  amount        numeric not null default 0,
  start_date    date not null,
  end_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.employee_compensation_items enable row level security;

create policy "manage_own_employee_compensation_items"
  on public.employee_compensation_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index employee_compensation_items_employee_idx on public.employee_compensation_items(employee_id);
create index employee_compensation_items_key_idx on public.employee_compensation_items(employee_id, component_key);

-- Atomically formats and reserves the next employee number for the
-- calling user (see migrate_employee_numbering.sql for the
-- version-controlled description; kept in sync here for fresh installs).
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

-- Payroll runs + payslips (see migrate_payroll_runs.sql for the
-- version-controlled description; kept in sync here for fresh installs).

create table public.payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  period_label   text not null,
  period_start   date not null,
  period_end     date not null,
  status         text not null default 'draft'
                  check (status in ('draft', 'approved', 'processed')),
  created_at     timestamptz not null default now(),
  approved_at    timestamptz,
  processed_at   timestamptz
);

alter table public.payroll_runs enable row level security;

create policy "manage_own_payroll_runs"
  on public.payroll_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index payroll_runs_user_id_idx on public.payroll_runs(user_id);

create table public.payslips (
  id                     uuid primary key default gen_random_uuid(),
  payroll_run_id         uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id            uuid not null references public.employees(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  employee_snapshot      jsonb not null,
  compensation_snapshot  jsonb not null,
  results                jsonb not null,
  is_final_dues          boolean not null default false,
  created_at             timestamptz not null default now()
);

alter table public.payslips enable row level security;

create policy "manage_own_payslips"
  on public.payslips for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- A plain cross-reference here (payslips policy queries payroll_runs,
-- payroll_runs policy queries payslips) is a circular RLS dependency --
-- Postgres detects it as infinite recursion and errors out on ANY select
-- against either table, for every role. This SECURITY DEFINER function
-- does the employee/payslip/run join itself; table owners bypass their
-- own tables' RLS by default (already relied on for next_employee_number()
-- above), so the function's internal query never re-triggers either
-- table's policies, breaking the cycle instead of relocating it.
-- Restricted to approved/processed runs -- a draft run's figures can still
-- change before approval, so it must never be shown to the employee it
-- belongs to.
create or replace function public.employee_visible_payroll_run_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct p.payroll_run_id
  from public.payslips p
  join public.employees e on e.id = p.employee_id
  join public.payroll_runs r on r.id = p.payroll_run_id
  where e.auth_user_id = auth.uid()
    and e.status <> 'terminated'
    and r.status in ('approved', 'processed');
$$;

grant execute on function public.employee_visible_payroll_run_ids() to authenticated;

create policy "employee_read_own_payslips"
  on public.payslips for select
  to authenticated
  using (payroll_run_id in (select public.employee_visible_payroll_run_ids()));

create policy "employee_read_own_payroll_runs"
  on public.payroll_runs for select
  to authenticated
  using (id in (select public.employee_visible_payroll_run_ids()));

create index payslips_run_idx on public.payslips(payroll_run_id);
create index payslips_employee_idx on public.payslips(employee_id);

-- Leave management (see migrate_leave_management.sql for the
-- version-controlled description; kept in sync here for fresh installs).

create table public.leave_types (
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

create policy "employee_read_own_business_leave_types"
  on public.leave_types for select
  to authenticated
  using (user_id in (select user_id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create index leave_types_user_id_idx on public.leave_types(user_id);

create table public.public_holidays (
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

create policy "employee_read_own_business_holidays"
  on public.public_holidays for select
  to authenticated
  using (user_id in (select user_id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create unique index public_holidays_user_date_idx on public.public_holidays(user_id, holiday_date);

create table public.leave_applications (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  employee_id          uuid not null references public.employees(id) on delete cascade,
  leave_type_id        uuid not null references public.leave_types(id) on delete restrict,
  start_date           date not null,
  end_date             date not null,
  is_partial_day       boolean not null default false,
  partial_hours        numeric,
  partial_start_time   time,
  partial_end_time     time,
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

create policy "employee_read_own_leave_applications"
  on public.leave_applications for select
  to authenticated
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

-- An employee can only ever create a pending application for themselves,
-- under their own employer's user_id -- never approve/reject (no update
-- policy is granted to employees at all).
create policy "employee_apply_for_own_leave"
  on public.leave_applications for insert
  to authenticated
  with check (
    status = 'pending'
    and employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated')
    and user_id = (select user_id from public.employees where id = employee_id)
  );

create index leave_applications_user_id_idx on public.leave_applications(user_id);
create index leave_applications_employee_idx on public.leave_applications(employee_id);
create index leave_applications_type_idx on public.leave_applications(leave_type_id);
create index leave_applications_status_idx on public.leave_applications(status);

-- Manual leave balance adjustments (see
-- migrate_leave_balance_adjustments.sql for the version-controlled
-- description; kept in sync here for fresh installs).

create table public.leave_balance_adjustments (
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

create policy "employee_read_own_leave_adjustments"
  on public.leave_balance_adjustments for select
  to authenticated
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create index leave_balance_adjustments_employee_idx on public.leave_balance_adjustments(employee_id);
create index leave_balance_adjustments_type_idx on public.leave_balance_adjustments(leave_type_id);

-- payroll_settings is created earlier in this file (before employees
-- exists), so this employee-scoped read policy for it can only be added
-- here, once public.employees is available to reference.
create policy "employee_read_own_business_settings"
  on public.payroll_settings for select
  to authenticated
  using (user_id in (select user_id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

-- Business logo storage (see migrate_business_logo.sql for the
-- version-controlled description; kept in sync here for fresh installs).

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do nothing;

create policy "business_logos_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'business-logos');

create policy "business_logos_owner_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_logos_owner_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_logos_owner_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Multi-approver approval workflows for payroll runs and leave
-- applications (see migrate_approval_workflows.sql for the
-- version-controlled description; kept in sync here for fresh installs).
-- Never introduces a new payroll_runs.status/leave_applications.status
-- value -- a workflow is a parallel tracking layer that flips the
-- existing 'approved' value once every required approver has signed off.
-- Every employee-facing policy below routes through `employees` only,
-- never cross-referencing these tables to each other, to avoid repeating
-- the circular-RLS bug fixed in migrate_employee_portal_rls_fix.sql.

create table public.approval_workflows (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  action_type  text not null check (action_type in ('payroll_run', 'leave_application')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, action_type)
);

alter table public.approval_workflows enable row level security;

create policy "manage_own_approval_workflows"
  on public.approval_workflows for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.approval_workflow_approvers (
  id           uuid primary key default gen_random_uuid(),
  workflow_id  uuid not null references public.approval_workflows(id) on delete cascade,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (workflow_id, employee_id)
);

alter table public.approval_workflow_approvers enable row level security;

create policy "manage_own_approval_workflow_approvers"
  on public.approval_workflow_approvers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.approval_actions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  workflow_id   uuid not null references public.approval_workflows(id) on delete cascade,
  action_type   text not null check (action_type in ('payroll_run', 'leave_application')),
  record_id     uuid not null,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  decision      text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  comment       text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.approval_actions enable row level security;

create policy "manage_own_approval_actions"
  on public.approval_actions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "approver_read_own_approval_actions"
  on public.approval_actions for select
  to authenticated
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create index approval_actions_record_idx on public.approval_actions(action_type, record_id);
create index approval_actions_employee_idx on public.approval_actions(employee_id);

create table public.notifications (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  recipient_employee_id uuid not null references public.employees(id) on delete cascade,
  title                 text not null,
  body                  text,
  link_type             text check (link_type in ('payroll_run', 'leave_application')),
  link_id               uuid,
  is_read               boolean not null default false,
  created_at            timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "recipient_read_own_notifications"
  on public.notifications for select
  to authenticated
  using (recipient_employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create policy "recipient_update_own_notifications"
  on public.notifications for update
  to authenticated
  using (recipient_employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'))
  with check (recipient_employee_id in (select id from public.employees where auth_user_id = auth.uid() and status <> 'terminated'));

create index notifications_recipient_idx on public.notifications(recipient_employee_id, is_read);

-- Internal helper -- NOT granted to `authenticated`. Trusts
-- p_owner_user_id completely, so it must only ever be reached from
-- another SECURITY DEFINER function that has already verified the caller
-- owns the record in question.
create or replace function public._create_approval_actions(p_action_type text, p_record_id uuid, p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workflow_id uuid;
begin
  select id into v_workflow_id
  from public.approval_workflows
  where user_id = p_owner_user_id and action_type = p_action_type and is_active
  limit 1;

  if v_workflow_id is null then
    return;
  end if;

  if exists (select 1 from public.approval_actions where action_type = p_action_type and record_id = p_record_id) then
    return;
  end if;

  insert into public.approval_actions (user_id, workflow_id, action_type, record_id, employee_id)
  select p_owner_user_id, v_workflow_id, p_action_type, p_record_id, wa.employee_id
  from public.approval_workflow_approvers wa
  where wa.workflow_id = v_workflow_id;

  insert into public.notifications (user_id, recipient_employee_id, title, link_type, link_id)
  select
    p_owner_user_id,
    wa.employee_id,
    case when p_action_type = 'payroll_run' then 'Payroll run awaiting your approval' else 'Leave application awaiting your approval' end,
    p_action_type,
    p_record_id
  from public.approval_workflow_approvers wa
  where wa.workflow_id = v_workflow_id;
end;
$$;

create or replace function public.submit_for_approval(p_action_type text, p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid := auth.uid();
  v_owns boolean;
begin
  if p_action_type = 'payroll_run' then
    select exists(select 1 from public.payroll_runs where id = p_record_id and user_id = v_owner_user_id and status = 'draft') into v_owns;
  elsif p_action_type = 'leave_application' then
    select exists(select 1 from public.leave_applications where id = p_record_id and user_id = v_owner_user_id) into v_owns;
  else
    raise exception 'Invalid action_type';
  end if;

  if not v_owns then
    raise exception 'Not authorized to submit this record for approval';
  end if;

  perform public._create_approval_actions(p_action_type, p_record_id, v_owner_user_id);
end;
$$;

grant execute on function public.submit_for_approval(text, uuid) to authenticated;

create or replace function public.handle_leave_application_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._create_approval_actions('leave_application', new.id, new.user_id);
  return new;
end;
$$;

create trigger on_leave_application_created
  after insert on public.leave_applications
  for each row execute procedure public.handle_leave_application_submitted();

create or replace function public.record_approval_decision(p_action_id uuid, p_decision text, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.approval_actions%rowtype;
  v_employee_id uuid;
  v_all_approved boolean;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  select id into v_employee_id from public.employees where auth_user_id = auth.uid() and status <> 'terminated';
  if v_employee_id is null then
    raise exception 'Not authorized';
  end if;

  select * into v_action from public.approval_actions where id = p_action_id and employee_id = v_employee_id;
  if not found then
    raise exception 'Approval action not found or not yours';
  end if;

  if v_action.decision <> 'pending' then
    raise exception 'This approval has already been decided';
  end if;

  update public.approval_actions
  set decision = p_decision, comment = p_comment, decided_at = now()
  where id = p_action_id;

  if p_decision = 'rejected' then
    if v_action.action_type = 'leave_application' then
      update public.leave_applications
      set status = 'rejected', decision_comment = p_comment, decided_at = now()
      where id = v_action.record_id;
    end if;
    return;
  end if;

  select not exists (
    select 1 from public.approval_actions
    where action_type = v_action.action_type and record_id = v_action.record_id and decision <> 'approved'
  ) into v_all_approved;

  if v_all_approved then
    if v_action.action_type = 'leave_application' then
      update public.leave_applications
      set status = 'approved', decided_at = now()
      where id = v_action.record_id;
    elsif v_action.action_type = 'payroll_run' then
      update public.payroll_runs
      set status = 'approved', approved_at = now()
      where id = v_action.record_id;
    end if;
  end if;
end;
$$;

grant execute on function public.record_approval_decision(uuid, text, text) to authenticated;
