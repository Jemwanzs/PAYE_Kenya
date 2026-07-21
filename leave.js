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
const leaveApplyEndRow = document.getElementById('leaveApplyEndRow');
const leaveApplyEnd = document.getElementById('leaveApplyEnd');
const leaveApplyPartialRow = document.getElementById('leaveApplyPartialRow');
const leaveApplyIsPartial = document.getElementById('leaveApplyIsPartial');
const leaveApplyPartialTimeRow = document.getElementById('leaveApplyPartialTimeRow');
const leaveApplyHoursFrom = document.getElementById('leaveApplyHoursFrom');
const leaveApplyHoursTo = document.getElementById('leaveApplyHoursTo');
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
const leaveTypeEligEmployeeSearch = document.getElementById('leaveTypeEligEmployeeSearch');
const leaveTypeEligEmployeeSelectAllBtn = document.getElementById('leaveTypeEligEmployeeSelectAllBtn');
const leaveTypeEligEmployeeClearBtn = document.getElementById('leaveTypeEligEmployeeClearBtn');

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
const refreshLeaveBalancesBtn = document.getElementById('refreshLeaveBalancesBtn');
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

const leaveAdjustOverlay = document.getElementById('leaveAdjustOverlay');
const leaveAdjustCloseBtn = document.getElementById('leaveAdjustCloseBtn');
const leaveAdjustTitle = document.getElementById('leaveAdjustTitle');
const leaveAdjustCurrentBalance = document.getElementById('leaveAdjustCurrentBalance');
const leaveAdjustHistory = document.getElementById('leaveAdjustHistory');
const leaveAdjustForm = document.getElementById('leaveAdjustForm');
const leaveAdjustDate = document.getElementById('leaveAdjustDate');
const leaveAdjustDays = document.getElementById('leaveAdjustDays');
const leaveAdjustReason = document.getElementById('leaveAdjustReason');
const leaveAdjustError = document.getElementById('leaveAdjustError');
const leaveAdjustSaveBtn = document.getElementById('leaveAdjustSaveBtn');

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

let employeesCache = [];
let leaveTypesCache = [];
let holidaysCache = [];
let applicationsCache = [];
let adjustmentsCache = [];
let settingsCache = null;
let leaveDataLoaded = false;

let editingLeaveTypeId = null;
let currentAppStatusFilter = 'all';
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let pendingDecision = null; // { applicationId, action: 'approved' | 'rejected' }
let currentAdjustmentTarget = null; // { employeeId, leaveTypeId }

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

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Date#getDay() index

