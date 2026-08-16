import { auth, db, callFunction } from './auth.js';
import { requireReportPasscode } from './reportPasscode.js';
import { applyPrintWatermark } from './watermark.js';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const { toNumber } = window.PayrollShared;

// Shared with employeePortal.js so an employee's own leave tab reuses the
// exact same balance formula and data-loading query set instead of
// re-deriving them. Unlike Supabase (where a plain select('*') came back
// pre-scoped by RLS to whatever a given session could see, no client-side
// branching needed), Firestore rejects a broad collection query outright
// for an employee session unless every possible result is provably
// theirs -- so loadCoreLeaveData() branches internally: direct Firestore
// reads for the owner (unrestricted by firestore.rules' isOwner()), and
// api/get-leave-data.js (Admin SDK, same broad reads done server-side)
// for an employee, set via setLeaveViewerIsEmployee() before the portal's
// first load. Every write in this file (add holiday, save leave type,
// record a decision, apply on behalf of someone, adjust a balance) only
// ever runs from this page's own owner-only UI -- employeePortal.js has
// its own, separate "apply for leave" form -- so businessDoc/
// businessCollection below stay keyed on the signed-in owner's own uid
// unconditionally.
export {
  loadCoreLeaveData, computeLeaveBalanceBreakdown, countWorkingDays, findConflictingLeaveApplication, todayStr,
  derivedStatus, statusPillClass, statusLabel, setLeaveViewerIsEmployee,
  employeesCache, leaveTypesCache, holidaysCache, applicationsCache, adjustmentsCache, settingsCache
};

let leaveViewerIsEmployee = false;
function setLeaveViewerIsEmployee(isEmployee) { leaveViewerIsEmployee = isEmployee; }

function businessDoc(...pathSegments) {
  return doc(db, 'businesses', auth.currentUser.uid, ...pathSegments);
}
function businessCollection(...pathSegments) {
  return collection(db, 'businesses', auth.currentUser.uid, ...pathSegments);
}

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
const refreshLeaveApplicationsBtn = document.getElementById('refreshLeaveApplicationsBtn');
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
const emailLeaveBalancesBtn = document.getElementById('emailLeaveBalancesBtn');
const leaveBalancesError = document.getElementById('leaveBalancesError');
const leaveBalancesInfo = document.getElementById('leaveBalancesInfo');
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

const leaveConfirmOverlay = document.getElementById('leaveConfirmOverlay');
const leaveConfirmCloseBtn = document.getElementById('leaveConfirmCloseBtn');
const leaveConfirmCancelBtn = document.getElementById('leaveConfirmCancelBtn');
const leaveConfirmTitle = document.getElementById('leaveConfirmTitle');
const leaveConfirmMessage = document.getElementById('leaveConfirmMessage');
const leaveConfirmError = document.getElementById('leaveConfirmError');
const leaveConfirmActionBtn = document.getElementById('leaveConfirmActionBtn');

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
// Shared confirm modal (used before destructive actions like deletes)
// ---------------------------------------------------------------------

let leaveConfirmHandler = null;

function openLeaveConfirm({ title, message, confirmLabel = 'Delete', onConfirm }) {
  leaveConfirmTitle.textContent = title;
  leaveConfirmMessage.textContent = message;
  leaveConfirmActionBtn.textContent = confirmLabel;
  leaveConfirmActionBtn.disabled = false;
  leaveConfirmError.hidden = true;
  leaveConfirmHandler = onConfirm;
  leaveConfirmOverlay.hidden = false;
}

function closeLeaveConfirm() {
  leaveConfirmOverlay.hidden = true;
  leaveConfirmHandler = null;
}

leaveConfirmCloseBtn.addEventListener('click', closeLeaveConfirm);
leaveConfirmCancelBtn.addEventListener('click', closeLeaveConfirm);

