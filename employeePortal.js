import { supabase } from './auth.js';
import { printPayslip } from './payroll.js';
import {
  loadCoreLeaveData, computeLeaveBalanceBreakdown, countWorkingDays, findConflictingLeaveApplication, todayStr,
  derivedStatus, statusPillClass, statusLabel,
  employeesCache, leaveTypesCache, applicationsCache
} from './leave.js';

const { classificationLabels, money } = window.PayrollShared;

const payslipsError = document.getElementById('employeePortalPayslipsError');
const payslipsEmpty = document.getElementById('employeePortalPayslipsEmpty');
const payslipsTableBody = document.getElementById('employeePortalPayslipsTableBody');
const payslipsRefreshBtn = document.getElementById('employeePortalPayslipsRefreshBtn');
const detailsGrid = document.getElementById('employeePortalDetailsGrid');
const leaveError = document.getElementById('employeePortalLeaveError');
const leaveRefreshBtn = document.getElementById('employeePortalLeaveRefreshBtn');
const leaveBalances = document.getElementById('employeePortalLeaveBalances');
const applyForm = document.getElementById('employeePortalApplyForm');
const applyType = document.getElementById('employeePortalApplyType');
const applyStart = document.getElementById('employeePortalApplyStart');
const applyEnd = document.getElementById('employeePortalApplyEnd');
const applyReason = document.getElementById('employeePortalApplyReason');
const applyPreview = document.getElementById('employeePortalApplyPreview');
const applyError = document.getElementById('employeePortalApplyError');
const applySaveBtn = document.getElementById('employeePortalApplySaveBtn');
const applicationsEmpty = document.getElementById('employeePortalApplicationsEmpty');
const applicationsTableBody = document.getElementById('employeePortalApplicationsTableBody');

const notifyBtn = document.getElementById('employeePortalNotifyBtn');
const notifyMenu = document.getElementById('employeePortalNotifyMenu');
const notifyCount = document.getElementById('employeePortalNotifyCount');
const notifyEmpty = document.getElementById('employeePortalNotifyEmpty');
const notifyList = document.getElementById('employeePortalNotifyList');
const approvalsNavBtn = document.getElementById('employeePortalApprovalsNavBtn');
const approvalsError = document.getElementById('employeePortalApprovalsError');
const approvalsEmpty = document.getElementById('employeePortalApprovalsEmpty');
const approvalsList = document.getElementById('employeePortalApprovalsList');
const approvalsRefreshBtn = document.getElementById('employeePortalApprovalsRefreshBtn');
const leaveApprovalsNavBtn = document.getElementById('employeePortalLeaveApprovalsNavBtn');
const leaveApprovalsError = document.getElementById('employeePortalLeaveApprovalsError');
const leaveApprovalsEmpty = document.getElementById('employeePortalLeaveApprovalsEmpty');
const leaveApprovalsList = document.getElementById('employeePortalLeaveApprovalsList');
const leaveApprovalsRefreshBtn = document.getElementById('employeePortalLeaveApprovalsRefreshBtn');

let currentEmployee = null;
let isLeaveApprover = false;
let isPayrollApprover = false;

document.addEventListener('employee-portal:ready', event => {
  currentEmployee = event.detail.employee;
  renderDetails(currentEmployee);
  renderPayslips();
  checkApproverRoles();
  loadNotifications();
});

document.addEventListener('employee-portal:page', event => {
  if (event.detail.page === 'payslips') renderPayslips();
  if (event.detail.page === 'details') renderDetails(currentEmployee);
  if (event.detail.page === 'leave') renderLeaveTab();
  if (event.detail.page === 'leave-approvals') renderLeaveApprovalsTab();
  if (event.detail.page === 'approvals') renderApprovalsTab();
});