// "Weekend" = "not a configured working day" — driven by Settings >
// Working Schedule instead of hardcoded Saturday/Sunday, so a business
// with a different working week (e.g. Sun-Thu) gets correct results.
function isWeekend(dateStr) {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  const workingDays = settingsCache?.working_days || ['mon', 'tue', 'wed', 'thu', 'fri'];
  return !workingDays.includes(WEEKDAY_KEYS[day]);
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
  const specificIds = elig.specific_employee_ids || [];
  const hasCriteria = (elig.genders || []).length || (elig.employee_types || []).length
    || (elig.departments || []).length || (elig.job_positions || []).length;

  if (!hasCriteria) {
    // No gender/type/department/position filter set: a non-empty
    // specific-employees list becomes a standalone whitelist. If that's
    // empty too, there's genuinely no restriction — everyone qualifies.
    return specificIds.length ? specificIds.includes(employee.id) : true;
  }

  if (specificIds.includes(employee.id)) return true;
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

// Manual +/- corrections (opening balances, ad-hoc HR grants) — scoped
// to the same leave year and "as of" cutoff as usage, so an adjustment
// only counts once its date has arrived and then carries forward like
// any other unused balance.
function adjustmentDaysForYear(employeeId, leaveTypeId, yearStart, yearEnd, asOfStr) {
  const cappedEnd = asOfStr < yearEnd ? asOfStr : yearEnd;
  return adjustmentsCache
    .filter(a => a.employee_id === employeeId && a.leave_type_id === leaveTypeId
      && a.adjustment_date >= yearStart && a.adjustment_date <= cappedEnd)
    .reduce((sum, a) => sum + toNumber(a.days), 0);
}

// depth caps carry-forward recursion at 10 leave years back — plenty for
// any realistic tenure, and entitlement/used both fall to 0 once the
// recursion runs past when the employee or leave type actually existed.
// carryIn folds in manual adjustments too (an opening-balance grant is,
// functionally, unused entitlement brought into the year) so the table
// stays a simple entitled + carriedForward - taken = balance.
function computeLeaveBalanceBreakdown(employee, leaveType, asOfStr, depth = 0) {
  const { start: yearStart, end: yearEnd, year } = leaveYearBounds(asOfStr);
  const entitlement = entitlementForYear(employee, leaveType, yearStart, yearEnd, asOfStr);
  const used = usedDaysForYear(employee.id, leaveType.id, yearStart, yearEnd, asOfStr);
  const adjusted = adjustmentDaysForYear(employee.id, leaveType.id, yearStart, yearEnd, asOfStr);

  let carryIn = 0;
  if (depth < 10) {
    const prev = computeLeaveBalanceBreakdown(employee, leaveType, `${year - 1}-12-31`, depth + 1);
    carryIn = Math.max(0, Math.min(prev.balance, toNumber(leaveType.max_carry_forward)));
  }
  carryIn += adjusted;
  const balance = entitlement + carryIn - used;
  return { entitlement, carryIn, used, balance };
}

function computeLeaveBalance(employee, leaveType, asOfStr) {
  return computeLeaveBalanceBreakdown(employee, leaveType, asOfStr).balance;
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
  const [employeesRes, typesRes, holidaysRes, appsRes, adjustmentsRes, settingsRes] = await Promise.all([
    supabase.from('employees').select('*').order('first_name'),
    supabase.from('leave_types').select('*').order('name'),
    supabase.from('public_holidays').select('*').order('holiday_date'),
    supabase.from('leave_applications').select('*').order('start_date', { ascending: false }),
    supabase.from('leave_balance_adjustments').select('*').order('adjustment_date', { ascending: false }),
    supabase.from('payroll_settings').select('*').maybeSingle()
  ]);
  employeesCache = employeesRes.data || [];
  leaveTypesCache = typesRes.data || [];
  holidaysCache = holidaysRes.data || [];
  applicationsCache = appsRes.data || [];
  adjustmentsCache = adjustmentsRes.data || [];
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
    // Approving/rejecting changes "days taken", which feeds directly into
    // the balance table and print report — re-render it immediately
    // rather than waiting for the next time that tab happens to be
    // opened, so it's never left showing a stale balance.
    renderBalancesTable();
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

// A searchable variant of employees.js's createLookupDropdown: same
// trigger/panel/hidden-select structure, plus a text filter, since the
// employee list this feeds (unlike job positions/departments) can get
// long enough that scanning it by eye isn't practical.
function createSearchableDropdown(fieldId) {
  const dropdown = document.getElementById(`${fieldId}Dropdown`);
  const trigger = document.getElementById(`${fieldId}Trigger`);
  const triggerText = document.getElementById(`${fieldId}TriggerText`);
  const panel = document.getElementById(`${fieldId}Panel`);
  const searchInput = document.getElementById(`${fieldId}Search`);
  const optionsList = document.getElementById(`${fieldId}Options`);
  const select = document.getElementById(fieldId);
  let items = []; // { value, label }

  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }
  function open() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    searchInput.value = '';
    renderOptions('');
    searchInput.focus();
  }
  function renderOptions(query) {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter(it => it.label.toLowerCase().includes(q)) : items;
    optionsList.innerHTML = filtered.length
      ? filtered.map(it => `<button type="button" class="classification-option simple${it.value === select.value ? ' is-selected' : ''}" data-value="${it.value}">${it.label}</button>`).join('')
      : '<p class="hint">No matches.</p>';
  }

  trigger.addEventListener('click', () => { panel.hidden ? open() : close(); });
  searchInput.addEventListener('input', () => renderOptions(searchInput.value));
  optionsList.addEventListener('click', event => {
    const btn = event.target.closest('[data-value]');
    if (!btn) return;
    select.value = btn.dataset.value;
    const item = items.find(it => it.value === btn.dataset.value);
    triggerText.textContent = item ? item.label : '— Select —';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  });
  document.addEventListener('click', event => {
    if (!dropdown.contains(event.target)) close();
  });

  return {
    setOptions(newItems) {
      items = newItems;
      select.innerHTML = '<option value="">— Select —</option>' +
        items.map(it => `<option value="${it.value}">${it.label}</option>`).join('');
      select.value = '';
      triggerText.textContent = '— Select —';
    }
  };
}