leaveConfirmActionBtn.addEventListener('click', async () => {
  if (!leaveConfirmHandler) return;
  leaveConfirmActionBtn.disabled = true;
  leaveConfirmError.hidden = true;
  try {
    await leaveConfirmHandler();
    closeLeaveConfirm();
  } catch (err) {
    leaveConfirmError.textContent = err.message || 'Something went wrong. Please try again.';
    leaveConfirmError.hidden = false;
    leaveConfirmActionBtn.disabled = false;
  }
});

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
  const workingDays = settingsCache?.workingDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
  return !workingDays.includes(WEEKDAY_KEYS[day]);
}

function isHoliday(dateStr) {
  return holidaysCache.some(h => h.holidayDate === dateStr);
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

// One employee can't be on two leaves at once, regardless of whether
// they're the same leave type or different ones -- so this checks across
// the employee's whole application history, not just within one type.
// Only pending/approved applications count as an active claim on those
// dates; a rejected one never blocks a new request. Two partial-day
// requests on the exact same single date are only a real clash if their
// time windows actually overlap -- a morning slot and an afternoon slot
// on the same day are legitimately both fine.
function findConflictingLeaveApplication(employeeId, startStr, endStr, { isPartial = false, partialStart = null, partialEnd = null, excludeAppId = null } = {}) {
  return applicationsCache.find(app => {
    if (app.employeeId !== employeeId) return false;
    if (app.id === excludeAppId) return false;
    if (app.status === 'rejected') return false;
    if (app.startDate > endStr || app.endDate < startStr) return false;

    const bothSingleDayPartial = isPartial && app.isPartialDay
      && startStr === endStr && app.startDate === app.endDate && app.startDate === startStr;
    if (bothSingleDayPartial) {
      if (!partialStart || !partialEnd || !app.partialStartTime || !app.partialEndTime) return true;
      return partialStart < app.partialEndTime && app.partialStartTime < partialEnd;
    }

    return true;
  });
}

function employeeName(employee) {
  return employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown employee';
}

// ---------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------

function isEmployeeEligibleForType(employee, leaveType) {
  const elig = leaveType.eligibility || {};
  const specificIds = elig.specificEmployeeIds || [];
  const hasCriteria = (elig.genders || []).length || (elig.employeeTypes || []).length
    || (elig.departments || []).length || (elig.jobPositions || []).length;

  if (!hasCriteria) {
    // No gender/type/department/position filter set: a non-empty
    // specific-employees list becomes a standalone whitelist. If that's
    // empty too, there's genuinely no restriction — everyone qualifies.
    return specificIds.length ? specificIds.includes(employee.id) : true;
  }

  if (specificIds.includes(employee.id)) return true;
  if ((elig.genders || []).length && !elig.genders.includes(employee.gender)) return false;
  if ((elig.employeeTypes || []).length && !elig.employeeTypes.includes(employee.employeeType)) return false;
  if ((elig.departments || []).length && !elig.departments.includes(employee.department)) return false;
  if ((elig.jobPositions || []).length && !elig.jobPositions.includes(employee.jobPosition)) return false;
  return true;
}

function getEligibleLeaveTypesForEmployee(employee, forDateStr) {
  return leaveTypesCache.filter(lt => {
    if (!lt.isActive) return false;
    if (lt.effectiveStartDate && forDateStr && forDateStr < lt.effectiveStartDate) return false;
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
  const referenceStart = [yearStart, employee.contractStartDate, leaveType.effectiveStartDate]
    .filter(Boolean)
    .reduce((max, d) => (d > max ? d : max), yearStart);
  if (asOfStr < referenceStart) return 0;

  const annual = toNumber(leaveType.annualDays);
  if (leaveType.accrualMethod === 'monthly') {
    const cappedAsOf = asOfStr < yearEnd ? asOfStr : yearEnd;
    const months = monthsCreditedInYear(referenceStart, cappedAsOf);
    return Math.min(annual, (annual / 12) * months);
  }
  return annual;
}

// Approved leave is committed the moment it's approved, so it counts
// against the balance right away even if its dates are still in the
// future -- this prevents an admin from approving overlapping requests
// against a balance that looks unspent only because the leave hasn't
// started yet.
function usedDaysForYear(employeeId, leaveTypeId, yearStart, yearEnd) {
  return applicationsCache
    .filter(a => a.employeeId === employeeId && a.leaveTypeId === leaveTypeId && a.status === 'approved'
      && a.startDate >= yearStart && a.startDate <= yearEnd)
    .reduce((sum, a) => sum + toNumber(a.daysRequested), 0);
}

// Manual +/- corrections (opening balances, ad-hoc HR grants) — scoped
// to the same leave year and "as of" cutoff as usage, so an adjustment
// only counts once its date has arrived and then carries forward like
// any other unused balance.
function adjustmentDaysForYear(employeeId, leaveTypeId, yearStart, yearEnd, asOfStr) {
  const cappedEnd = asOfStr < yearEnd ? asOfStr : yearEnd;
  return adjustmentsCache
    .filter(a => a.employeeId === employeeId && a.leaveTypeId === leaveTypeId
      && a.adjustmentDate >= yearStart && a.adjustmentDate <= cappedEnd)
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
  const used = usedDaysForYear(employee.id, leaveType.id, yearStart, yearEnd);
  const adjusted = adjustmentDaysForYear(employee.id, leaveType.id, yearStart, yearEnd, asOfStr);

  let carryIn = 0;
  if (depth < 10) {
    const prev = computeLeaveBalanceBreakdown(employee, leaveType, `${year - 1}-12-31`, depth + 1);
    carryIn = Math.max(0, Math.min(prev.balance, toNumber(leaveType.maxCarryForward)));
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

  if (tab === 'applications') {
    renderApplicationsTable();
    loadLeaveApprovalState().then(renderApplicationsTable);
  }
  if (tab === 'types') renderLeaveTypesTable();
  if (tab === 'calendar') renderCalendar();
  if (tab === 'holidays') renderHolidaysTable();
  if (tab === 'balances') renderBalancesTable();
}

leaveTabButtons.forEach(btn => {
  btn.addEventListener('click', () => showLeaveTab(btn.dataset.leaveTab));
});

// loadCoreLeaveData only re-fetches once per page visit by default (see
// its own force-flag check below), so an application submitted or a
// decision recorded by someone else -- another admin, or an approver
// acting from their own portal session -- never appears here until this
// is explicitly forced, even if the owner just switches tabs and back.
refreshLeaveApplicationsBtn.addEventListener('click', async () => {
  refreshLeaveApplicationsBtn.disabled = true;
  try {
    await loadCoreLeaveData({ force: true });
    await loadLeaveApprovalState();
    renderApplicationsTable();
  } finally {
    refreshLeaveApplicationsBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------

async function loadCoreLeaveData({ force = false } = {}) {
  if (leaveDataLoaded && !force) return;

  if (leaveViewerIsEmployee) {
    const data = await callFunction('/api/get-leave-data');
    employeesCache = data.employees || [];
    leaveTypesCache = data.leaveTypes || [];
    holidaysCache = data.holidays || [];
    applicationsCache = data.applications || [];
    adjustmentsCache = data.adjustments || [];
    settingsCache = data.settings || null;
  } else {
    const [employeesSnap, typesSnap, holidaysSnap, appsSnap, adjustmentsSnap, settingsSnap] = await Promise.all([
      getDocs(query(businessCollection('employees'), orderBy('firstName'))),
      getDocs(query(businessCollection('leaveTypes'), orderBy('name'))),
      getDocs(query(businessCollection('publicHolidays'), orderBy('holidayDate'))),
      getDocs(query(businessCollection('leaveApplications'), orderBy('startDate', 'desc'))),
      getDocs(query(businessCollection('leaveBalanceAdjustments'), orderBy('adjustmentDate', 'desc'))),
      getDoc(businessDoc('settings', 'main'))
    ]);
    employeesCache = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    leaveTypesCache = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    holidaysCache = holidaysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    applicationsCache = appsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    adjustmentsCache = adjustmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    settingsCache = settingsSnap.exists() ? settingsSnap.data() : null;
  }

  leaveDataLoaded = true;
  populateDeptSelects();
}

function populateDeptSelects() {
  const departments = settingsCache?.departments || [];
  const subDepartments = settingsCache?.subDepartments || [];
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
  return app.endDate < todayStr() ? 'completed' : 'approved';
}

const statusPillClass = { pending: 'terminated', approved: 'active', completed: 'active', rejected: 'terminated' };
const statusLabel = { pending: 'Pending', approved: 'Approved', completed: 'Completed', rejected: 'Rejected' };

// When an active leave approval workflow exists, the owner's direct
// Approve/Reject buttons are replaced by an "Awaiting: ..." line --
// approval power moves entirely to the appointed approvers (see
// api/record-approval-decision.js). Populated by loadLeaveApprovalState(),
// read synchronously by renderApplicationsTable() so that function
// doesn't need to become async.
let leaveWorkflowActive = false;
let leaveApprovalActionsByAppId = new Map();

async function loadLeaveApprovalState() {
  const workflowSnap = await getDoc(businessDoc('approvalWorkflows', 'leave_application'));
  leaveWorkflowActive = workflowSnap.exists() && !!workflowSnap.data().isActive;
  leaveApprovalActionsByAppId = new Map();
  if (!leaveWorkflowActive) return;

  const pendingAppIds = applicationsCache.filter(a => a.status === 'pending').map(a => a.id);
  if (!pendingAppIds.length) return;

  const actionsSnap = await getDocs(businessCollection('approvalActions'));
  const actions = actionsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.actionType === 'leave_application' && pendingAppIds.includes(a.recordId));
  if (!actions.length) return;

  const employeeIds = [...new Set(actions.map(a => a.employeeId))];
  const approverSnaps = await Promise.all(employeeIds.map(id => getDoc(businessDoc('employees', id))));
  const nameById = new Map(approverSnaps.filter(s => s.exists()).map(s => [s.id, `${s.data().firstName} ${s.data().lastName}`]));

  actions.forEach(a => {
    const list = leaveApprovalActionsByAppId.get(a.recordId) || [];
    list.push({ ...a, name: nameById.get(a.employeeId) || 'Unknown' });
    leaveApprovalActionsByAppId.set(a.recordId, list);
  });
}

function awaitingApprovalHtml(appId) {
  const actionsForApp = leaveApprovalActionsByAppId.get(appId);
  if (!actionsForApp || !actionsForApp.length) return '<span class="hint">Not yet submitted</span>';
  const rejected = actionsForApp.find(a => a.decision === 'rejected');
  if (rejected) return `<span class="hint">Rejected by ${rejected.name}</span>`;
  const pending = actionsForApp.filter(a => a.decision === 'pending').map(a => a.name);
  return pending.length ? `<span class="hint">Awaiting: ${pending.join(', ')}</span>` : '<span class="hint">All approved</span>';
}

function renderApplicationsTable() {
  const search = leaveApplicationsSearch.value.trim().toLowerCase();
  const rows = applicationsCache
    .map(app => ({ app, employee: employeesCache.find(e => e.id === app.employeeId), type: leaveTypesCache.find(t => t.id === app.leaveTypeId) }))
    .filter(({ app }) => currentAppStatusFilter === 'all' || derivedStatus(app) === currentAppStatusFilter)
    .filter(({ employee }) => !search || employeeName(employee).toLowerCase().includes(search));

  leaveApplicationsEmptyState.hidden = rows.length > 0;
  leaveApplicationsEmptyState.textContent = 'No leave applications match this view.';

  leaveApplicationsTableBody.innerHTML = rows.map(({ app, employee, type }) => {
    const status = derivedStatus(app);
    const comment = app.decisionComment ? ` title="${app.decisionComment.replace(/"/g, '&quot;')}"` : '';
    const actions = app.status !== 'pending'
      ? ''
      : leaveWorkflowActive
        ? awaitingApprovalHtml(app.id)
        : `<button type="button" class="ghost-button leave-approve-btn" data-id="${app.id}">Approve</button>
           <button type="button" class="ghost-button leave-reject-btn" data-id="${app.id}">Reject</button>`;
    return `
      <tr data-id="${app.id}">
        <td>${employeeName(employee)}</td>
        <td>${type ? type.name : 'Deleted leave type'}</td>
        <td>${app.startDate}</td>
        <td>${app.endDate}</td>
        <td>${toNumber(app.daysRequested).toFixed(2)}</td>
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
    await updateDoc(businessDoc('leaveApplications', pendingDecision.applicationId), {
      status: pendingDecision.action,
      decisionComment: comment,
      decidedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

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
    .map(a => ({ app: a, employee: employeesCache.find(e => e.id === a.employeeId), type: leaveTypesCache.find(t => t.id === a.leaveTypeId) }))
    .filter(({ employee }) => employee)
    .filter(({ employee }) => !dept || employee.department === dept)
    .filter(({ employee }) => !subDept || employee.subDepartment === subDept)
    .filter(({ app }) => !from || app.startDate >= from)
    .filter(({ app }) => !to || app.startDate <= to);

  const totalDays = rows.reduce((sum, r) => sum + toNumber(r.app.daysRequested), 0);

  leaveAnalyticsSummary.innerHTML = `
    <div><span>Applications</span><strong>${rows.length}</strong></div>
    <div><span>Total days taken</span><strong>${totalDays}</strong></div>
  `;

  const byType = new Map();
  const byDept = new Map();
  rows.forEach(({ app, employee, type }) => {
    const typeName = type ? type.name : 'Unknown';
    byType.set(typeName, (byType.get(typeName) || 0) + toNumber(app.daysRequested));
    const deptName = employee.department || 'Unassigned';
    byDept.set(deptName, (byDept.get(deptName) || 0) + toNumber(app.daysRequested));
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
  leaveApplyPartialRow.hidden = !type?.allowPartialDay;
  leaveApplyDocRow.hidden = !type?.requiresDocumentation;
  if (!type?.allowPartialDay) leaveApplyIsPartial.checked = false;
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
    `This request is ${days} day(s). Current balance: ${balanceBefore.toFixed(2)} day(s). Balance after: ${balanceAfter.toFixed(2)} day(s)${type.allowNegativeBalance ? '' : (balanceAfter < 0 ? ' — exceeds available balance' : '')}.`;
}

function partialHoursRequested() {
  if (!leaveApplyHoursFrom.value || !leaveApplyHoursTo.value) return 0;
  const [fh, fm] = leaveApplyHoursFrom.value.split(':').map(Number);
  const [th, tm] = leaveApplyHoursTo.value.split(':').map(Number);
  const hours = (th + tm / 60) - (fh + fm / 60);
  return hours > 0 ? hours : 0;
}

function computeRequestedDays(type) {
  if (leaveApplyIsPartial.checked && type?.allowPartialDay) {
    const hours = partialHoursRequested();
    const hoursPerDay = toNumber(settingsCache?.workHoursPerDay) || 8;
    return hoursPerDay > 0 ? Math.round((hours / hoursPerDay) * 100) / 100 : 0;
  }
  return countWorkingDays(leaveApplyStart.value, leaveApplyEnd.value);
}

leaveApplyView.addEventListener('submit', async event => {
  event.preventDefault();
  leaveApplyError.hidden = true;

  const employee = employeesCache.find(e => e.id === leaveApplyEmployee.value);
  const type = leaveTypesCache.find(t => t.id === leaveApplyType.value);
  const isPartial = leaveApplyIsPartial.checked && type?.allowPartialDay;

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
  const conflict = findConflictingLeaveApplication(employee.id, leaveApplyStart.value, leaveApplyEnd.value, {
    isPartial,
    partialStart: isPartial ? leaveApplyHoursFrom.value : null,
    partialEnd: isPartial ? leaveApplyHoursTo.value : null
  });
  if (conflict) {
    const conflictType = leaveTypesCache.find(t => t.id === conflict.leaveTypeId);
    leaveApplyError.textContent = `${employeeName(employee)} already has a ${conflict.status} ${conflictType ? conflictType.name : 'leave'} request covering ${conflict.startDate}${conflict.endDate !== conflict.startDate ? ` to ${conflict.endDate}` : ''}.`;
    leaveApplyError.hidden = false;
    return;
  }
  if (!isEmployeeEligibleForType(employee, type)) {
    leaveApplyError.textContent = `${employeeName(employee)} is not eligible for ${type.name} under its current rules.`;
    leaveApplyError.hidden = false;
    return;
  }
  const noticeDays = Math.ceil((new Date(`${leaveApplyStart.value}T00:00:00`) - new Date(`${todayStr()}T00:00:00`)) / 86400000);
  if (noticeDays < toNumber(type.noticePeriodDays)) {
    leaveApplyError.textContent = `${type.name} requires at least ${type.noticePeriodDays} day(s) of notice.`;
    leaveApplyError.hidden = false;
    return;
  }
  if (type.requiresDocumentation && !leaveApplyDoc.value.trim()) {
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
  if (!type.allowNegativeBalance) {
    const balanceAfter = computeLeaveBalance(employee, type, leaveApplyStart.value) - days;
    if (balanceAfter < 0) {
      leaveApplyError.textContent = `This request would leave a negative balance, which ${type.name} does not allow.`;
      leaveApplyError.hidden = false;
      return;
    }
  }

  leaveApplySaveBtn.disabled = true;
  try {
    await callFunction('/api/create-leave-application', {
      employeeId: employee.id,
      leaveTypeId: type.id,
      startDate: leaveApplyStart.value,
      endDate: leaveApplyEnd.value,
      isPartialDay: isPartial,
      partialHours: isPartial ? partialHoursRequested() : null,
      partialStartTime: isPartial ? leaveApplyHoursFrom.value : null,
      partialEndTime: isPartial ? leaveApplyHoursTo.value : null,
      daysRequested: days,
      reason: leaveApplyReason.value.trim() || null,
      documentationNote: leaveApplyDoc.value.trim() || null
    });

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
      <td>${toNumber(t.annualDays).toFixed(2)}</td>
      <td>${t.accrualMethod === 'monthly' ? 'Monthly accrual' : 'Immediate'}</td>
      <td><span class="status-pill status-${t.isActive ? 'active' : 'terminated'}">${t.isActive ? 'Active' : 'Inactive'}</span></td>
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
  if (employeeTypes.length && !employeeTypes.includes(employee.employeeType)) return false;
  if (departments.length && !departments.includes(employee.department)) return false;
  if (jobPositions.length && !jobPositions.includes(employee.jobPosition)) return false;
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
  const jobPositions = settingsCache?.jobPositions || [];

  leaveTypeEligDepartment.innerHTML = checklistHtml(departments, eligibility.departments || [], 'eligDept');
  leaveTypeEligJobPosition.innerHTML = checklistHtml(jobPositions, eligibility.jobPositions || [], 'eligJob');
  [...leaveTypeEligGender.querySelectorAll('input')].forEach(cb => { cb.checked = (eligibility.genders || []).includes(cb.value); });
  [...leaveTypeEligEmployeeType.querySelectorAll('input')].forEach(cb => { cb.checked = (eligibility.employeeTypes || []).includes(cb.value); });

  leaveTypeEligEmployeeSearch.value = '';
  renderEligibilityEmployeeChecklist(eligibility.specificEmployeeIds || []);
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
  leaveTypeAnnualDays.value = leaveType.annualDays ?? 0;
  leaveTypeAccrualMethod.value = leaveType.accrualMethod || 'immediate';
  leaveTypeEffectiveDate.value = leaveType.effectiveStartDate || '';
  leaveTypeNoticeDays.value = leaveType.noticePeriodDays ?? 0;
  leaveTypeMaxCarryForward.value = leaveType.maxCarryForward ?? 0;
  leaveTypeAllowNegative.checked = !!leaveType.allowNegativeBalance;
  leaveTypeAllowPartial.checked = !!leaveType.allowPartialDay;
  leaveTypeRequiresDoc.checked = !!leaveType.requiresDocumentation;
  leaveTypeIsActive.checked = !!leaveType.isActive;
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
    annualDays: toNumber(leaveTypeAnnualDays.value),
    accrualMethod: leaveTypeAccrualMethod.value,
    effectiveStartDate: leaveTypeEffectiveDate.value || null,
    noticePeriodDays: Math.round(toNumber(leaveTypeNoticeDays.value)),
    maxCarryForward: toNumber(leaveTypeMaxCarryForward.value),
    allowNegativeBalance: leaveTypeAllowNegative.checked,
    allowPartialDay: leaveTypeAllowPartial.checked,
    requiresDocumentation: leaveTypeRequiresDoc.checked,
    isActive: leaveTypeIsActive.checked,
    eligibility: {
      genders: checkedValues(leaveTypeEligGender),
      employeeTypes: checkedValues(leaveTypeEligEmployeeType),
      departments: checkedValues(leaveTypeEligDepartment),
      jobPositions: checkedValues(leaveTypeEligJobPosition),
      specificEmployeeIds: checkedValues(leaveTypeEligEmployee)
    },
    updatedAt: new Date().toISOString()
  };

  const saveBtn = document.getElementById('leaveTypeSaveBtn');
  saveBtn.disabled = true;
  try {
    if (editingLeaveTypeId) {
      await updateDoc(businessDoc('leaveTypes', editingLeaveTypeId), payload);
    } else {
      await addDoc(businessCollection('leaveTypes'), { ...payload, createdAt: new Date().toISOString() });
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
    .sort((a, b) => (a.holidayDate < b.holidayDate ? -1 : 1))
    .map(h => `
      <tr data-id="${h.id}">
        <td>${h.holidayDate}</td>
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
  if (holidaysCache.some(h => h.holidayDate === leaveHolidayDate.value)) {
    leaveHolidaysError.textContent = 'A holiday on this date already exists.';
    leaveHolidaysError.hidden = false;
    return;
  }
  addHolidayBtn.disabled = true;
  try {
    await addDoc(businessCollection('publicHolidays'), {
      holidayDate: leaveHolidayDate.value,
      name: leaveHolidayName.value.trim(),
      createdAt: new Date().toISOString()
    });
    leaveHolidayDate.value = '';
    leaveHolidayName.value = '';
    await loadCoreLeaveData({ force: true });
    renderHolidaysTable();
  } catch (err) {
    leaveHolidaysError.textContent = err.message || 'Could not add this holiday.';
    leaveHolidaysError.hidden = false;
  } finally {
    addHolidayBtn.disabled = false;
  }
});

leaveHolidaysTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.leave-holiday-delete-btn');
  if (!btn) return;
  const holiday = holidaysCache.find(h => h.id === btn.dataset.id);
  openLeaveConfirm({
    title: 'Delete public holiday?',
    message: holiday ? `"${holiday.name}" (${holiday.holidayDate}) will be removed and no longer excluded from leave-day counts.` : 'This holiday will be removed and no longer excluded from leave-day counts.',
    onConfirm: async () => {
      await deleteDoc(businessDoc('publicHolidays', btn.dataset.id));
      await loadCoreLeaveData({ force: true });
      renderHolidaysTable();
    }
  });
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
  const candidates = commonKenyanHolidays(year).filter(h => !holidaysCache.some(existing => existing.holidayDate === h.date));
  if (!candidates.length) {
    leaveHolidaysError.textContent = 'All common holidays for this year are already on the list.';
    leaveHolidaysError.hidden = false;
    return;
  }
  seedHolidaysBtn.disabled = true;
  try {
    await Promise.all(candidates.map(h => addDoc(businessCollection('publicHolidays'), {
      holidayDate: h.date, name: h.name, createdAt: new Date().toISOString()
    })));
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
    .filter(a => a.status === 'approved' && a.startDate <= dateStr && a.endDate >= dateStr)
    .map(a => employeesCache.find(e => e.id === a.employeeId))
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
    const holiday = holidaysCache.find(h => h.holidayDate === dateStr);
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
    .filter(e => !subDept || e.subDepartment === subDept)
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
      <td>${emp.jobPosition || '—'}</td>
      <td>${emp.department || '—'}</td>
      ${leaveTypesCache.map(t => {
        const b = computeLeaveBalanceBreakdown(emp, t, asOf);
        const hasAdjustments = adjustmentsCache.some(a => a.employeeId === emp.id && a.leaveTypeId === t.id);
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
  const businessName = settingsCache?.businessName || 'Business name not set';
  const logoUrl = settingsCache?.businessLogoUrl || '';
  const deptLabel = leaveBalancesDept.value || 'All departments';
  const subDeptLabel = leaveBalancesSubDept.value || 'All sub departments';

  const rows = employees.map(emp => ({
    leading: [employeeName(emp), emp.jobPosition || '—', emp.department || '—'],
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
        <div class="muster-header-top">
          ${logoUrl ? `<img class="muster-logo" src="${logoUrl}" alt="" />` : ''}
          <div class="muster-business-name">${businessName}</div>
        </div>
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

printLeaveBalancesBtn.addEventListener('click', async () => {
  if (!(await requireReportPasscode())) return;
  const wrap = document.getElementById('leaveBalancePrintWrap');
  wrap.innerHTML = buildLeaveBalancesPrintHtml();
  applyPrintWatermark(wrap);

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

// Never hands the report to the browser for a local save -- relayed
// server-side straight to the signed-in owner's own registered email
// (api/email-report.js determines the recipient itself from the auth
// token, so this can't be pointed at an arbitrary address).
emailLeaveBalancesBtn.addEventListener('click', async () => {
  leaveBalancesError.hidden = true;
  leaveBalancesInfo.hidden = true;
  if (!(await requireReportPasscode())) return;
  emailLeaveBalancesBtn.disabled = true;
  try {
    const container = document.createElement('div');
    container.innerHTML = buildLeaveBalancesPrintHtml();
    applyPrintWatermark(container);
    await callFunction('/api/email-report', { subject: 'Leave balances report', html: container.innerHTML });
    leaveBalancesInfo.textContent = 'Leave balances report emailed to your registered email address.';
    leaveBalancesInfo.hidden = false;
  } catch (err) {
    leaveBalancesError.textContent = err.message || 'Could not email this report.';
    leaveBalancesError.hidden = false;
  } finally {
    emailLeaveBalancesBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Manual balance adjustments
// ---------------------------------------------------------------------

function renderAdjustmentHistory() {
  const { employeeId, leaveTypeId } = currentAdjustmentTarget;
  const rows = adjustmentsCache
    .filter(a => a.employeeId === employeeId && a.leaveTypeId === leaveTypeId)
    .sort((a, b) => (a.adjustmentDate < b.adjustmentDate ? 1 : -1));

  leaveAdjustHistory.innerHTML = rows.length
    ? rows.map(a => `
        <div class="leave-adjust-history-row">
          <div>
            <strong>${a.days > 0 ? '+' : ''}${a.days} day${Math.abs(a.days) === 1 ? '' : 's'}</strong>
            <span>${a.adjustmentDate}${a.reason ? ` &middot; ${a.reason}` : ''}</span>
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
    await addDoc(businessCollection('leaveBalanceAdjustments'), {
      employeeId: currentAdjustmentTarget.employeeId,
      leaveTypeId: currentAdjustmentTarget.leaveTypeId,
      adjustmentDate: leaveAdjustDate.value,
      days,
      reason: leaveAdjustReason.value.trim() || null,
      createdAt: new Date().toISOString()
    });

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

leaveAdjustHistory.addEventListener('click', event => {
  const btn = event.target.closest('.leave-adjust-delete-btn');
  if (!btn || !currentAdjustmentTarget) return;
  const { employeeId, leaveTypeId } = currentAdjustmentTarget;
  const adjustment = adjustmentsCache.find(a => a.id === btn.dataset.id);
  const amount = adjustment ? `${adjustment.days > 0 ? '+' : ''}${adjustment.days} day${Math.abs(adjustment.days) === 1 ? '' : 's'} (${adjustment.adjustmentDate})` : 'This adjustment';
  openLeaveConfirm({
    title: 'Delete this adjustment?',
    message: `${amount} will be permanently removed and the balance recalculated.`,
    onConfirm: async () => {
      await deleteDoc(businessDoc('leaveBalanceAdjustments', btn.dataset.id));
      await loadCoreLeaveData({ force: true });
      renderBalancesTable();
      openAdjustmentModal(employeeId, leaveTypeId);
    }
  });
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