function renderDetails(employee) {
  if (!employee) return;
  const genderLabel = employee.gender ? employee.gender.charAt(0).toUpperCase() + employee.gender.slice(1) : '—';
  const fields = [
    ['First name', employee.first_name],
    ['Last name', employee.last_name],
    ['Email', employee.email || '—'],
    ['Phone', employee.phone || '—'],
    ['Gender', genderLabel],
    ['Job position', employee.job_position || '—'],
    ['Department', employee.department || '—'],
    ['Sub department', employee.sub_department || '—'],
    ['Employee type', classificationLabels[employee.employee_type] || employee.employee_type],
    ['Contract start date', employee.contract_start_date || '—']
  ];
  // Deliberately excludes employee.compensation/statutory_toggles -- pay
  // figures are only ever surfaced via the employee's own payslips, never
  // as a raw compensation-config screen.
  detailsGrid.innerHTML = fields.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
}

async function renderPayslips() {
  payslipsError.hidden = true;
  payslipsRefreshBtn.disabled = true;
  try {
    const { data: payslips, error } = await supabase.from('payslips').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const rows = payslips || [];

    const runIds = [...new Set(rows.map(p => p.payroll_run_id))];
    if (runIds.length) {
      const { data: runs, error: runsError } = await supabase.from('payroll_runs').select('id, period_label').in('id', runIds);
      if (runsError) throw runsError;
      const runById = new Map((runs || []).map(r => [r.id, r]));
      rows.forEach(p => { p.period_label = runById.get(p.payroll_run_id)?.period_label || ''; });
    }

    payslipsEmpty.hidden = rows.length > 0;
    payslipsTableBody.innerHTML = rows.map(p => `
      <tr>
        <td>${p.period_label || '—'}</td>
        <td>${money(p.results?.netPay || 0)}</td>
        <td><button type="button" class="ghost-button employee-portal-payslip-btn" data-id="${p.id}">View / Print</button></td>
      </tr>
    `).join('');
    payslipsTableBody.dataset.payslips = JSON.stringify(rows);
  } catch (err) {
    payslipsError.textContent = err.message || 'Could not load your payslips.';
    payslipsError.hidden = false;
  } finally {
    payslipsRefreshBtn.disabled = false;
  }
}

payslipsRefreshBtn.addEventListener('click', renderPayslips);

payslipsTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.employee-portal-payslip-btn');
  if (!btn) return;
  const rows = JSON.parse(payslipsTableBody.dataset.payslips || '[]');
  const payslip = rows.find(p => p.id === btn.dataset.id);
  if (payslip) printPayslip(payslip);
});

async function renderLeaveTab() {
  leaveError.hidden = true;
  leaveRefreshBtn.disabled = true;
  try {
    await loadCoreLeaveData({ force: true });

    // employeesCache can also contain applicant rows visible to this
    // employee via an approver-visibility policy (see auth.js's
    // renderEmployeePortal for the full explanation) -- currentEmployee
    // is the one explicitly, uniquely scoped to this session's own
    // auth_user_id, so it's the only safe way to identify "myself" here.
    const employee = currentEmployee;
    if (!employee) {
      leaveError.textContent = 'Could not load your leave data. Try refreshing, or contact your employer.';
      leaveError.hidden = false;
      return;
    }

    const asOf = todayStr();
    leaveBalances.innerHTML = leaveTypesCache.map(t => {
      const b = computeLeaveBalanceBreakdown(employee, t, asOf);
      return `<div><span>${t.name}</span><strong>${b.balance.toFixed(2)} day(s)</strong></div>`;
    }).join('');

    applyType.innerHTML = leaveTypesCache.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    updateApplyPreview();
    renderApplications(employee);
  } catch (err) {
    leaveError.textContent = err.message || 'Could not load your leave data.';
    leaveError.hidden = false;
  } finally {
    leaveRefreshBtn.disabled = false;
  }
}

leaveRefreshBtn.addEventListener('click', renderLeaveTab);

function renderApplications(employee) {
  const rows = applicationsCache
    .filter(a => a.employee_id === employee.id)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

  applicationsEmpty.hidden = rows.length > 0;
  applicationsTableBody.innerHTML = rows.map(a => {
    const type = leaveTypesCache.find(t => t.id === a.leave_type_id);
    const status = derivedStatus(a);
    return `
      <tr>
        <td>${type ? type.name : '—'}</td>
        <td>${a.start_date}</td>
        <td>${a.end_date}</td>
        <td>${Number(a.days_requested).toFixed(2)}</td>
        <td><span class="status-pill status-${statusPillClass[status]}">${statusLabel[status]}</span></td>
      </tr>
    `;
  }).join('');
}