const leaveApplyEmployeeDropdown = createSearchableDropdown('leaveApplyEmployee');

applyLeaveBtn.addEventListener('click', () => {
  leaveApplyError.hidden = true;
  leaveApplyTitle.textContent = 'Apply for leave';
  leaveApplyView.reset();
  leaveApplyPartialRow.hidden = true;
  leaveApplyDocRow.hidden = true;
  leaveApplyBalanceHint.textContent = '';
  syncPartialDayUi();

  leaveApplyEmployeeDropdown.setOptions(
    employeesCache.filter(e => e.status === 'active').map(e => ({ value: e.id, label: employeeName(e) }))
  );
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
leaveApplyStart.addEventListener('change', () => {
  // Partial-day leave only ever covers its start date — keep end_date
  // pinned to it so a stale range can't sneak into the submitted request.
  if (leaveApplyIsPartial.checked) leaveApplyEnd.value = leaveApplyStart.value;
  refreshLeaveApplyTypeOptions();
  updateLeaveApplyPreview();
});
leaveApplyEnd.addEventListener('change', updateLeaveApplyPreview);

// Checking "partial day" collapses the date range down to the single
// start date and swaps the free-form hours count for an explicit
// from/to time range, so a partial-day request can't accidentally span
// multiple dates or an ambiguous number of hours.
function syncPartialDayUi() {
  const isPartial = leaveApplyIsPartial.checked;
  leaveApplyEndRow.hidden = isPartial;
  leaveApplyEnd.required = !isPartial;
  leaveApplyPartialTimeRow.hidden = !isPartial;
  leaveApplyHoursFrom.required = isPartial;
  leaveApplyHoursTo.required = isPartial;
  if (isPartial) leaveApplyEnd.value = leaveApplyStart.value;
}

leaveApplyIsPartial.addEventListener('change', () => { syncPartialDayUi(); updateLeaveApplyPreview(); });
leaveApplyHoursFrom.addEventListener('change', updateLeaveApplyPreview);
leaveApplyHoursTo.addEventListener('change', updateLeaveApplyPreview);

leaveApplyType.addEventListener('change', () => {
  const type = leaveTypesCache.find(t => t.id === leaveApplyType.value);
  leaveApplyPartialRow.hidden = !type?.allow_partial_day;
  leaveApplyDocRow.hidden = !type?.requires_documentation;
  if (!type?.allow_partial_day) leaveApplyIsPartial.checked = false;
  syncPartialDayUi();
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

function partialHoursRequested() {
  if (!leaveApplyHoursFrom.value || !leaveApplyHoursTo.value) return 0;
  const [fh, fm] = leaveApplyHoursFrom.value.split(':').map(Number);
  const [th, tm] = leaveApplyHoursTo.value.split(':').map(Number);
  const hours = (th + tm / 60) - (fh + fm / 60);
  return hours > 0 ? hours : 0;
}

function computeRequestedDays(type) {
  if (leaveApplyIsPartial.checked && type?.allow_partial_day) {
    const hours = partialHoursRequested();
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
  const isPartial = leaveApplyIsPartial.checked && type?.allow_partial_day;

  if (isPartial) leaveApplyEnd.value = leaveApplyStart.value;

  if (!employee || !type || !leaveApplyStart.value || !leaveApplyEnd.value) {
    leaveApplyError.textContent = 'Employee, leave type, and both dates are required.';
    leaveApplyError.hidden = false;
    return;
  }
  if (isPartial && (!leaveApplyHoursFrom.value || !leaveApplyHoursTo.value)) {
    leaveApplyError.textContent = 'Both a from and to time are required for a partial-day request.';
    leaveApplyError.hidden = false;
    return;
  }
  if (isPartial && partialHoursRequested() <= 0) {
    leaveApplyError.textContent = 'The "to" time must be after the "from" time.';
    leaveApplyError.hidden = false;
    return;
  }
  if (!isPartial && leaveApplyEnd.value < leaveApplyStart.value) {
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
      is_partial_day: isPartial,
      partial_hours: isPartial ? partialHoursRequested() : null,
      partial_start_time: isPartial ? leaveApplyHoursFrom.value : null,
      partial_end_time: isPartial ? leaveApplyHoursTo.value : null,
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

// Checkboxes stay in the DOM regardless of the search filter (only their
// wrapping <label> is hidden) so the browser's native checked state
// survives searching for someone else and coming back.
function renderEligibilityEmployeeChecklist(checkedIds) {
  const activeEmployees = employeesCache.filter(e => e.status === 'active');
  leaveTypeEligEmployee.innerHTML = activeEmployees.length
    ? activeEmployees.map(e => `
        <label data-search="${employeeName(e).toLowerCase()}">
          <input type="checkbox" name="eligEmployee" value="${e.id}" ${checkedIds.includes(e.id) ? 'checked' : ''}/> ${employeeName(e)}
        </label>
      `).join('')
    : '<p class="hint">No active employees yet.</p>';
}

function filterEligibilityEmployeeChecklist(query) {
  const q = query.trim().toLowerCase();
  leaveTypeEligEmployee.querySelectorAll('label[data-search]').forEach(label => {
    label.hidden = q ? !label.dataset.search.includes(q) : false;
  });
}

function employeeMatchesCriteria(employee, genders, employeeTypes, departments, jobPositions) {
  if (genders.length && !genders.includes(employee.gender)) return false;
  if (employeeTypes.length && !employeeTypes.includes(employee.employee_type)) return false;
  if (departments.length && !departments.includes(employee.department)) return false;
  if (jobPositions.length && !jobPositions.includes(employee.job_position)) return false;
  return true;
}

// Whenever a gender/employee-type/department/job-position box changes,
// re-check the "Specific employees" list to exactly whoever currently
// matches — so it always shows a live, unambiguous picture of who's
// eligible instead of going stale or requiring a manual re-tick.
function syncSpecificEmployeesFromCriteria() {
  const genders = checkedValues(leaveTypeEligGender);
  const employeeTypes = checkedValues(leaveTypeEligEmployeeType);
  const departments = checkedValues(leaveTypeEligDepartment);
  const jobPositions = checkedValues(leaveTypeEligJobPosition);
  const hasCriteria = genders.length || employeeTypes.length || departments.length || jobPositions.length;

  const matchingIds = hasCriteria
    ? employeesCache.filter(e => e.status === 'active' && employeeMatchesCriteria(e, genders, employeeTypes, departments, jobPositions)).map(e => e.id)
    : [];
  renderEligibilityEmployeeChecklist(matchingIds);
  filterEligibilityEmployeeChecklist(leaveTypeEligEmployeeSearch.value);
}

[leaveTypeEligGender, leaveTypeEligEmployeeType, leaveTypeEligDepartment, leaveTypeEligJobPosition].forEach(container => {
  container.addEventListener('change', syncSpecificEmployeesFromCriteria);
});

leaveTypeEligEmployeeSearch.addEventListener('input', () => filterEligibilityEmployeeChecklist(leaveTypeEligEmployeeSearch.value));
leaveTypeEligEmployeeSelectAllBtn.addEventListener('click', () => {
  leaveTypeEligEmployee.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
});
leaveTypeEligEmployeeClearBtn.addEventListener('click', () => {
  leaveTypeEligEmployee.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
});

function populateLeaveTypeEligibilityLists(eligibility = {}) {
  const departments = settingsCache?.departments || [];
  const jobPositions = settingsCache?.job_positions || [];

  leaveTypeEligDepartment.innerHTML = checklistHtml(departments, eligibility.departments || [], 'eligDept');
  leaveTypeEligJobPosition.innerHTML = checklistHtml(jobPositions, eligibility.job_positions || [], 'eligJob');
  [...leaveTypeEligGender.querySelectorAll('input')].forEach(cb => { cb.checked = (eligibility.genders || []).includes(cb.value); });
  [...leaveTypeEligEmployeeType.querySelectorAll('input')].forEach(cb => { cb.checked = (eligibility.employee_types || []).includes(cb.value); });

  leaveTypeEligEmployeeSearch.value = '';
  renderEligibilityEmployeeChecklist(eligibility.specific_employee_ids || []);
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

// Each leave type gets 4 sub-columns so the table reads like a ledger
// (Entitled + Carried Fwd - Taken = Balance) instead of just the final
// number, on both the live table and the print report below.
function leaveBalanceHeaderRows() {
  const leading = ['Employee', 'Job position', 'Department'].map(l => `<th rowspan="2">${l}</th>`).join('');
  const groups = leaveTypesCache.map(t => `<th colspan="4">${t.name}</th>`).join('');
  const subLabels = ['Entitled', 'Carried Fwd', 'Taken', 'Balance'].map(l => `<th class="leave-num-head">${l}</th>`).join('');
  const subs = leaveTypesCache.map(() => subLabels).join('');
  return `<tr>${leading}${groups}</tr><tr>${subs}</tr>`;
}

function renderBalancesTable() {
  if (!leaveBalancesAsOf.value) leaveBalancesAsOf.value = todayStr();
  const asOf = leaveBalancesAsOf.value;
  const employees = filteredBalanceEmployees();

  leaveBalancesTableHead.innerHTML = leaveBalanceHeaderRows();

  leaveBalancesTableBody.innerHTML = employees.map(emp => `
    <tr>
      <td>${employeeName(emp)}</td>
      <td>${emp.job_position || '—'}</td>
      <td>${emp.department || '—'}</td>
      ${leaveTypesCache.map(t => {
        const b = computeLeaveBalanceBreakdown(emp, t, asOf);
        const hasAdjustments = adjustmentsCache.some(a => a.employee_id === emp.id && a.leave_type_id === t.id);
        return `
          <td class="leave-num-cell leave-balance-subcell">${b.entitlement.toFixed(2)}</td>
          <td class="leave-num-cell leave-balance-subcell">${b.carryIn.toFixed(2)}</td>
          <td class="leave-num-cell leave-balance-subcell">${b.used.toFixed(2)}</td>
          <td class="leave-num-cell">
            <button type="button" class="leave-balance-cell${hasAdjustments ? ' has-adjustments' : ''}" data-employee-id="${emp.id}" data-leave-type-id="${t.id}" title="Click to adjust this balance">
              ${b.balance.toFixed(2)}
            </button>
          </td>
        `;
      }).join('')}
    </tr>
  `).join('') || `<tr><td colspan="${3 + leaveTypesCache.length * 4}">No employees match this filter.</td></tr>`;
}

[leaveBalancesDept, leaveBalancesSubDept, leaveBalancesAsOf].forEach(el => el.addEventListener('change', renderBalancesTable));
leaveBalancesSearch.addEventListener('input', renderBalancesTable);

// Balances are always computed live from the currently-loaded caches
// (employees, leave types, applications, adjustments) — this button
// exists for when the underlying data changed elsewhere (a new
// employee added, a leave type edited, a department renamed in
// Settings, another admin's changes) since this tab was first opened,
// rather than because the math itself goes stale on its own.
refreshLeaveBalancesBtn.addEventListener('click', async () => {
  refreshLeaveBalancesBtn.disabled = true;
  try {
    await loadCoreLeaveData({ force: true });
    renderBalancesTable();
  } finally {
    refreshLeaveBalancesBtn.disabled = false;
  }
});

leaveBalancesTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.leave-balance-cell');
  if (!btn) return;
  openAdjustmentModal(btn.dataset.employeeId, btn.dataset.leaveTypeId);
});

function buildLeaveBalancesPrintHtml() {
  const asOf = leaveBalancesAsOf.value || todayStr();
  const employees = filteredBalanceEmployees();
  const businessName = settingsCache?.business_name || 'Business name not set';
  const deptLabel = leaveBalancesDept.value || 'All departments';
  const subDeptLabel = leaveBalancesSubDept.value || 'All sub departments';

  const rows = employees.map(emp => ({
    leading: [employeeName(emp), emp.job_position || '—', emp.department || '—'],
    breakdowns: leaveTypesCache.map(t => computeLeaveBalanceBreakdown(emp, t, asOf))
  }));

  const totalsPerType = leaveTypesCache.map((t, idx) => rows.reduce((acc, r) => {
    const b = r.breakdowns[idx];
    acc.entitlement += b.entitlement; acc.carryIn += b.carryIn; acc.used += b.used; acc.balance += b.balance;
    return acc;
  }, { entitlement: 0, carryIn: 0, used: 0, balance: 0 }));

  const bodyRows = rows.map(r => `
    <tr>
      ${r.leading.map(c => `<td class="muster-left">${c}</td>`).join('')}
      ${r.breakdowns.map(b => `
        <td class="muster-right">${b.entitlement.toFixed(2)}</td>
        <td class="muster-right">${b.carryIn.toFixed(2)}</td>
        <td class="muster-right">${b.used.toFixed(2)}</td>
        <td class="muster-right muster-bold">${b.balance.toFixed(2)}</td>
      `).join('')}
    </tr>
  `).join('');

  const totalsRowHtml = `
    <tr class="muster-totals-row">
      <td class="muster-left muster-bold">GRAND TOTAL</td><td></td><td></td>
      ${totalsPerType.map(t => `
        <td class="muster-right muster-bold">${t.entitlement.toFixed(2)}</td>
        <td class="muster-right muster-bold">${t.carryIn.toFixed(2)}</td>
        <td class="muster-right muster-bold">${t.used.toFixed(2)}</td>
        <td class="muster-right muster-bold">${t.balance.toFixed(2)}</td>
      `).join('')}
    </tr>
  `;

  return `
    <div class="muster-page">
      <div class="muster-header">
        <div class="muster-business-name">${businessName}</div>
        <div class="muster-cycle">Leave Balances — ${deptLabel} · ${subDeptLabel}</div>
        <div class="muster-meta">As of ${asOf} &middot; Generated: ${new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </div>
      <table class="muster-table">
        <thead>${leaveBalanceHeaderRows()}</thead>
        <tbody>${bodyRows}${totalsRowHtml}</tbody>
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

  // margin: 0 (not the usual 10mm) so Chrome/Edge have no room left to
  // draw their default header/footer (page title + URL) — .muster-page
  // replicates the visual margin from inside the content instead.
  const pageStyle = document.createElement('style');
  pageStyle.textContent = '@page { size: landscape; margin: 0; }';
  document.head.appendChild(pageStyle);
  const originalTitle = document.title;
  document.title = '';

  wrap.hidden = false;
  document.body.classList.add('printing-leave-balances');
  window.print();
  document.body.classList.remove('printing-leave-balances');
  wrap.hidden = true;
  pageStyle.remove();
  document.title = originalTitle;
});

// ---------------------------------------------------------------------
// Manual balance adjustments
// ---------------------------------------------------------------------

function renderAdjustmentHistory() {
  const { employeeId, leaveTypeId } = currentAdjustmentTarget;
  const rows = adjustmentsCache
    .filter(a => a.employee_id === employeeId && a.leave_type_id === leaveTypeId)
    .sort((a, b) => (a.adjustment_date < b.adjustment_date ? 1 : -1));

  leaveAdjustHistory.innerHTML = rows.length
    ? rows.map(a => `
        <div class="leave-adjust-history-row">
          <div>
            <strong>${a.days > 0 ? '+' : ''}${a.days} day${Math.abs(a.days) === 1 ? '' : 's'}</strong>
            <span>${a.adjustment_date}${a.reason ? ` &middot; ${a.reason}` : ''}</span>
          </div>
          <button type="button" class="ghost-button leave-adjust-delete-btn" data-id="${a.id}">Delete</button>
        </div>
      `).join('')
    : '<p class="hint">No manual adjustments yet.</p>';
}

function openAdjustmentModal(employeeId, leaveTypeId) {
  const employee = employeesCache.find(e => e.id === employeeId);
  const leaveType = leaveTypesCache.find(t => t.id === leaveTypeId);
  if (!employee || !leaveType) return;

  currentAdjustmentTarget = { employeeId, leaveTypeId };
  leaveAdjustTitle.textContent = `${employeeName(employee)} — ${leaveType.name}`;
  const asOf = leaveBalancesAsOf.value || todayStr();
  leaveAdjustCurrentBalance.textContent = `Current balance as of ${asOf}: ${computeLeaveBalance(employee, leaveType, asOf).toFixed(2)} day(s).`;
  leaveAdjustForm.reset();
  leaveAdjustDate.value = todayStr();
  leaveAdjustError.hidden = true;
  renderAdjustmentHistory();
  leaveAdjustOverlay.hidden = false;
}

function closeAdjustmentModal() {
  leaveAdjustOverlay.hidden = true;
  currentAdjustmentTarget = null;
}

leaveAdjustCloseBtn.addEventListener('click', closeAdjustmentModal);

leaveAdjustForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentAdjustmentTarget) return;
  leaveAdjustError.hidden = true;

  const days = toNumber(leaveAdjustDays.value);
  if (!leaveAdjustDate.value || !days) {
    leaveAdjustError.textContent = 'Date and a non-zero day amount are both required.';
    leaveAdjustError.hidden = false;
    return;
  }

  leaveAdjustSaveBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('leave_balance_adjustments').insert({
      user_id: user.id,
      employee_id: currentAdjustmentTarget.employeeId,
      leave_type_id: currentAdjustmentTarget.leaveTypeId,
      adjustment_date: leaveAdjustDate.value,
      days,
      reason: leaveAdjustReason.value.trim() || null
    });
    if (error) throw error;

    await loadCoreLeaveData({ force: true });
    renderBalancesTable();
    openAdjustmentModal(currentAdjustmentTarget.employeeId, currentAdjustmentTarget.leaveTypeId);
    leaveAdjustForm.reset();
    leaveAdjustDate.value = todayStr();
  } catch (err) {
    leaveAdjustError.textContent = err.message || 'Could not save this adjustment.';
    leaveAdjustError.hidden = false;
  } finally {
    leaveAdjustSaveBtn.disabled = false;
  }
});

leaveAdjustHistory.addEventListener('click', async event => {
  const btn = event.target.closest('.leave-adjust-delete-btn');
  if (!btn || !currentAdjustmentTarget) return;
  btn.disabled = true;
  const { error } = await supabase.from('leave_balance_adjustments').delete().eq('id', btn.dataset.id);
  if (!error) {
    await loadCoreLeaveData({ force: true });
    renderBalancesTable();
    openAdjustmentModal(currentAdjustmentTarget.employeeId, currentAdjustmentTarget.leaveTypeId);
  } else {
    btn.disabled = false;
  }
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
