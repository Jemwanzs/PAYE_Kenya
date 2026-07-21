import { supabase } from './auth.js';

const { toNumber } = window.PayrollShared;

// ---------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------

const leaveTabButtons = [...document.querySelectorAll('.leave-tab-btn')];
const leaveViews = {
  applications: document.getElementById('leaveApplicationsView'),
  types: document.getElementById('leaveTypesView'),
  calendar: document.getElementById('leaveCalendarView'),
  holidays: document.getElementById('leaveHolidaysView'),
  balances: document.getElementById('leaveBalancesView')
};
const leaveApplyView = document.getElementById('leaveApplyView');
const leaveTypeFormView = document.getElementById('leaveTypeFormView');

const applyLeaveBtn = document.getElementById('applyLeaveBtn');
const leaveApplyTitle = document.getElementById('leaveApplyTitle');
const leaveApplyBackBtn = document.getElementById('leaveApplyBackBtn');
const leaveApplyError = document.getElementById('leaveApplyError');
const leaveApplyEmployee = document.getElementById('leaveApplyEmployee');
const leaveApplyType = document.getElementById('leaveApplyType');
const leaveApplyStart = document.getElementById('leaveApplyStart');
const leaveApplyEnd = document.getElementById('leaveApplyEnd');
const leaveApplyPartialRow = document.getElementById('leaveApplyPartialRow');
const leaveApplyIsPartial = document.getElementById('leaveApplyIsPartial');
const leaveApplyHours = document.getElementById('leaveApplyHours');
const leaveApplyReason = document.getElementById('leaveApplyReason');
const leaveApplyDocRow = document.getElementById('leaveApplyDocRow');
const leaveApplyDoc = document.getElementById('leaveApplyDoc');
const leaveApplyBalanceHint = document.getElementById('leaveApplyBalanceHint');
const leaveApplySaveBtn = document.getElementById('leaveApplySaveBtn');

const leaveApplicationsError = document.getElementById('leaveApplicationsError');
const leaveAnalyticsDept = document.getElementById('leaveAnalyticsDept');
const leaveAnalyticsSubDept = document.getElementById('leaveAnalyticsSubDept');
const leaveAnalyticsFrom = document.getElementById('leaveAnalyticsFrom');
const leaveAnalyticsTo = document.getElementById('leaveAnalyticsTo');
const leaveAnalyticsSummary = document.getElementById('leaveAnalyticsSummary');
const leaveAnalyticsBreakdown = document.getElementById('leaveAnalyticsBreakdown');
const appStatusFilterButtons = [...document.querySelectorAll('[data-app-status-filter]')];
const leaveApplicationsSearch = document.getElementById('leaveApplicationsSearch');
const leaveApplicationsEmptyState = document.getElementById('leaveApplicationsEmptyState');
const leaveApplicationsTableBody = document.getElementById('leaveApplicationsTableBody');

const addLeaveTypeBtn = document.getElementById('addLeaveTypeBtn');
const leaveTypesEmptyState = document.getElementById('leaveTypesEmptyState');
const leaveTypesTableBody = document.getElementById('leaveTypesTableBody');

const leaveTypeFormTitle = document.getElementById('leaveTypeFormTitle');
const leaveTypeFormBackBtn = document.getElementById('leaveTypeFormBackBtn');
const leaveTypeFormError = document.getElementById('leaveTypeFormError');
const leaveTypeForm = document.getElementById('leaveTypeFormView');
const leaveTypeName = document.getElementById('leaveTypeName');
const leaveTypeAnnualDays = document.getElementById('leaveTypeAnnualDays');
const leaveTypeAccrualMethod = document.getElementById('leaveTypeAccrualMethod');
const leaveTypeEffectiveDate = document.getElementById('leaveTypeEffectiveDate');
const leaveTypeNoticeDays = document.getElementById('leaveTypeNoticeDays');
const leaveTypeMaxCarryForward = document.getElementById('leaveTypeMaxCarryForward');
const leaveTypeAllowNegative = document.getElementById('leaveTypeAllowNegative');
const leaveTypeAllowPartial = document.getElementById('leaveTypeAllowPartial');
const leaveTypeRequiresDoc = document.getElementById('leaveTypeRequiresDoc');
const leaveTypeIsActive = document.getElementById('leaveTypeIsActive');
const leaveTypeEligGender = document.getElementById('leaveTypeEligGender');
const leaveTypeEligEmployeeType = document.getElementById('leaveTypeEligEmployeeType');
const leaveTypeEligDepartment = document.getElementById('leaveTypeEligDepartment');
const leaveTypeEligJobPosition = document.getElementById('leaveTypeEligJobPosition');
const leaveTypeEligEmployee = document.getElementById('leaveTypeEligEmployee');

const leaveCalendarTitle = document.getElementById('leaveCalendarTitle');
const leaveCalendarPrevBtn = document.getElementById('leaveCalendarPrevBtn');
const leaveCalendarTodayBtn = document.getElementById('leaveCalendarTodayBtn');
const leaveCalendarNextBtn = document.getElementById('leaveCalendarNextBtn');
const leaveCalendarGrid = document.getElementById('leaveCalendarGrid');

const leaveHolidaysError = document.getElementById('leaveHolidaysError');
const leaveHolidayDate = document.getElementById('leaveHolidayDate');
const leaveHolidayName = document.getElementById('leaveHolidayName');
const addHolidayBtn = document.getElementById('addHolidayBtn');
const leaveHolidaySeedYear = document.getElementById('leaveHolidaySeedYear');
const seedHolidaysBtn = document.getElementById('seedHolidaysBtn');
const leaveHolidaysEmptyState = document.getElementById('leaveHolidaysEmptyState');
const leaveHolidaysTableBody = document.getElementById('leaveHolidaysTableBody');

