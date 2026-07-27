-- Multi-approver approval workflows for payroll runs and leave applications.
-- Lets the owner appoint 2+ employees (who already have portal logins) as
-- required approvers; every one of them must approve before the record
-- flips to 'approved', and an in-app notification tells each of them
-- something is waiting on them. Safe to run against the live project
-- (additive only).
--
-- Deliberate design choice carried through this whole file: this never
-- adds a new value to payroll_runs.status or leave_applications.status --
-- dozens of existing checks throughout the app key off those exact
-- enums. A workflow is a parallel tracking layer that, once every
-- required approver has signed off, flips the EXISTING status field to
-- the EXISTING 'approved' value.
--
-- Every employee-facing policy below routes through `employees` only
-- (auth_user_id = auth.uid()), never cross-referencing these new tables
-- to each other or back to payroll_runs/payslips -- the exact lesson from
-- migrate_employee_portal_rls_fix.sql, where two tables' policies
-- querying each other caused Postgres to detect infinite recursion and
-- error out on every query against either table, for every role.

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

-- An approver only ever reads their OWN action rows -- writes to `decision`
-- happen exclusively through record_approval_decision() below, never a
-- direct table update, so there's no separate employee update policy here.
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

-- No owner policy here by design -- notifications are only ever created by
-- the SECURITY DEFINER functions below (which bypass RLS as the table
-- owner) and only ever read by their intended recipient. The owner isn't
-- a notification recipient in this design; the "awaiting approval from"
-- lines added to the payroll/leave UI are how the owner sees what's
-- outstanding.
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

-- ---------------------------------------------------------------------
-- Internal helper -- NOT granted to `authenticated`. It trusts
-- p_owner_user_id completely (no ownership check of its own), so it must
-- only ever be reached from another SECURITY DEFINER function that has
-- already verified the caller owns the record in question -- never
-- callable directly by a client session.
-- ---------------------------------------------------------------------
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
    return; -- no active workflow for this action type -- nothing to do
  end if;

  -- Avoid double-submitting (resubmission, or the trigger firing on a
  -- row that already has actions somehow).
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

-- Owner-triggered: the new "Submit for approval" action on a draft
-- payroll run. Re-verifies ownership + record state itself (not just
-- trusting the caller), unlike the internal helper above.
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

-- Leave applications are already "submitted" the instant they're created
-- (by either the owner's or the employee portal's insert path) -- one
-- trigger covers both instead of duplicating the submit call in two UIs.
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

-- Approver-triggered: records one approver's decision and, only once
-- every required approver for that record has approved, flips the
-- record's own status to the pre-existing 'approved' value. A rejection
-- takes effect immediately (leave_applications has a 'rejected' status;
-- payroll_runs doesn't, so a rejected submission just stays 'draft' with
-- the rejection visible via this approval_actions row).
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