function updateApplyPreview() {
  const employee = currentEmployee;
  const type = leaveTypesCache.find(t => t.id === applyType.value);
  if (!employee || !type || !applyStart.value || !applyEnd.value) {
    applyPreview.textContent = '';
    return;
  }
  const days = countWorkingDays(applyStart.value, applyEnd.value);
  const balanceBefore = computeLeaveBalanceBreakdown(employee, type, applyStart.value).balance;
  const balanceAfter = balanceBefore - days;
  applyPreview.textContent =
    `This request is ${days} working day(s). Current balance: ${balanceBefore.toFixed(2)} day(s). Balance after: ${balanceAfter.toFixed(2)} day(s)${type.allow_negative_balance ? '' : (balanceAfter < 0 ? ' — exceeds available balance' : '')}.`;
}

[applyType, applyStart, applyEnd].forEach(el => el.addEventListener('change', updateApplyPreview));

applyForm.addEventListener('submit', async event => {
  event.preventDefault();
  applyError.hidden = true;

  const employee = currentEmployee;
  const type = leaveTypesCache.find(t => t.id === applyType.value);
  if (!employee || !type || !applyStart.value || !applyEnd.value) {
    applyError.textContent = 'Leave type, start date, and end date are required.';
    applyError.hidden = false;
    return;
  }
  if (applyEnd.value < applyStart.value) {
    applyError.textContent = 'End date cannot be before start date.';
    applyError.hidden = false;
    return;
  }
  const conflict = findConflictingLeaveApplication(employee.id, applyStart.value, applyEnd.value);
  if (conflict) {
    const conflictType = leaveTypesCache.find(t => t.id === conflict.leave_type_id);
    applyError.textContent = `You already have a ${conflict.status} ${conflictType ? conflictType.name : 'leave'} request covering ${conflict.start_date}${conflict.end_date !== conflict.start_date ? ` to ${conflict.end_date}` : ''}.`;
    applyError.hidden = false;
    return;
  }
  const noticeDays = Math.ceil((new Date(`${applyStart.value}T00:00:00`) - new Date(`${todayStr()}T00:00:00`)) / 86400000);
  if (noticeDays < (type.notice_period_days || 0)) {
    applyError.textContent = `${type.name} requires at least ${type.notice_period_days} day(s) of notice.`;
    applyError.hidden = false;
    return;
  }

  const daysRequested = countWorkingDays(applyStart.value, applyEnd.value);

  applySaveBtn.disabled = true;
  try {
    const { error } = await supabase.from('leave_applications').insert({
      user_id: employee.user_id,
      employee_id: employee.id,
      leave_type_id: type.id,
      start_date: applyStart.value,
      end_date: applyEnd.value,
      days_requested: daysRequested,
      reason: applyReason.value.trim() || null,
      status: 'pending'
    });
    if (error) throw error;

    applyForm.reset();
    applyPreview.textContent = '';
    await loadCoreLeaveData({ force: true });
    renderApplications(employee);
  } catch (err) {
    applyError.textContent = err.message || 'Could not submit this application.';
    applyError.hidden = false;
  } finally {
    applySaveBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Approvals + notification inbox -- only relevant to the (usually small)
// subset of employees the owner has appointed as approvers in Settings >
// Approval workflows. Payroll approvals live in their own standalone
// portal tab (there's no "Payroll" tab in the portal for them to sit
// inside); leave approvals surface as a "For my approval" section right
// inside the Leave tab, next to everything else leave-related. Simple
// in-app inbox, populated on portal load and on demand -- no
// realtime/websocket infrastructure.
// ---------------------------------------------------------------------

async function checkApproverRoles() {
  if (!currentEmployee) return;
  const { data: approverRows } = await supabase.from('approval_workflow_approvers').select('workflow_id').eq('employee_id', currentEmployee.id);
  const workflowIds = [...new Set((approverRows || []).map(r => r.workflow_id))];

  let actionTypes = [];
  if (workflowIds.length) {
    const { data: workflows } = await supabase.from('approval_workflows').select('id, action_type').in('id', workflowIds);
    actionTypes = (workflows || []).map(w => w.action_type);
  }

  isPayrollApprover = actionTypes.includes('payroll_run');
  isLeaveApprover = actionTypes.includes('leave_application');
  approvalsNavBtn.hidden = !isPayrollApprover;
  leaveApprovalsNavBtn.hidden = !isLeaveApprover;
  await refreshApprovalBadges();
}

function setNavBadge(btn, count) {
  let badge = btn.querySelector('.nav-badge');
  if (!count) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'nav-badge';
    btn.appendChild(badge);
  }
  badge.textContent = count > 99 ? '99+' : String(count);
}

// The notification bell only reflects *unread* notifications -- it
// clears the moment a tab is opened, whether or not anything was
// actually decided. These badges instead reflect the true, persistent
// pending count straight from approval_actions, so an approver can't
// lose track of outstanding work just because they've already looked at
// it once. Refreshed whenever roles are (re)checked and after every
// tab render (covers both "just opened the tab" and "just decided
// something", since both paths call render*Tab()).
async function refreshApprovalBadges() {
  if (!isPayrollApprover && !isLeaveApprover) return;
  const { data } = await supabase.from('approval_actions').select('action_type').eq('decision', 'pending');
  const rows = data || [];
  setNavBadge(approvalsNavBtn, rows.filter(r => r.action_type === 'payroll_run').length);
  setNavBadge(leaveApprovalsNavBtn, rows.filter(r => r.action_type === 'leave_application').length);
}

async function loadNotifications() {
  const { data } = await supabase.from('notifications').select('*').eq('is_read', false).order('created_at', { ascending: false });
  const rows = data || [];
  notifyCount.hidden = rows.length === 0;
  notifyCount.textContent = String(rows.length);
  notifyEmpty.hidden = rows.length > 0;
  notifyList.innerHTML = rows.map(n => `
    <button type="button" class="notification-item" data-id="${n.id}" data-link-type="${n.link_type || ''}">
      ${n.title}
      <small>${new Date(n.created_at).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
    </button>
  `).join('');
}

function closeNotifyMenu() {
  notifyMenu.hidden = true;
  notifyBtn.setAttribute('aria-expanded', 'false');
}

notifyBtn.addEventListener('click', () => {
  const opening = notifyMenu.hidden;
  notifyMenu.hidden = !opening;
  notifyBtn.setAttribute('aria-expanded', String(opening));
});

document.addEventListener('click', event => {
  if (!notifyMenu.hidden && !event.target.closest('.notification-bell-wrap')) closeNotifyMenu();
});

notifyList.addEventListener('click', async event => {
  const btn = event.target.closest('.notification-item');
  if (!btn) return;
  closeNotifyMenu();
  await supabase.from('notifications').update({ is_read: true }).eq('id', btn.dataset.id);
  await loadNotifications();
  const targetPage = btn.dataset.linkType === 'leave_application' ? 'leave-approvals' : 'approvals';
  document.querySelector(`[data-portal-page="${targetPage}"]`)?.click();
});

// Shared by both the payroll-only Approvals tab and the leave-only "For
// my approval" section -- takes already-fetched-and-filtered
// approval_actions rows and builds the same card markup for either.
// Renders one card per approval_actions row. A still-pending row gets the
// actionable card (comment + Approve/Reject); an already-decided row
// (shown in the Leave approvals tab's full history, never in the
// Payroll approvals tab, which only ever fetches decision='pending')
// gets a read-only summary of what this approver decided, plus the
// application's own overall status -- since one approver's decision
// doesn't necessarily mean the whole thing is resolved yet if more than
// one approver is required.
async function buildApprovalItemsHtml(rows) {
  if (!rows.length) return '';

  const payrollIds = rows.filter(a => a.action_type === 'payroll_run').map(a => a.record_id);
  const leaveIds = rows.filter(a => a.action_type === 'leave_application').map(a => a.record_id);

  const [runsRes, appsRes, payslipsRes] = await Promise.all([
    payrollIds.length ? supabase.from('payroll_runs').select('id, period_label').in('id', payrollIds) : { data: [] },
    leaveIds.length ? supabase.from('leave_applications').select('id, employee_id, leave_type_id, start_date, end_date, days_requested, status').in('id', leaveIds) : { data: [] },
    // Requires approver_read_assigned_payroll_payslips (see
    // migrate_approver_payslip_visibility.sql) -- without it this comes
    // back empty and the payroll card falls back to just the period
    // label, same as before that migration is run.
    payrollIds.length ? supabase.from('payslips').select('payroll_run_id, employee_snapshot, results').in('payroll_run_id', payrollIds) : { data: [] }
  ]);
  const runById = new Map((runsRes.data || []).map(r => [r.id, r]));
  const apps = appsRes.data || [];
  const payslipsByRunId = new Map();
  (payslipsRes.data || []).forEach(p => {
    const list = payslipsByRunId.get(p.payroll_run_id) || [];
    list.push(p);
    payslipsByRunId.set(p.payroll_run_id, list);
  });

  const employeeIds = [...new Set(apps.map(a => a.employee_id))];
  const leaveTypeIds = [...new Set(apps.map(a => a.leave_type_id))];
  const [employeesRes, typesRes] = await Promise.all([
    employeeIds.length ? supabase.from('employees').select('id, first_name, last_name').in('id', employeeIds) : { data: [] },
    leaveTypeIds.length ? supabase.from('leave_types').select('id, name').in('id', leaveTypeIds) : { data: [] }
  ]);
  const employeeById = new Map((employeesRes.data || []).map(e => [e.id, e]));
  const typeById = new Map((typesRes.data || []).map(t => [t.id, t]));
  const appById = new Map(apps.map(a => [a.id, a]));

  return rows.map(action => {
    let summary = 'Record no longer available';
    let overallStatus = '';
    let breakdownHtml = '';
    if (action.action_type === 'payroll_run') {
      const run = runById.get(action.record_id);
      summary = run ? `Payroll run: ${run.period_label}` : summary;
      const payslips = payslipsByRunId.get(action.record_id) || [];
      if (payslips.length) {
        const totalNet = payslips.reduce((sum, p) => sum + (p.results?.netPay || 0), 0);
        const employeeRows = payslips.map(p =>
          `<li>${p.employee_snapshot.first_name} ${p.employee_snapshot.last_name} — ${money(p.results?.netPay || 0)}</li>`
        ).join('');
        breakdownHtml = `
          <p class="hint">${payslips.length} employee(s) &middot; Total net pay: ${money(totalNet)}</p>
          <details class="approval-payroll-detail">
            <summary>View employees</summary>
            <ul>${employeeRows}</ul>
          </details>
        `;
      }
    } else {
      const app = appById.get(action.record_id);
      if (app) {
        const emp = employeeById.get(app.employee_id);
        const type = typeById.get(app.leave_type_id);
        summary = `Leave: ${emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown'} — ${type ? type.name : 'Leave'}, ${app.start_date} to ${app.end_date} (${Number(app.days_requested).toFixed(2)} day(s))`;
        overallStatus = app.status;
      }
    }

    if (action.decision === 'pending') {
      return `
        <div class="approval-item" data-action-id="${action.id}">
          <p>${summary}</p>
          ${breakdownHtml}
          <textarea placeholder="Comment (optional for approve, recommended for reject)" rows="2"></textarea>
          <div class="auth-actions">
            <button type="button" class="primary-button approval-approve-btn" data-id="${action.id}">Approve</button>
            <button type="button" class="ghost-button approval-reject-btn" data-id="${action.id}">Reject</button>
          </div>
        </div>
      `;
    }

    const decidedDate = action.decided_at
      ? new Date(action.decided_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
      : '';
    const decisionPillClass = action.decision === 'approved' ? 'active' : 'terminated';
    const overallLabel = overallStatus ? overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1) : '';
    return `
      <div class="approval-item approval-item-decided" data-action-id="${action.id}">
        <p>${summary}</p>
        ${breakdownHtml}
        <p class="approval-decision-line">
          <span class="status-pill status-${decisionPillClass}">You ${action.decision}${decidedDate ? ` · ${decidedDate}` : ''}</span>
          ${overallLabel ? `<span class="hint">Overall: ${overallLabel}</span>` : ''}
        </p>
        ${action.comment ? `<p class="hint">&ldquo;${action.comment}&rdquo;</p>` : ''}
      </div>
    `;
  }).join('');
}

async function renderApprovalsTab() {
  approvalsError.hidden = true;
  approvalsRefreshBtn.disabled = true;
  try {
    const { data: actions, error } = await supabase.from('approval_actions').select('*').eq('decision', 'pending').eq('action_type', 'payroll_run').order('created_at', { ascending: true });
    if (error) throw error;
    const rows = actions || [];
    approvalsEmpty.hidden = rows.length > 0;
    approvalsList.innerHTML = await buildApprovalItemsHtml(rows);
    await refreshApprovalBadges();
  } catch (err) {
    approvalsError.textContent = err.message || 'Could not load approvals.';
    approvalsError.hidden = false;
  } finally {
    approvalsRefreshBtn.disabled = false;
  }
}

// Leave approvals tab shows the FULL history for this approver, not just
// what's still pending -- pending items sort first (most actionable),
// then already-decided ones most-recently-decided first.
async function renderLeaveApprovalsTab() {
  leaveApprovalsError.hidden = true;
  leaveApprovalsRefreshBtn.disabled = true;
  try {
    const { data: actions, error } = await supabase.from('approval_actions').select('*').eq('action_type', 'leave_application').order('created_at', { ascending: true });
    if (error) throw error;
    const rows = (actions || []).sort((a, b) => {
      if (a.decision === 'pending' && b.decision !== 'pending') return -1;
      if (a.decision !== 'pending' && b.decision === 'pending') return 1;
      if (a.decision !== 'pending' && b.decision !== 'pending') return new Date(b.decided_at) - new Date(a.decided_at);
      return 0;
    });
    leaveApprovalsEmpty.hidden = rows.length > 0;
    leaveApprovalsList.innerHTML = await buildApprovalItemsHtml(rows);
    await refreshApprovalBadges();
  } catch (err) {
    leaveApprovalsError.textContent = err.message || 'Could not load approvals.';
    leaveApprovalsError.hidden = false;
  } finally {
    leaveApprovalsRefreshBtn.disabled = false;
  }
}

approvalsRefreshBtn.addEventListener('click', renderApprovalsTab);
leaveApprovalsRefreshBtn.addEventListener('click', renderLeaveApprovalsTab);

function wireApprovalDecisions(container, errorEl, onDecided) {
  container.addEventListener('click', async event => {
    const btn = event.target.closest('.approval-approve-btn, .approval-reject-btn');
    if (!btn) return;
    const item = btn.closest('.approval-item');
    const comment = item.querySelector('textarea').value.trim() || null;
    const decision = btn.classList.contains('approval-approve-btn') ? 'approved' : 'rejected';

    errorEl.hidden = true;
    item.querySelectorAll('button').forEach(b => { b.disabled = true; });
    try {
      const { error } = await supabase.rpc('record_approval_decision', {
        p_action_id: btn.dataset.id,
        p_decision: decision,
        p_comment: comment
      });
      if (error) throw error;
      await onDecided();
    } catch (err) {
      errorEl.textContent = err.message || 'Could not record your decision.';
      errorEl.hidden = false;
      item.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  });
}

wireApprovalDecisions(approvalsList, approvalsError, renderApprovalsTab);
wireApprovalDecisions(leaveApprovalsList, leaveApprovalsError, renderLeaveApprovalsTab);