const printLeaveBalancesBtn = document.getElementById('printLeaveBalancesBtn');
const leaveBalancesDept = document.getElementById('leaveBalancesDept');
const leaveBalancesSubDept = document.getElementById('leaveBalancesSubDept');
const leaveBalancesAsOf = document.getElementById('leaveBalancesAsOf');
const leaveBalancesSearch = document.getElementById('leaveBalancesSearch');
const leaveBalancesTableHead = document.getElementById('leaveBalancesTableHead');
const leaveBalancesTableBody = document.getElementById('leaveBalancesTableBody');

const leaveDecisionOverlay = document.getElementById('leaveDecisionOverlay');
const leaveDecisionCloseBtn = document.getElementById('leaveDecisionCloseBtn');
const leaveDecisionCancelBtn = document.getElementById('leaveDecisionCancelBtn');
const leaveDecisionForm = document.getElementById('leaveDecisionForm');
const leaveDecisionTitle = document.getElementById('leaveDecisionTitle');
const leaveDecisionComment = document.getElementById('leaveDecisionComment');
const leaveDecisionError = document.getElementById('leaveDecisionError');

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

let employeesCache = [];
let leaveTypesCache = [];
let holidaysCache = [];
let applicationsCache = [];
let settingsCache = null;
let leaveDataLoaded = false;

let editingLeaveTypeId = null;
let currentAppStatusFilter = 'all';
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let pendingDecision = null; // { applicationId, action: 'approved' | 'rejected' }

// ---------------------------------------------------------------------
// Small date helpers
// ---------------------------------------------------------------------

// Date -> "YYYY-MM-DD" using local calendar fields. Deliberately not
// toISOString() (which reports UTC): for a UTC+ timezone like Kenya's,
// toISOString() on a local midnight rolls back to the previous day,
// silently shifting every "as of today" / working-day calculation.
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function todayStr() {
  return toDateStr(new Date());
}

function isWeekend(dateStr) {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function isHoliday(dateStr) {
  return holidaysCache.some(h => h.holiday_date === dateStr);
}

function iterateDates(startStr, endStr) {
  const dates = [];
  let cur = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  while (cur <= end) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function countWorkingDays(startStr, endStr) {
  if (!startStr || !endStr || endStr < startStr) return 0;
  return iterateDates(startStr, endStr).filter(d => !isWeekend(d) && !isHoliday(d)).length;
}

function employeeName(employee) {
  return employee ? `${employee.first_name} ${employee.last_name}` : 'Unknown employee';
}

// ---------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------

function isEmployeeEligibleForType(employee, leaveType) {
  const elig = leaveType.eligibility || {};
  if ((elig.specific_employee_ids || []).includes(employee.id)) return true;
  if ((elig.genders || []).length && !elig.genders.includes(employee.gender)) return false;
  if ((elig.employee_types || []).length && !elig.employee_types.includes(employee.employee_type)) return false;
  if ((elig.departments || []).length && !elig.departments.includes(employee.department)) return false;
  if ((elig.job_positions || []).length && !elig.job_positions.includes(employee.job_position)) return false;
  return true;
}

function getEligibleLeaveTypesForEmployee(employee, forDateStr) {
  return leaveTypesCache.filter(lt => {
    if (!lt.is_active) return false;
    if (lt.effective_start_date && forDateStr && forDateStr < lt.effective_start_date) return false;
    return isEmployeeEligibleForType(employee, lt);
  });
}

// ---------------------------------------------------------------------
// Balance calculation — pure, parameterized by "as of" date so the same
// function drives the live balances table, the printed report, and any
// past-dated report (e.g. "as of 31 Dec last year").
// ---------------------------------------------------------------------

function leaveYearBounds(dateStr) {
  const year = Number(dateStr.slice(0, 4));
  return { start: `${year}-01-01`, end: `${year}-12-31`, year };
}

function monthsCreditedInYear(referenceStr, asOfStr) {
  const ref = new Date(`${referenceStr}T00:00:00`);
  const asOf = new Date(`${asOfStr}T00:00:00`);
  if (asOf < ref) return 0;
  const months = (asOf.getFullYear() - ref.getFullYear()) * 12 + (asOf.getMonth() - ref.getMonth()) + 1;
  return Math.max(0, months);
}

function entitlementForYear(employee, leaveType, yearStart, yearEnd, asOfStr) {
  const referenceStart = [yearStart, employee.contract_start_date, leaveType.effective_start_date]
    .filter(Boolean)
    .reduce((max, d) => (d > max ? d : max), yearStart);
  if (asOfStr < referenceStart) return 0;

  const annual = toNumber(leaveType.annual_days);
  if (leaveType.accrual_method === 'monthly') {
    const cappedAsOf = asOfStr < yearEnd ? asOfStr : yearEnd;
    const months = monthsCreditedInYear(referenceStart, cappedAsOf);
    return Math.min(annual, (annual / 12) * months);
  }
  return annual;
}

function usedDaysForYear(employeeId, leaveTypeId, yearStart, yearEnd, asOfStr) {
  const cappedEnd = asOfStr < yearEnd ? asOfStr : yearEnd;
  return applicationsCache
    .filter(a => a.employee_id === employeeId && a.leave_type_id === leaveTypeId && a.status === 'approved'
      && a.start_date >= yearStart && a.start_date <= cappedEnd)
    .reduce((sum, a) => sum + toNumber(a.days_requested), 0);
}

// depth caps carry-forward recursion at 10 leave years back — plenty for
// any realistic tenure, and entitlement/used both fall to 0 once the
// recursion runs past when the employee or leave type actually existed.
function computeLeaveBalance(employee, leaveType, asOfStr, depth = 0) {
  const { start: yearStart, end: yearEnd, year } = leaveYearBounds(asOfStr);
  const entitlement = entitlementForYear(employee, leaveType, yearStart, yearEnd, asOfStr);
  const used = usedDaysForYear(employee.id, leaveType.id, yearStart, yearEnd, asOfStr);

  let carryIn = 0;
  if (depth < 10) {
    const prevBalance = computeLeaveBalance(employee, leaveType, `${year - 1}-12-31`, depth + 1);
    carryIn = Math.max(0, Math.min(prevBalance, toNumber(leaveType.max_carry_forward)));
  }
  return entitlement + carryIn - used;
}

// ---------------------------------------------------------------------
// Sub-tab switching
// ---------------------------------------------------------------------

function showLeaveTab(tab) {
  leaveTabButtons.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.leaveTab === tab)));
  Object.entries(leaveViews).forEach(([key, el]) => { el.hidden = key !== tab; });
  leaveApplyView.hidden = true;
  leaveTypeFormView.hidden = true;

  if (tab === 'applications') renderApplicationsTable();
  if (tab === 'types') renderLeaveTypesTable();
  if (tab === 'calendar') renderCalendar();
  if (tab === 'holidays') renderHolidaysTable();
  if (tab === 'balances') renderBalancesTable();
}

