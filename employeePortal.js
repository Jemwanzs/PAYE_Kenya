import { supabase } from './auth.js';
import { printPayslip } from './payroll.js';
import {
  loadCoreLeaveData, computeLeaveBalanceBreakdown, countWorkingDays, todayStr,
  derivedStatus, statusPillClass, statusLabel,
  employeesCache, leaveTypesCache, applicationsCache
} from './leave.js';

const { classificationLabels, money } = window.PayrollShared;

const payslipsEmpty = document.getElementById('employeePortalPayslipsEmpty');
const payslipsTableBody = document.getElementById('employeePortalPayslipsTableBody');
const detailsGrid = document.getElementById('employeePortalDetailsGrid');
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

let currentEmployee = null;
let leaveDataLoaded = false;

document.addEventListener('employee-portal:ready', event => {
  currentEmployee = event.detail.employee;
  leaveDataLoaded = false;
  renderDetails(currentEmployee);
  renderPayslips();
});

document.addEventListener('employee-portal:page', event => {
  if (event.detail.page === 'payslips') renderPayslips();
  if (event.detail.page === 'details') renderDetails(currentEmployee);
  if (event.detail.page === 'leave') renderLeaveTab();
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
  const { data: payslips } = await supabase.from('payslips').select('*').order('created_at', { ascending: false });
  const rows = payslips || [];

  const runIds = [...new Set(rows.map(p => p.payroll_run_id))];
  const { data: runs } = runIds.length
    ? await supabase.from('payroll_runs').select('id, period_label').in('id', runIds)
    : { data: [] };
  const runById = new Map((runs || []).map(r => [r.id, r]));
  rows.forEach(p => { p.period_label = runById.get(p.payroll_run_id)?.period_label || ''; });

  payslipsEmpty.hidden = rows.length > 0;
  payslipsTableBody.innerHTML = rows.map(p => `
    <tr>
      <td>${p.period_label || '—'}</td>
      <td>${money(p.results?.netPay || 0)}</td>
      <td><button type="button" class="ghost-button employee-portal-payslip-btn" data-id="${p.id}">View / Print</button></td>
    </tr>
  `).join('');
  payslipsTableBody.dataset.payslips = JSON.stringify(rows);
}

payslipsTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.employee-portal-payslip-btn');
  if (!btn) return;
  const rows = JSON.parse(payslipsTableBody.dataset.payslips || '[]');
  const payslip = rows.find(p => p.id === btn.dataset.id);
  if (payslip) printPayslip(payslip);
});

async function renderLeaveTab() {
  if (!leaveDataLoaded) {
    await loadCoreLeaveData({ force: true });
    leaveDataLoaded = true;
  }

  // RLS scopes employeesCache to just this employee's own row.
  const employee = employeesCache[0];
  if (!employee) return;

  const asOf = todayStr();
  leaveBalances.innerHTML = leaveTypesCache.map(t => {
    const b = computeLeaveBalanceBreakdown(employee, t, asOf);
    return `<div><span>${t.name}</span><strong>${b.balance.toFixed(2)} day(s)</strong></div>`;
  }).join('');

  applyType.innerHTML = leaveTypesCache.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  updateApplyPreview();
  renderApplications(employee);
}

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
  const employee = employeesCache[0];
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

  const employee = employeesCache[0];
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