leaveTabButtons.forEach(btn => {
  btn.addEventListener('click', () => showLeaveTab(btn.dataset.leaveTab));
});

// ---------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------

async function loadCoreLeaveData({ force = false } = {}) {
  if (leaveDataLoaded && !force) return;
  const [employeesRes, typesRes, holidaysRes, appsRes, settingsRes] = await Promise.all([
    supabase.from('employees').select('*').order('first_name'),
    supabase.from('leave_types').select('*').order('name'),
    supabase.from('public_holidays').select('*').order('holiday_date'),
    supabase.from('leave_applications').select('*').order('start_date', { ascending: false }),
    supabase.from('payroll_settings').select('*').maybeSingle()
  ]);
  employeesCache = employeesRes.data || [];
  leaveTypesCache = typesRes.data || [];
  holidaysCache = holidaysRes.data || [];
  applicationsCache = appsRes.data || [];
  settingsCache = settingsRes.data || null;
  leaveDataLoaded = true;
  populateDeptSelects();
}

function populateDeptSelects() {
  const departments = settingsCache?.departments || [];
  const subDepartments = settingsCache?.sub_departments || [];
  [leaveAnalyticsDept, leaveBalancesDept].forEach(select => {
    const current = select.value;
    select.innerHTML = '<option value="">All departments</option>' + departments.map(d => `<option value="${d}">${d}</option>`).join('');
    select.value = current;
  });
  [leaveAnalyticsSubDept, leaveBalancesSubDept].forEach(select => {
    const current = select.value;
    select.innerHTML = '<option value="">All sub departments</option>' + subDepartments.map(d => `<option value="${d}">${d}</option>`).join('');
    select.value = current;
  });
}

// ---------------------------------------------------------------------
// Applications: derived status, list rendering, search/filter
// ---------------------------------------------------------------------

function derivedStatus(app) {
  if (app.status === 'pending' || app.status === 'rejected') return app.status;
  return app.end_date < todayStr() ? 'completed' : 'approved';
}

const statusPillClass = { pending: 'terminated', approved: 'active', completed: 'active', rejected: 'terminated' };
const statusLabel = { pending: 'Pending', approved: 'Approved', completed: 'Completed', rejected: 'Rejected' };

function renderApplicationsTable() {
  const search = leaveApplicationsSearch.value.trim().toLowerCase();
  const rows = applicationsCache
    .map(app => ({ app, employee: employeesCache.find(e => e.id === app.employee_id), type: leaveTypesCache.find(t => t.id === app.leave_type_id) }))
    .filter(({ app }) => currentAppStatusFilter === 'all' || derivedStatus(app) === currentAppStatusFilter)
    .filter(({ employee }) => !search || employeeName(employee).toLowerCase().includes(search));

  leaveApplicationsEmptyState.hidden = rows.length > 0;
  leaveApplicationsEmptyState.textContent = 'No leave applications match this view.';

  leaveApplicationsTableBody.innerHTML = rows.map(({ app, employee, type }) => {
    const status = derivedStatus(app);
    const comment = app.decision_comment ? ` title="${app.decision_comment.replace(/"/g, '&quot;')}"` : '';
    const actions = app.status === 'pending'
      ? `<button type="button" class="ghost-button leave-approve-btn" data-id="${app.id}">Approve</button>
         <button type="button" class="ghost-button leave-reject-btn" data-id="${app.id}">Reject</button>`
      : '';
    return `
      <tr data-id="${app.id}">
        <td>${employeeName(employee)}</td>
        <td>${type ? type.name : 'Deleted leave type'}</td>
        <td>${app.start_date}</td>
        <td>${app.end_date}</td>
        <td>${app.days_requested}</td>
        <td><span class="status-pill status-${statusPillClass[status]}"${comment}>${statusLabel[status]}</span></td>
        <td>${actions}</td>
      </tr>
    `;
  }).join('');
}

appStatusFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentAppStatusFilter = btn.dataset.appStatusFilter;
    appStatusFilterButtons.forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    renderApplicationsTable();
  });
});
leaveApplicationsSearch.addEventListener('input', renderApplicationsTable);

leaveApplicationsTableBody.addEventListener('click', event => {
  const approveBtn = event.target.closest('.leave-approve-btn');
  const rejectBtn = event.target.closest('.leave-reject-btn');
  const btn = approveBtn || rejectBtn;
  if (!btn) return;
  pendingDecision = { applicationId: btn.dataset.id, action: approveBtn ? 'approved' : 'rejected' };
  leaveDecisionTitle.textContent = approveBtn ? 'Approve leave application' : 'Reject leave application';
  leaveDecisionComment.value = '';
  leaveDecisionError.hidden = true;
  leaveDecisionOverlay.hidden = false;
});

function closeDecisionOverlay() { leaveDecisionOverlay.hidden = true; pendingDecision = null; }
leaveDecisionCloseBtn.addEventListener('click', closeDecisionOverlay);
leaveDecisionCancelBtn.addEventListener('click', closeDecisionOverlay);

leaveDecisionForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!pendingDecision) return;
  const comment = leaveDecisionComment.value.trim();
  if (!comment) {
    leaveDecisionError.textContent = 'A comment is required to approve or reject an application.';
    leaveDecisionError.hidden = false;
    return;
  }

  const confirmBtn = document.getElementById('leaveDecisionConfirmBtn');
  confirmBtn.disabled = true;
  try {
    const { error } = await supabase.from('leave_applications').update({
      status: pendingDecision.action,
      decision_comment: comment,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', pendingDecision.applicationId);
    if (error) throw error;

    await loadCoreLeaveData({ force: true });
    renderApplicationsTable();
    closeDecisionOverlay();
  } catch (err) {
    leaveDecisionError.textContent = err.message || 'Could not record this decision.';
    leaveDecisionError.hidden = false;
  } finally {
    confirmBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------

function renderAnalytics() {
  const dept = leaveAnalyticsDept.value;
  const subDept = leaveAnalyticsSubDept.value;
  const from = leaveAnalyticsFrom.value;
  const to = leaveAnalyticsTo.value;

  const rows = applicationsCache
    .filter(a => a.status === 'approved')
    .map(a => ({ app: a, employee: employeesCache.find(e => e.id === a.employee_id), type: leaveTypesCache.find(t => t.id === a.leave_type_id) }))
    .filter(({ employee }) => employee)
    .filter(({ employee }) => !dept || employee.department === dept)
    .filter(({ employee }) => !subDept || employee.sub_department === subDept)
    .filter(({ app }) => !from || app.start_date >= from)
    .filter(({ app }) => !to || app.start_date <= to);

  const totalDays = rows.reduce((sum, r) => sum + toNumber(r.app.days_requested), 0);

  leaveAnalyticsSummary.innerHTML = `
    <div><span>Applications</span><strong>${rows.length}</strong></div>
    <div><span>Total days taken</span><strong>${totalDays}</strong></div>
  `;

  const byType = new Map();
  const byDept = new Map();
  rows.forEach(({ app, employee, type }) => {
    const typeName = type ? type.name : 'Unknown';
    byType.set(typeName, (byType.get(typeName) || 0) + toNumber(app.days_requested));
    const deptName = employee.department || 'Unassigned';
    byDept.set(deptName, (byDept.get(deptName) || 0) + toNumber(app.days_requested));
  });

  const listHtml = (map, label) => `
    <div class="breakdown-col">
      <h3>${label}</h3>
      ${[...map.entries()].length
        ? [...map.entries()].map(([k, v]) => `<div class="result-row"><span>${k}</span><strong>${v} day${v === 1 ? '' : 's'}</strong></div>`).join('')
        : '<p class="hint">No data for this filter.</p>'}
    </div>
  `;
  leaveAnalyticsBreakdown.innerHTML = `<div class="breakdown-columns">${listHtml(byType, 'By leave type')}${listHtml(byDept, 'By department')}</div>`;
}

[leaveAnalyticsDept, leaveAnalyticsSubDept, leaveAnalyticsFrom, leaveAnalyticsTo].forEach(el => {
  el.addEventListener('change', renderAnalytics);
});

// ---------------------------------------------------------------------
// Apply for leave
// ---------------------------------------------------------------------

applyLeaveBtn.addEventListener('click', () => {
  leaveApplyError.hidden = true;
  leaveApplyTitle.textContent = 'Apply for leave';
  leaveApplyView.reset();
  leaveApplyPartialRow.hidden = true;
  leaveApplyDocRow.hidden = true;
  leaveApplyBalanceHint.textContent = '';

  leaveApplyEmployee.innerHTML = '<option value="">— Select —</option>' +
    employeesCache.filter(e => e.status === 'active').map(e => `<option value="${e.id}">${employeeName(e)}</option>`).join('');
  leaveApplyType.innerHTML = '<option value="">— Select employee first —</option>';

  Object.entries(leaveViews).forEach(([, el]) => { el.hidden = true; });
  leaveTypeFormView.hidden = true;
  leaveApplyView.hidden = false;
});

leaveApplyBackBtn.addEventListener('click', () => showLeaveTab('applications'));

function refreshLeaveApplyTypeOptions() {
  const employee = employeesCache.find(e => e.id === leaveApplyEmployee.value);
  if (!employee) {
    leaveApplyType.innerHTML = '<option value="">— Select employee first —</option>';
    return;
  }
  const eligible = getEligibleLeaveTypesForEmployee(employee, leaveApplyStart.value || todayStr());
  leaveApplyType.innerHTML = eligible.length
    ? '<option value="">— Select —</option>' + eligible.map(t => `<option value="${t.id}">${t.name}</option>`).join('')
    : '<option value="">No eligible leave types for this employee</option>';
}

leaveApplyEmployee.addEventListener('change', () => {
  refreshLeaveApplyTypeOptions();
  updateLeaveApplyPreview();
});
leaveApplyStart.addEventListener('change', () => { refreshLeaveApplyTypeOptions(); updateLeaveApplyPreview(); });
leaveApplyEnd.addEventListener('change', updateLeaveApplyPreview);
leaveApplyIsPartial.addEventListener('change', updateLeaveApplyPreview);
leaveApplyHours.addEventListener('input', updateLeaveApplyPreview);

leaveApplyType.addEventListener('change', () => {
  const type = leaveTypesCache.find(t => t.id === leaveApplyType.value);
  leaveApplyPartialRow.hidden = !type?.allow_partial_day;
  leaveApplyDocRow.hidden = !type?.requires_documentation;
  if (!type?.allow_partial_day) leaveApplyIsPartial.checked = false;
  updateLeaveApplyPreview();
});

function updateLeaveApplyPreview() {
  const employee = employeesCache.find(e => e.id === leaveApplyEmployee.value);
  const type = leaveTypesCache.find(t => t.id === leaveApplyType.value);
  if (!employee || !type || !leaveApplyStart.value || !leaveApplyEnd.value) {
    leaveApplyBalanceHint.textContent = '';
    return;
  }
  const days = computeRequestedDays(type);
  const balanceBefore = computeLeaveBalance(employee, type, leaveApplyStart.value);
  const balanceAfter = balanceBefore - days;
  leaveApplyBalanceHint.textContent =
    `This request is ${days} day(s). Current balance: ${balanceBefore.toFixed(2)} day(s). Balance after: ${balanceAfter.toFixed(2)} day(s)${type.allow_negative_balance ? '' : (balanceAfter < 0 ? ' — exceeds available balance' : '')}.`;
}

function computeRequestedDays(type) {
  if (leaveApplyIsPartial.checked && type?.allow_partial_day) {
    const hours = toNumber(leaveApplyHours.value);
    const hoursPerDay = toNumber(settingsCache?.work_hours_per_day) || 8;
    return hoursPerDay > 0 ? Math.round((hours / hoursPerDay) * 100) / 100 : 0;
  }
  return countWorkingDays(leaveApplyStart.value, leaveApplyEnd.value);
}

leaveApplyView.addEventListener('submit', async event => {
  event.preventDefault();
  leaveApplyError.hidden = true;

  const employee = employeesCache.find(e => e.id === leaveApplyEmployee.value);
  const type = leaveTypesCache.find(t => t.id === leaveApplyType.value);

  if (!employee || !type || !leaveApplyStart.value || !leaveApplyEnd.value) {
    leaveApplyError.textContent = 'Employee, leave type, and both dates are required.';
    leaveApplyError.hidden = false;
    return;
  }
  if (leaveApplyEnd.value < leaveApplyStart.value) {
    leaveApplyError.textContent = 'End date must be on or after the start date.';
    leaveApplyError.hidden = false;
    return;
  }
  if (!isEmployeeEligibleForType(employee, type)) {
    leaveApplyError.textContent = `${employeeName(employee)} is not eligible for ${type.name} under its current rules.`;
    leaveApplyError.hidden = false;
    return;
  }
  const noticeDays = Math.ceil((new Date(`${leaveApplyStart.value}T00:00:00`) - new Date(`${todayStr()}T00:00:00`)) / 86400000);
  if (noticeDays < toNumber(type.notice_period_days)) {
    leaveApplyError.textContent = `${type.name} requires at least ${type.notice_period_days} day(s) of notice.`;
    leaveApplyError.hidden = false;
    return;
  }
  if (type.requires_documentation && !leaveApplyDoc.value.trim()) {
    leaveApplyError.textContent = `${type.name} requires supporting documentation details.`;
    leaveApplyError.hidden = false;
    return;
  }

  const days = computeRequestedDays(type);
  if (days <= 0) {
    leaveApplyError.textContent = 'This request works out to zero working days — check the dates and hours.';
    leaveApplyError.hidden = false;
    return;
  }
  if (!type.allow_negative_balance) {
    const balanceAfter = computeLeaveBalance(employee, type, leaveApplyStart.value) - days;
    if (balanceAfter < 0) {
      leaveApplyError.textContent = `This request would leave a negative balance, which ${type.name} does not allow.`;
      leaveApplyError.hidden = false;
      return;
    }
  }

  leaveApplySaveBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('leave_applications').insert({
      user_id: user.id,
      employee_id: employee.id,
      leave_type_id: type.id,
      start_date: leaveApplyStart.value,
      end_date: leaveApplyEnd.value,
      is_partial_day: leaveApplyIsPartial.checked && type.allow_partial_day,
      partial_hours: leaveApplyIsPartial.checked && type.allow_partial_day ? toNumber(leaveApplyHours.value) : null,
      days_requested: days,
      reason: leaveApplyReason.value.trim() || null,
      documentation_note: leaveApplyDoc.value.trim() || null,
      status: 'pending'
    });
    if (error) throw error;

    await loadCoreLeaveData({ force: true });
    showLeaveTab('applications');
  } catch (err) {
    leaveApplyError.textContent = err.message || 'Could not submit this application.';
    leaveApplyError.hidden = false;
  } finally {
    leaveApplySaveBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Leave Types
// ---------------------------------------------------------------------

function renderLeaveTypesTable() {
  leaveTypesEmptyState.hidden = leaveTypesCache.length > 0;
  leaveTypesTableBody.innerHTML = leaveTypesCache.map(t => `
    <tr data-id="${t.id}">
      <td>${t.name}</td>
      <td>${t.annual_days}</td>
      <td>${t.accrual_method === 'monthly' ? 'Monthly accrual' : 'Immediate'}</td>
      <td><span class="status-pill status-${t.is_active ? 'active' : 'terminated'}">${t.is_active ? 'Active' : 'Inactive'}</span></td>
      <td><button type="button" class="ghost-button leave-type-edit-btn" data-id="${t.id}">Edit</button></td>
    </tr>
  `).join('');
}

function checklistHtml(items, checkedValues, name) {
  return items.map(item => `
    <label><input type="checkbox" name="${name}" value="${item}" ${checkedValues.includes(item) ? 'checked' : ''}/> ${item}</label>
  `).join('') || '<p class="hint">None configured under Settings yet.</p>';
}

function populateLeaveTypeEligibilityLists(eligibility = {}) {
  const departments = settingsCache?.departments || [];
  const jobPositions = settingsCache?.job_positions || [];
  const activeEmployees = employeesCache.filter(e => e.status === 'active');

  leaveTypeEligDepartment.innerHTML = checklistHtml(departments, eligibility.departments || [], 'eligDept');
  leaveTypeEligJobPosition.innerHTML = checklistHtml(jobPositions, eligibility.job_positions || [], 'eligJob');
  leaveTypeEligEmployee.innerHTML = activeEmployees.map(e => `
    <label><input type="checkbox" name="eligEmployee" value="${e.id}" ${(eligibility.specific_employee_ids || []).includes(e.id) ? 'checked' : ''}/> ${employeeName(e)}</label>
  `).join('') || '<p class="hint">No active employees yet.</p>';

  [...leaveTypeEligGender.querySelectorAll('input')].forEach(cb => { cb.checked = (eligibility.genders || []).includes(cb.value); });
  [...leaveTypeEligEmployeeType.querySelectorAll('input')].forEach(cb => { cb.checked = (eligibility.employee_types || []).includes(cb.value); });
}

function resetLeaveTypeForm() {
  editingLeaveTypeId = null;
  leaveTypeFormTitle.textContent = 'Add leave type';
  leaveTypeFormError.hidden = true;
  leaveTypeForm.reset();
  leaveTypeIsActive.checked = true;
  populateLeaveTypeEligibilityLists({});
}

function populateLeaveTypeForm(leaveType) {
  editingLeaveTypeId = leaveType.id;
  leaveTypeFormTitle.textContent = leaveType.name;
  leaveTypeFormError.hidden = true;
  leaveTypeName.value = leaveType.name || '';
  leaveTypeAnnualDays.value = leaveType.annual_days ?? 0;
  leaveTypeAccrualMethod.value = leaveType.accrual_method || 'immediate';
  leaveTypeEffectiveDate.value = leaveType.effective_start_date || '';
  leaveTypeNoticeDays.value = leaveType.notice_period_days ?? 0;
  leaveTypeMaxCarryForward.value = leaveType.max_carry_forward ?? 0;
  leaveTypeAllowNegative.checked = !!leaveType.allow_negative_balance;
  leaveTypeAllowPartial.checked = !!leaveType.allow_partial_day;
  leaveTypeRequiresDoc.checked = !!leaveType.requires_documentation;
  leaveTypeIsActive.checked = !!leaveType.is_active;
  populateLeaveTypeEligibilityLists(leaveType.eligibility || {});
}

function showLeaveTypeForm() {
  Object.entries(leaveViews).forEach(([, el]) => { el.hidden = true; });
  leaveApplyView.hidden = true;
  leaveTypeFormView.hidden = false;
}

addLeaveTypeBtn.addEventListener('click', () => {
  resetLeaveTypeForm();
  showLeaveTypeForm();
});

leaveTypesTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.leave-type-edit-btn');
  if (!btn) return;
  const leaveType = leaveTypesCache.find(t => t.id === btn.dataset.id);
  if (!leaveType) return;
  populateLeaveTypeForm(leaveType);
  showLeaveTypeForm();
});

leaveTypeFormBackBtn.addEventListener('click', () => showLeaveTab('types'));

function checkedValues(container) {
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
}

leaveTypeForm.addEventListener('submit', async event => {
  event.preventDefault();
  leaveTypeFormError.hidden = true;

  const name = leaveTypeName.value.trim();
  if (!name) {
    leaveTypeFormError.textContent = 'Name is required.';
    leaveTypeFormError.hidden = false;
    return;
  }

  const payload = {
    name,
    annual_days: toNumber(leaveTypeAnnualDays.value),
    accrual_method: leaveTypeAccrualMethod.value,
    effective_start_date: leaveTypeEffectiveDate.value || null,
    notice_period_days: Math.round(toNumber(leaveTypeNoticeDays.value)),
    max_carry_forward: toNumber(leaveTypeMaxCarryForward.value),
    allow_negative_balance: leaveTypeAllowNegative.checked,
    allow_partial_day: leaveTypeAllowPartial.checked,
    requires_documentation: leaveTypeRequiresDoc.checked,
    is_active: leaveTypeIsActive.checked,
    eligibility: {
      genders: checkedValues(leaveTypeEligGender),
      employee_types: checkedValues(leaveTypeEligEmployeeType),
      departments: checkedValues(leaveTypeEligDepartment),
      job_positions: checkedValues(leaveTypeEligJobPosition),
      specific_employee_ids: checkedValues(leaveTypeEligEmployee)
    },
    updated_at: new Date().toISOString()
  };

  const saveBtn = document.getElementById('leaveTypeSaveBtn');
  saveBtn.disabled = true;
  try {
    if (editingLeaveTypeId) {
      const { error } = await supabase.from('leave_types').update(payload).eq('id', editingLeaveTypeId);
      if (error) throw error;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('leave_types').insert({ ...payload, user_id: user.id });
      if (error) throw error;
    }
    await loadCoreLeaveData({ force: true });
    showLeaveTab('types');
  } catch (err) {
    leaveTypeFormError.textContent = err.message || 'Could not save this leave type.';
    leaveTypeFormError.hidden = false;
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Public holidays
// ---------------------------------------------------------------------

function renderHolidaysTable() {
  leaveHolidaySeedYear.value = leaveHolidaySeedYear.value || String(new Date().getFullYear());
  leaveHolidaysEmptyState.hidden = holidaysCache.length > 0;
  leaveHolidaysTableBody.innerHTML = [...holidaysCache]
    .sort((a, b) => (a.holiday_date < b.holiday_date ? -1 : 1))
    .map(h => `
      <tr data-id="${h.id}">
        <td>${h.holiday_date}</td>
        <td>${h.name}</td>
        <td><button type="button" class="ghost-button leave-holiday-delete-btn" data-id="${h.id}">Delete</button></td>
      </tr>
    `).join('');
}

addHolidayBtn.addEventListener('click', async () => {
  leaveHolidaysError.hidden = true;
  if (!leaveHolidayDate.value || !leaveHolidayName.value.trim()) {
    leaveHolidaysError.textContent = 'Date and name are both required.';
    leaveHolidaysError.hidden = false;
    return;
  }
  addHolidayBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('public_holidays').insert({
      user_id: user.id, holiday_date: leaveHolidayDate.value, name: leaveHolidayName.value.trim()
    });
    if (error) throw error;
    leaveHolidayDate.value = '';
    leaveHolidayName.value = '';
    await loadCoreLeaveData({ force: true });
    renderHolidaysTable();
  } catch (err) {
    leaveHolidaysError.textContent = err.message || 'Could not add this holiday (it may already exist).';
    leaveHolidaysError.hidden = false;
  } finally {
    addHolidayBtn.disabled = false;
  }
});

leaveHolidaysTableBody.addEventListener('click', async event => {
  const btn = event.target.closest('.leave-holiday-delete-btn');
  if (!btn) return;
  btn.disabled = true;
  const { error } = await supabase.from('public_holidays').delete().eq('id', btn.dataset.id);
  if (!error) {
    await loadCoreLeaveData({ force: true });
    renderHolidaysTable();
  } else {
    btn.disabled = false;
  }
});

// Standard Meeus/Jones/Butcher Gregorian Easter algorithm — deterministic
// maths, not a fact that can go stale, unlike hardcoding future dates.
function computeEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Fixed-date statutory holidays and the two Easter-linked ones (Good
// Friday, Easter Monday) — deliberately excludes Eid ul-Fitr/Eid ul-Adha
// since their Kenyan-observed dates follow the lunar calendar and shift
// each year; those must be added manually once gazetted.
function commonKenyanHolidays(year) {
  const easter = computeEasterSunday(year);
  return [
    { name: 'New Year\'s Day', date: `${year}-01-01` },
    { name: 'Good Friday', date: toIsoDate(addDaysUtc(easter, -2)) },
    { name: 'Easter Monday', date: toIsoDate(addDaysUtc(easter, 1)) },
    { name: 'Labour Day', date: `${year}-05-01` },
    { name: 'Madaraka Day', date: `${year}-06-01` },
    { name: 'Mashujaa Day', date: `${year}-10-20` },
    { name: 'Jamhuri Day', date: `${year}-12-12` },
    { name: 'Christmas Day', date: `${year}-12-25` },
    { name: 'Boxing Day', date: `${year}-12-26` }
  ];
}

seedHolidaysBtn.addEventListener('click', async () => {
  leaveHolidaysError.hidden = true;
  const year = Math.round(toNumber(leaveHolidaySeedYear.value)) || new Date().getFullYear();
  const candidates = commonKenyanHolidays(year).filter(h => !holidaysCache.some(existing => existing.holiday_date === h.date));
  if (!candidates.length) {
    leaveHolidaysError.textContent = 'All common holidays for this year are already on the list.';
    leaveHolidaysError.hidden = false;
    return;
  }
  seedHolidaysBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('public_holidays').insert(
      candidates.map(h => ({ user_id: user.id, holiday_date: h.date, name: h.name }))
    );
    if (error) throw error;
    await loadCoreLeaveData({ force: true });
    renderHolidaysTable();
  } catch (err) {
    leaveHolidaysError.textContent = err.message || 'Could not seed holidays.';
    leaveHolidaysError.hidden = false;
  } finally {
    seedHolidaysBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function employeesOnLeave(dateStr) {
  return applicationsCache
    .filter(a => a.status === 'approved' && a.start_date <= dateStr && a.end_date >= dateStr)
    .map(a => employeesCache.find(e => e.id === a.employee_id))
    .filter(Boolean);
}

function renderCalendar() {
  leaveCalendarTitle.textContent = `${MONTH_NAMES[calendarMonth]} ${calendarYear}`;

  const firstOfMonth = new Date(calendarYear, calendarMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push('<div class="leave-calendar-cell is-empty"></div>');

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const holiday = holidaysCache.find(h => h.holiday_date === dateStr);
    const weekend = isWeekend(dateStr);
    const onLeave = employeesOnLeave(dateStr);
    const names = onLeave.slice(0, 2).map(employeeName).join(', ');
    const more = onLeave.length > 2 ? ` +${onLeave.length - 2} more` : '';

    cells.push(`
      <div class="leave-calendar-cell${weekend ? ' is-weekend' : ''}${holiday ? ' is-holiday' : ''}${dateStr === todayStr() ? ' is-today' : ''}">
        <span class="leave-calendar-date">${day}</span>
        ${holiday ? `<span class="leave-calendar-holiday" title="${holiday.name}">${holiday.name}</span>` : ''}
        ${onLeave.length ? `<span class="leave-calendar-onleave" title="${onLeave.map(employeeName).join(', ')}">${names}${more}</span>` : ''}
      </div>
    `);
  }

  leaveCalendarGrid.innerHTML =
    WEEKDAY_NAMES.map(d => `<div class="leave-calendar-headcell">${d}</div>`).join('') + cells.join('');
}

leaveCalendarPrevBtn.addEventListener('click', () => {
  calendarMonth -= 1;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear -= 1; }
  renderCalendar();
});
leaveCalendarNextBtn.addEventListener('click', () => {
  calendarMonth += 1;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear += 1; }
  renderCalendar();
});
leaveCalendarTodayBtn.addEventListener('click', () => {
  const now = new Date();
  calendarMonth = now.getMonth();
  calendarYear = now.getFullYear();
  renderCalendar();
});

// ---------------------------------------------------------------------
// Leave balances
// ---------------------------------------------------------------------

function filteredBalanceEmployees() {
  const dept = leaveBalancesDept.value;
  const subDept = leaveBalancesSubDept.value;
  const search = leaveBalancesSearch.value.trim().toLowerCase();
  return employeesCache
    .filter(e => e.status === 'active')
    .filter(e => !dept || e.department === dept)
    .filter(e => !subDept || e.sub_department === subDept)
    .filter(e => !search || employeeName(e).toLowerCase().includes(search));
}

function renderBalancesTable() {
  if (!leaveBalancesAsOf.value) leaveBalancesAsOf.value = todayStr();
  const asOf = leaveBalancesAsOf.value;
  const employees = filteredBalanceEmployees();

  leaveBalancesTableHead.innerHTML = `<th>Employee</th><th>Job position</th><th>Department</th>${leaveTypesCache.map(t => `<th>${t.name}</th>`).join('')}`;

  leaveBalancesTableBody.innerHTML = employees.map(emp => `
    <tr>
      <td>${employeeName(emp)}</td>
      <td>${emp.job_position || '—'}</td>
      <td>${emp.department || '—'}</td>
      ${leaveTypesCache.map(t => `<td>${computeLeaveBalance(emp, t, asOf).toFixed(2)}</td>`).join('')}
    </tr>
  `).join('') || `<tr><td colspan="${3 + leaveTypesCache.length}">No employees match this filter.</td></tr>`;
}

[leaveBalancesDept, leaveBalancesSubDept, leaveBalancesAsOf].forEach(el => el.addEventListener('change', renderBalancesTable));
leaveBalancesSearch.addEventListener('input', renderBalancesTable);

function buildLeaveBalancesPrintHtml() {
  const asOf = leaveBalancesAsOf.value || todayStr();
  const employees = filteredBalanceEmployees();
  const businessName = settingsCache?.business_name || 'Business name not set';
  const deptLabel = leaveBalancesDept.value || 'All departments';
  const subDeptLabel = leaveBalancesSubDept.value || 'All sub departments';

  const headerCells = ['Employee', 'Job Position', 'Department', ...leaveTypesCache.map(t => t.name)];
  const rows = employees.map(emp => [
    employeeName(emp), emp.job_position || '—', emp.department || '—',
    ...leaveTypesCache.map(t => computeLeaveBalance(emp, t, asOf).toFixed(2))
  ]);
  const totalsRow = ['GRAND TOTAL', '', '', ...leaveTypesCache.map((t, idx) =>
    rows.reduce((sum, r) => sum + (parseFloat(r[3 + idx]) || 0), 0).toFixed(2))];

  return `
    <div class="muster-page">
      <div class="muster-header">
        <div class="muster-business-name">${businessName}</div>
        <div class="muster-cycle">Leave Balances — ${deptLabel} · ${subDeptLabel}</div>
        <div class="muster-meta">As of ${asOf} &middot; Generated: ${new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </div>
      <table class="muster-table">
        <thead><tr>${headerCells.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(r => `<tr>${r.map((c, idx) => `<td class="${idx < 3 ? 'muster-left' : 'muster-right'}">${c}</td>`).join('')}</tr>`).join('')}
          <tr class="muster-totals-row">${totalsRow.map((c, idx) => `<td class="${idx < 3 ? 'muster-left muster-bold' : 'muster-right muster-bold'}">${c}</td>`).join('')}</tr>
        </tbody>
      </table>
      <div class="muster-footer">
        <div class="muster-prepared">Prepared by &mdash; ________________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date: __________________</div>
        <div class="muster-page-number">Page 01</div>
      </div>
    </div>
  `;
}

printLeaveBalancesBtn.addEventListener('click', () => {
  const wrap = document.getElementById('leaveBalancePrintWrap');
  wrap.innerHTML = buildLeaveBalancesPrintHtml();

  const pageStyle = document.createElement('style');
  pageStyle.textContent = '@page { size: landscape; margin: 10mm; }';
  document.head.appendChild(pageStyle);

  wrap.hidden = false;
  document.body.classList.add('printing-leave-balances');
  window.print();
  document.body.classList.remove('printing-leave-balances');
  wrap.hidden = true;
  pageStyle.remove();
});

// ---------------------------------------------------------------------
// Page entry point
// ---------------------------------------------------------------------

document.addEventListener('app:page', async event => {
  if (event.detail.page !== 'leave') return;
  try {
    await loadCoreLeaveData();
  } catch (err) {
    leaveApplicationsError.textContent = err.message || 'Could not load leave data.';
    leaveApplicationsError.hidden = false;
  }
  showLeaveTab('applications');
});
