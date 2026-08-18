import { auth, db, callFunction } from './auth.js';
import { requireReportPasscode } from './reportPasscode.js';
import { applyPrintWatermark } from './watermark.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const { earningComponents, classificationLabels, toNumber, money, rawMoney, computePayroll } = window.PayrollShared;

// Shared with employeePortal.js so an employee viewing/printing their own
// payslip reuses this exact print path (it already renders into the
// shared, page-agnostic #payslipPrintWrap DOM and needs no owner-only
// state) instead of duplicating the payslip-breakdown math.
export { printPayslip };

function businessDoc(...pathSegments) {
  return doc(db, 'businesses', auth.currentUser.uid, ...pathSegments);
}
function businessCollection(...pathSegments) {
  return collection(db, 'businesses', auth.currentUser.uid, ...pathSegments);
}

const listView = document.getElementById('payrollListView');
const newView = document.getElementById('payrollNewView');
const detailView = document.getElementById('payrollDetailView');

const newPayrollRunBtn = document.getElementById('newPayrollRunBtn');
const refreshPayrollBtn = document.getElementById('refreshPayrollBtn');
const syncPayrollEmployeesBtn = document.getElementById('syncPayrollEmployeesBtn');
const payrollRunsTableBody = document.getElementById('payrollRunsTableBody');
const payrollRunsEmptyState = document.getElementById('payrollRunsEmptyState');

const payrollNewTitle = document.getElementById('payrollNewTitle');
const payrollNewBackBtn = document.getElementById('payrollNewBackBtn');
const payrollNewError = document.getElementById('payrollNewError');
const payrollPeriodLabel = document.getElementById('payrollPeriodLabel');
const payrollPeriodStart = document.getElementById('payrollPeriodStart');
const payrollPeriodEnd = document.getElementById('payrollPeriodEnd');
const payrollEligibleList = document.getElementById('payrollEligibleList');
const payrollTerminatedList = document.getElementById('payrollTerminatedList');
const payrollExcludedList = document.getElementById('payrollExcludedList');
const createPayrollRunBtn = document.getElementById('createPayrollRunBtn');
const createPayrollRunBtnText = document.getElementById('createPayrollRunBtnText');

const payrollDetailBackBtn = document.getElementById('payrollDetailBackBtn');
const payrollDetailTitle = document.getElementById('payrollDetailTitle');
const payrollDetailError = document.getElementById('payrollDetailError');
const payrollDetailInfo = document.getElementById('payrollDetailInfo');
const payrollDetailStatus = document.getElementById('payrollDetailStatus');
const payrollAwaitingApproval = document.getElementById('payrollAwaitingApproval');
const payrollDetailSummary = document.getElementById('payrollDetailSummary');
const payrollDetailTableBody = document.getElementById('payrollDetailTableBody');
const approveRunBtn = document.getElementById('approveRunBtn');
const submitForApprovalBtn = document.getElementById('submitForApprovalBtn');
const processRunBtn = document.getElementById('processRunBtn');
const recalcRunBtn = document.getElementById('recalcRunBtn');
const syncEmployeeNumbersBtn = document.getElementById('syncEmployeeNumbersBtn');
const editRunBtn = document.getElementById('editRunBtn');
const recallRunBtn = document.getElementById('recallRunBtn');
const musterRollBtn = document.getElementById('musterRollBtn');
const musterRollEmailBtn = document.getElementById('musterRollEmailBtn');

let payrollRunsLoaded = false;
let currentRunId = null;
let currentRunStatus = null;
let currentRunMeta = null;
let currentRunPayslips = [];
let editingRunId = null;
let employeesCache = [];

function settingsFromRow(row) {
  return {
    nssfRate: row.nssfRate,
    nssfUpperLimit: row.nssfUpperLimit,
    shifRate: row.shifRate,
    shifMinimum: row.shifMinimum,
    ahlEmployeeRate: row.ahlEmployeeRate,
    ahlEmployerRate: row.ahlEmployerRate,
    personalRelief: row.personalRelief,
    nitaLevy: row.nitaLevy,
    insuranceReliefCap: row.insuranceReliefCap,
    telephoneThreshold: row.telephoneThreshold,
    mealsThreshold: row.mealsThreshold,
    allowableDeductionCap: row.allowableDeductionCap,
    perDiemThreshold: row.perDiemThreshold,
    daysInMonth: row.daysInMonth,
    secondaryFlatRate: row.secondaryFlatRate,
    contractorWhtRate: row.contractorWhtRate,
    pwdExemption: row.pwdExemption,
    businessName: row.businessName
  };
}

// A component with no dated employeeCompensationItems entries at all
// keeps using the flat employees.compensation value, unchanged — dated
// entries only take over (summed, for whichever ones overlap the pay
// period) once at least one exists for that employee + component, so
// employees nobody has migrated to dated entries are unaffected.
function resolveComponentAmount(items, employeeId, componentKey, periodStart, periodEnd, legacyAmount) {
  const matches = items.filter(i => i.employeeId === employeeId && i.componentKey === componentKey);
  if (!matches.length) return legacyAmount;
  return matches
    .filter(i => i.startDate <= periodEnd && (!i.endDate || i.endDate >= periodStart))
    .reduce((sum, i) => sum + toNumber(i.amount), 0);
}

function valuesFromEmployee(employee, compensationItems = [], periodStart, periodEnd) {
  const comp = employee.compensation || {};
  const resolve = (key, legacy) => resolveComponentAmount(compensationItems, employee.id, key, periodStart, periodEnd, toNumber(legacy));

  const values = {};
  earningComponents.forEach(item => { values[item.id] = resolve(item.id, comp[item.id]); });
  values.basicPay = resolve('basicPay', comp.basicPay);
  values.employeePensionRate = resolve('employeePensionRate', comp.employeePensionRate);
  values.employerPensionRate = resolve('employerPensionRate', comp.employerPensionRate);
  values.lifeInsurance = resolve('lifeInsurance', comp.lifeInsurance);
  values.educationInsurance = resolve('educationInsurance', comp.educationInsurance);
  values.otherDeductions = resolve('otherDeductions', comp.otherDeductions);
  return values;
}

function togglesFromEmployee(employee) {
  const stored = employee.statutoryToggles || {};
  const toggles = {};
  earningComponents.forEach(item => {
    const saved = stored[item.id] || {};
    toggles[item.id] = { nssf: !!saved.nssf, shif: !!saved.shif, ahl: !!saved.ahl };
  });
  return toggles;
}

// Merges per-field over the defaults rather than an all-or-nothing "doc
// exists? use it as-is" check -- a settings doc that exists but is
// missing some of these fields (e.g. one only ever touched by
// api/admin-update-business.js, which merge-writes just businessName)
// would otherwise pass individual `undefined`s straight into
// computePayroll(), which Firestore's set()/batch writes then reject
// outright ("Unsupported field value: undefined") the moment a payroll
// run tries to save.
function runSettingsDefaults() {
  return {
    nssfRate: 6, nssfUpperLimit: 108000, shifRate: 2.75, shifMinimum: 300,
    ahlEmployeeRate: 1.5, ahlEmployerRate: 1.5, personalRelief: 2400, nitaLevy: 50,
    insuranceReliefCap: 5000, telephoneThreshold: 5000, mealsThreshold: 5000,
    allowableDeductionCap: 30000, perDiemThreshold: 10000, daysInMonth: 30,
    secondaryFlatRate: 35, contractorWhtRate: 5, pwdExemption: 150000
  };
}

async function loadRunSettings() {
  const snap = await getDoc(businessDoc('settings', 'main'));
  return settingsFromRow({ ...runSettingsDefaults(), ...(snap.exists() ? snap.data() : {}) });
}

function computePayslipRow({ runId, employee, isFinalDues, settings, compensationItems, periodStart, periodEnd }) {
  const values = valuesFromEmployee(employee, compensationItems, periodStart, periodEnd);
  const toggles = togglesFromEmployee(employee);
  const results = computePayroll({ classification: employee.employeeType, basicPay: values.basicPay, values, toggles, settings });

  return {
    payrollRunId: runId,
    employeeId: employee.id,
    employeeSnapshot: {
      first_name: employee.firstName, last_name: employee.lastName,
      job_position: employee.jobPosition, department: employee.department,
      employee_type: employee.employeeType, employee_number: employee.employeeNumber
    },
    compensationSnapshot: { ...values, toggles },
    results,
    isFinalDues,
    createdAt: new Date().toISOString()
  };
}

// Two payroll runs for the same business cannot share a period label,
// and their date ranges cannot overlap at all (not just match exactly)
// -- an employee's pay would otherwise land in two runs at once.
// excludeRunId lets an edit-in-place check against every *other* run
// without conflicting with itself.
async function findConflictingRun({ periodStart, periodEnd, periodLabel, excludeRunId }) {
  const snap = await getDocs(businessCollection('payrollRuns'));
  const runs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const normalizedLabel = periodLabel.trim().toLowerCase();
  return runs.find(run => {
    if (run.id === excludeRunId) return false;
    if (run.periodLabel.trim().toLowerCase() === normalizedLabel) return true;
    // Two [start, end] ranges overlap unless one ends before the other starts.
    if (periodStart <= run.periodEnd && run.periodStart <= periodEnd) return true;
    return false;
  });
}

function showListView() {
  listView.hidden = false;
  newView.hidden = true;
  detailView.hidden = true;
  loadPayrollRuns();
}

async function loadPayrollRuns() {
  payrollRunsLoaded = true;
  try {
    const snap = await getDocs(query(businessCollection('payrollRuns'), orderBy('createdAt', 'desc')));
    const runs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    payrollRunsEmptyState.hidden = runs.length > 0;
    payrollRunsEmptyState.textContent = 'No payroll runs yet.';

    const rows = await Promise.all(runs.map(async run => {
      const payslipsSnap = await getDocs(query(businessCollection('payslips'), where('payrollRunId', '==', run.id)));
      const payslips = payslipsSnap.docs.map(d => d.data());
      const totalNet = payslips.reduce((sum, p) => sum + (p.results?.netPay || 0), 0);
      return `
        <tr data-id="${run.id}">
          <td>${run.periodLabel}</td>
          <td><span class="status-pill status-${run.status === 'processed' ? 'active' : 'terminated'}">${run.status}</span></td>
          <td>${payslips.length}</td>
          <td>${money(totalNet)}</td>
          <td><button type="button" class="ghost-button payroll-run-open-btn" data-id="${run.id}">Open</button></td>
        </tr>
      `;
    }));
    payrollRunsTableBody.innerHTML = rows.join('');
  } catch {
    payrollRunsTableBody.innerHTML = '';
    payrollRunsEmptyState.hidden = false;
    payrollRunsEmptyState.textContent = 'Could not load payroll runs.';
  }
}

async function syncEmployees() {
  const snap = await getDocs(query(businessCollection('employees'), orderBy('firstName')));
  employeesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderEligibilityLists();
}

newPayrollRunBtn.addEventListener('click', async () => {
  editingRunId = null;
  payrollNewTitle.textContent = 'New payroll run';
  createPayrollRunBtnText.textContent = 'Create draft run';
  payrollNewError.hidden = true;
  payrollPeriodLabel.value = '';
  payrollPeriodStart.value = '';
  payrollPeriodEnd.value = '';
  listView.hidden = true;
  newView.hidden = false;

  await syncEmployees();
});

refreshPayrollBtn.addEventListener('click', async () => {
  refreshPayrollBtn.disabled = true;
  try {
    await loadPayrollRuns();
  } finally {
    refreshPayrollBtn.disabled = false;
  }
});

syncPayrollEmployeesBtn.addEventListener('click', async () => {
  syncPayrollEmployeesBtn.disabled = true;
  try {
    await syncEmployees();
  } finally {
    syncPayrollEmployeesBtn.disabled = false;
  }
});

payrollPeriodEnd.addEventListener('change', renderEligibilityLists);

// Defaults the period to a full calendar month -- built from the y/m/d
// parts directly rather than new Date(...).toISOString(), which reports
// UTC and would roll the date back a day in Kenya's UTC+3 timezone.
payrollPeriodStart.addEventListener('change', () => {
  if (!payrollPeriodStart.value) return;
  const [y, m] = payrollPeriodStart.value.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  payrollPeriodEnd.value = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  renderEligibilityLists();
});

function renderEligibilityLists() {
  const periodEnd = payrollPeriodEnd.value;
  const eligible = [];
  const terminated = [];
  const excluded = [];

  employeesCache.forEach(emp => {
    if (emp.status === 'terminated') {
      terminated.push(emp);
      return;
    }
    if (!emp.contractStartDate) {
      excluded.push({ emp, reason: 'No contract start date on file' });
      return;
    }
    if (periodEnd && emp.contractStartDate > periodEnd) {
      excluded.push({ emp, reason: `Contract starts ${emp.contractStartDate}, after this period` });
      return;
    }
    eligible.push(emp);
  });

  payrollEligibleList.innerHTML = eligible.length
    ? eligible.map(emp => `
        <label class="payroll-employee-row">
          <input type="checkbox" data-employee-id="${emp.id}" checked />
          <span class="employee-name">${emp.firstName} ${emp.lastName}</span>
          <span class="employee-reason">${classificationLabels[emp.employeeType] || emp.employeeType}</span>
        </label>
      `).join('')
    : '<p class="hint">No eligible employees.</p>';

  payrollTerminatedList.innerHTML = terminated.length
    ? terminated.map(emp => `
        <label class="payroll-employee-row">
          <input type="checkbox" data-employee-id="${emp.id}" data-final-dues="true" />
          <span class="employee-name">${emp.firstName} ${emp.lastName}</span>
          <span class="employee-reason">Terminated ${emp.terminationDate || ''}</span>
        </label>
      `).join('')
    : '<p class="hint">No terminated employees.</p>';

  payrollExcludedList.innerHTML = excluded.length
    ? excluded.map(({ emp, reason }) => `
        <div class="payroll-employee-row is-excluded">
          <span class="employee-name">${emp.firstName} ${emp.lastName}</span>
          <span class="employee-reason">${reason}</span>
        </div>
      `).join('')
    : '<p class="hint">None excluded.</p>';
}

payrollNewBackBtn.addEventListener('click', () => {
  editingRunId = null;
  showListView();
});

createPayrollRunBtn.addEventListener('click', async () => {
  payrollNewError.hidden = true;

  if (!payrollPeriodStart.value || !payrollPeriodEnd.value) {
    payrollNewError.textContent = 'Period start and end dates are both required.';
    payrollNewError.hidden = false;
    return;
  }
  if (payrollPeriodEnd.value < payrollPeriodStart.value) {
    payrollNewError.textContent = 'Period end must be on or after period start.';
    payrollNewError.hidden = false;
    return;
  }

  const selected = [
    ...payrollEligibleList.querySelectorAll('input[type="checkbox"]:checked'),
    ...payrollTerminatedList.querySelectorAll('input[type="checkbox"]:checked')
  ];

  if (!selected.length) {
    payrollNewError.textContent = 'Select at least one employee for this run.';
    payrollNewError.hidden = false;
    return;
  }

  const periodLabel = payrollPeriodLabel.value.trim() || `${payrollPeriodStart.value} to ${payrollPeriodEnd.value}`;

  const conflict = await findConflictingRun({
    periodStart: payrollPeriodStart.value,
    periodEnd: payrollPeriodEnd.value,
    periodLabel,
    excludeRunId: editingRunId
  });
  if (conflict) {
    const isLabelClash = conflict.periodLabel.trim().toLowerCase() === periodLabel.trim().toLowerCase();
    payrollNewError.textContent = isLabelClash
      ? `Another payroll run already uses the label "${conflict.periodLabel}".`
      : `This period overlaps with an existing run ("${conflict.periodLabel}", ${conflict.periodStart} to ${conflict.periodEnd}).`;
    payrollNewError.hidden = false;
    return;
  }

  createPayrollRunBtn.disabled = true;
  try {
    const settings = await loadRunSettings();

    let runId = editingRunId;
    if (editingRunId) {
      await updateDoc(businessDoc('payrollRuns', editingRunId), {
        periodLabel,
        periodStart: payrollPeriodStart.value,
        periodEnd: payrollPeriodEnd.value
      });
      const oldPayslipsSnap = await getDocs(query(businessCollection('payslips'), where('payrollRunId', '==', editingRunId)));
      const deleteBatch = writeBatch(db);
      oldPayslipsSnap.docs.forEach(d => deleteBatch.delete(d.ref));
      await deleteBatch.commit();
    } else {
      const runRef = await addDoc(businessCollection('payrollRuns'), {
        periodLabel,
        periodStart: payrollPeriodStart.value,
        periodEnd: payrollPeriodEnd.value,
        status: 'draft',
        createdAt: new Date().toISOString(),
        approvedAt: null,
        processedAt: null
      });
      runId = runRef.id;
    }

    const selectedEmployeeIds = selected.map(checkbox => checkbox.dataset.employeeId);
    const itemsSnap = await getDocs(businessCollection('employeeCompensationItems'));
    const compensationItems = itemsSnap.docs.map(d => d.data()).filter(i => selectedEmployeeIds.includes(i.employeeId));

    const payslipRows = selected.map(checkbox => {
      const employee = employeesCache.find(e => e.id === checkbox.dataset.employeeId);
      const isFinalDues = checkbox.dataset.finalDues === 'true';
      return computePayslipRow({
        runId, employee, isFinalDues, settings,
        compensationItems,
        periodStart: payrollPeriodStart.value, periodEnd: payrollPeriodEnd.value
      });
    });

    const insertBatch = writeBatch(db);
    payslipRows.forEach(row => insertBatch.set(doc(businessCollection('payslips')), row));
    await insertBatch.commit();

    editingRunId = null;
    await openRun(runId);
  } catch (err) {
    payrollNewError.textContent = err.message || 'Could not save this payroll run.';
    payrollNewError.hidden = false;
  } finally {
    createPayrollRunBtn.disabled = false;
  }
});

async function openRun(runId) {
  currentRunId = runId;
  currentRunStatus = null;
  payrollDetailError.hidden = true;
  listView.hidden = true;
  newView.hidden = true;
  detailView.hidden = false;

  const runSnap = await getDoc(businessDoc('payrollRuns', runId));
  if (!runSnap.exists()) {
    payrollDetailError.textContent = 'Could not load this payroll run.';
    payrollDetailError.hidden = false;
    return;
  }
  const run = { id: runSnap.id, ...runSnap.data() };

  const payslipsSnap = await getDocs(query(businessCollection('payslips'), where('payrollRunId', '==', runId)));
  const rows = payslipsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  payrollDetailTitle.textContent = run.periodLabel;
  payrollDetailStatus.textContent = `Status: ${run.status}${run.status === 'approved' ? ` — approved ${new Date(run.approvedAt).toLocaleDateString()}` : ''}${run.status === 'processed' ? ` — processed ${new Date(run.processedAt).toLocaleDateString()}` : ''}`;

  const totals = rows.reduce((acc, p) => {
    acc.gross += p.results?.displayGross || 0;
    acc.paye += p.results?.paye || 0;
    acc.net += p.results?.netPay || 0;
    return acc;
  }, { gross: 0, paye: 0, net: 0 });

  payrollDetailSummary.innerHTML = `
    <div><span>Employees</span><strong>${rows.length}</strong></div>
    <div><span>Total gross</span><strong>${money(totals.gross)}</strong></div>
    <div><span>Total PAYE / WHT</span><strong>${money(totals.paye)}</strong></div>
    <div><span>Total net pay</span><strong>${money(totals.net)}</strong></div>
  `;

  payrollDetailTableBody.innerHTML = rows.map(p => `
    <tr class="payroll-detail-row" data-payslip-id="${p.id}">
      <td>${p.employeeSnapshot.employee_number || '—'}</td>
      <td><svg class="row-expand-icon" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>${p.employeeSnapshot.first_name} ${p.employeeSnapshot.last_name}${p.isFinalDues ? ' <small>(final dues)</small>' : ''}</td>
      <td>${classificationLabels[p.employeeSnapshot.employee_type] || p.employeeSnapshot.employee_type}</td>
      <td>${money(p.results.displayGross)}</td>
      <td>${money(p.results.paye)}</td>
      <td>${money(p.results.netPay)}</td>
      <td>
        <button type="button" class="ghost-button payslip-print-btn" data-payslip-id="${p.id}">Payslip</button>
        <button type="button" class="ghost-button payslip-email-btn" data-payslip-id="${p.id}">Email</button>
      </td>
    </tr>
  `).join('');
  payrollDetailTableBody.dataset.payslips = JSON.stringify(rows.map(p => ({ id: p.id, employee_snapshot: p.employeeSnapshot, compensation_snapshot: p.compensationSnapshot, results: p.results, period_label: run.periodLabel })));

  currentRunStatus = run.status;
  currentRunMeta = { ...run, period_label: run.periodLabel, period_start: run.periodStart, period_end: run.periodEnd };
  currentRunPayslips = rows.map(p => ({ ...p, employee_snapshot: p.employeeSnapshot, compensation_snapshot: p.compensationSnapshot, is_final_dues: p.isFinalDues }));
  approveRunBtn.hidden = run.status !== 'draft';
  processRunBtn.hidden = run.status !== 'approved';
  recalcRunBtn.hidden = run.status !== 'draft';
  editRunBtn.hidden = run.status !== 'draft';
  recallRunBtn.hidden = run.status === 'draft';
  recallRunBtn.textContent = run.status === 'processed' ? 'Recall to approved' : 'Recall to draft';
  musterRollBtn.hidden = run.status === 'draft';
  musterRollEmailBtn.hidden = run.status === 'draft';

  await applyApprovalWorkflowUi(run);
}

// When an active payroll approval workflow exists, the owner's direct
// Approve button is replaced by "Submit for approval" + a status line --
// approval power moves entirely to the appointed approvers (see
// api/record-approval-decision.js). With no active workflow,
// approveRunBtn's own draft-only visibility above is left completely
// alone.
async function applyApprovalWorkflowUi(run) {
  submitForApprovalBtn.hidden = true;
  payrollAwaitingApproval.hidden = true;
  if (run.status !== 'draft') return;

  const workflowSnap = await getDoc(businessDoc('approvalWorkflows', 'payroll_run'));
  if (!workflowSnap.exists() || !workflowSnap.data().isActive) return;

  approveRunBtn.hidden = true;

  const actionsSnap = await getDocs(query(
    businessCollection('approvalActions'),
    where('actionType', '==', 'payroll_run'),
    where('recordId', '==', run.id)
  ));
  const actions = actionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!actions.length) {
    submitForApprovalBtn.hidden = false;
    return;
  }

  const employeeIds = [...new Set(actions.map(a => a.employeeId))];
  const approverSnaps = await Promise.all(employeeIds.map(id => getDoc(businessDoc('employees', id))));
  const nameById = new Map(approverSnaps.filter(s => s.exists()).map(s => [s.id, `${s.data().firstName} ${s.data().lastName}`]));

  const rejected = actions.find(a => a.decision === 'rejected');
  const pending = actions.filter(a => a.decision === 'pending').map(a => nameById.get(a.employeeId) || 'Unknown');

  if (rejected) {
    payrollAwaitingApproval.textContent = `Rejected by ${nameById.get(rejected.employeeId) || 'an approver'}${rejected.comment ? `: "${rejected.comment}"` : ''}. Edit and resubmit.`;
    submitForApprovalBtn.hidden = false;
  } else if (pending.length) {
    payrollAwaitingApproval.textContent = `Awaiting approval from: ${pending.join(', ')}.`;
  } else {
    payrollAwaitingApproval.textContent = 'All approvers have signed off.';
  }
  payrollAwaitingApproval.hidden = false;
}

submitForApprovalBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  submitForApprovalBtn.disabled = true;
  payrollDetailError.hidden = true;
  try {
    await callFunction('/api/submit-for-approval', { actionType: 'payroll_run', recordId: currentRunId });
    await openRun(currentRunId);
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not submit this run for approval.';
    payrollDetailError.hidden = false;
  } finally {
    submitForApprovalBtn.disabled = false;
  }
});

payrollRunsTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.payroll-run-open-btn');
  if (btn) openRun(btn.dataset.id);
});

payrollDetailBackBtn.addEventListener('click', showListView);

approveRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  try {
    await updateDoc(businessDoc('payrollRuns', currentRunId), { status: 'approved', approvedAt: new Date().toISOString() });
  } catch (err) {
    payrollDetailError.textContent = err.message;
    payrollDetailError.hidden = false;
    return;
  }
  openRun(currentRunId);
});

processRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  try {
    await updateDoc(businessDoc('payrollRuns', currentRunId), { status: 'processed', processedAt: new Date().toISOString() });
  } catch (err) {
    payrollDetailError.textContent = err.message;
    payrollDetailError.hidden = false;
    return;
  }
  openRun(currentRunId);
});

recallRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  const patch = currentRunStatus === 'processed'
    ? { status: 'approved', processedAt: null }
    : { status: 'draft', approvedAt: null };
  try {
    await updateDoc(businessDoc('payrollRuns', currentRunId), patch);
  } catch (err) {
    payrollDetailError.textContent = err.message;
    payrollDetailError.hidden = false;
    return;
  }
  openRun(currentRunId);
});

recalcRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  recalcRunBtn.disabled = true;
  payrollDetailError.hidden = true;
  try {
    const payslipsSnap = await getDocs(query(businessCollection('payslips'), where('payrollRunId', '==', currentRunId)));
    const payslips = payslipsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const employeeIds = [...new Set(payslips.map(p => p.employeeId).filter(Boolean))];
    const employeeSnaps = await Promise.all(employeeIds.map(id => getDoc(businessDoc('employees', id))));
    const employeeById = new Map(employeeSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() }]));

    const itemsSnap = await getDocs(businessCollection('employeeCompensationItems'));
    const compensationItems = itemsSnap.docs.map(d => d.data()).filter(i => employeeIds.includes(i.employeeId));

    const settings = await loadRunSettings();

    for (const payslip of payslips) {
      const employee = employeeById.get(payslip.employeeId);
      if (!employee) continue;
      const row = computePayslipRow({
        runId: currentRunId, employee, isFinalDues: payslip.isFinalDues, settings,
        compensationItems,
        periodStart: currentRunMeta?.period_start, periodEnd: currentRunMeta?.period_end
      });
      await updateDoc(businessDoc('payslips', payslip.id), {
        employeeSnapshot: row.employeeSnapshot,
        compensationSnapshot: row.compensationSnapshot,
        results: row.results
      });
    }

    await openRun(currentRunId);
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not sync this payroll run.';
    payrollDetailError.hidden = false;
  } finally {
    recalcRunBtn.disabled = false;
  }
});

// Unlike "Sync payroll" (draft-only, recomputes pay), this only refreshes
// employeeSnapshot.employee_number -- never compensationSnapshot/results
// -- so it's safe to run on approved/processed runs without reopening the
// locked financial figures to recomputation.
syncEmployeeNumbersBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  syncEmployeeNumbersBtn.disabled = true;
  payrollDetailError.hidden = true;
  payrollDetailInfo.hidden = true;
  try {
    const payslipsSnap = await getDocs(query(businessCollection('payslips'), where('payrollRunId', '==', currentRunId)));
    const payslips = payslipsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const employeeIds = [...new Set(payslips.map(p => p.employeeId).filter(Boolean))];
    const employeeSnaps = await Promise.all(employeeIds.map(id => getDoc(businessDoc('employees', id))));
    const employeeById = new Map(employeeSnaps.filter(s => s.exists()).map(s => [s.id, { id: s.id, ...s.data() }]));

    // Employees added before the numbering feature (or never manually
    // backfilled via Employees > Assign missing numbers) can still have
    // employeeNumber = null -- assign one now instead of requiring a
    // separate trip there first.
    for (const employee of employeeById.values()) {
      if (employee.employeeNumber) continue;
      const { employeeNumber } = await callFunction('/api/next-employee-number');
      await updateDoc(businessDoc('employees', employee.id), { employeeNumber });
      employee.employeeNumber = employeeNumber;
    }

    let synced = 0;
    for (const payslip of payslips) {
      const employee = employeeById.get(payslip.employeeId);
      if (!employee || payslip.employeeSnapshot?.employee_number === employee.employeeNumber) continue;
      await updateDoc(businessDoc('payslips', payslip.id), {
        employeeSnapshot: { ...payslip.employeeSnapshot, employee_number: employee.employeeNumber }
      });
      synced += 1;
    }

    payrollDetailInfo.textContent = synced
      ? `Synced employee numbers on ${synced} payslip${synced === 1 ? '' : 's'}.`
      : 'Employee numbers were already up to date.';
    payrollDetailInfo.hidden = false;
    await openRun(currentRunId);
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not sync employee numbers.';
    payrollDetailError.hidden = false;
  } finally {
    syncEmployeeNumbersBtn.disabled = false;
  }
});

editRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  editRunBtn.disabled = true;
  try {
    const runSnap = await getDoc(businessDoc('payrollRuns', currentRunId));
    if (!runSnap.exists()) throw new Error('Could not load this payroll run.');
    const run = { id: runSnap.id, ...runSnap.data() };
    const payslipsSnap = await getDocs(query(businessCollection('payslips'), where('payrollRunId', '==', currentRunId)));
    const payslips = payslipsSnap.docs.map(d => d.data());

    editingRunId = run.id;
    payrollNewTitle.textContent = `Edit ${run.periodLabel}`;
    createPayrollRunBtnText.textContent = 'Save changes';
    payrollNewError.hidden = true;
    payrollPeriodLabel.value = run.periodLabel;
    payrollPeriodStart.value = run.periodStart;
    payrollPeriodEnd.value = run.periodEnd;
    listView.hidden = true;
    detailView.hidden = true;
    newView.hidden = false;

    await syncEmployees();

    const selectedIds = new Set(payslips.map(p => p.employeeId));
    [...payrollEligibleList.querySelectorAll('input[type="checkbox"]'), ...payrollTerminatedList.querySelectorAll('input[type="checkbox"]')]
      .forEach(checkbox => { checkbox.checked = selectedIds.has(checkbox.dataset.employeeId); });
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not open this run for editing.';
    payrollDetailError.hidden = false;
  } finally {
    editRunBtn.disabled = false;
  }
});

// Single source of truth for a payslip's line items, shared by the
// printable payslip and the inline "expand a row" breakdown below.
// Each row carries `highlight` (always kept, even at zero — it's a
// subtotal like Gross/PAYE/Net) vs. a plain line item (hidden when
// its value rounds to zero, so an unused benefit/deduction doesn't
// clutter the breakdown).
function payslipBreakdownSections(payslip) {
  const r = payslip.results;
  const emp = payslip.employee_snapshot;
  const comp = payslip.compensation_snapshot || {};
  const isContractor = emp.employee_type === 'contractor';

  const earnings = [
    { label: 'Basic pay', value: comp.basicPay || 0 },
    { label: 'Direct allowances', value: r.directAllowances },
    { label: 'Cash allowances breakdown total', value: r.cashAllowances },
    { label: 'Taxable benefits used', value: r.taxableBenefits },
    { label: 'Gross pay displayed', value: r.displayGross, highlight: true }
  ];

  const taxRows = isContractor
    ? [{ label: 'WHT', value: r.wht, highlight: true }]
    : [
        { label: 'Income tax before reliefs', value: r.incomeTax },
        { label: 'Personal relief', value: r.appliedPersonalRelief },
        { label: 'Insurance relief', value: r.insuranceRelief },
        { label: 'PAYE payable', value: r.paye, highlight: true },
        { label: 'WHT', value: r.wht }
      ];
  const statutoryBaseRows = isContractor ? [] : [
    { label: 'PWD exempt amount applied', value: r.pwdReductionApplied },
    { label: 'NSSF Base', value: r.nssfBase },
    { label: 'SHIF Base', value: r.shifBase },
    { label: 'AHL Base', value: r.ahlBase }
  ];

  const deductions = [
    ...statutoryBaseRows,
    { label: 'NSSF employee', value: r.nssfEmployee },
    { label: 'SHIF employee', value: r.shif },
    { label: 'AHL employee', value: r.ahlEmployee },
    { label: 'Employee pension', value: r.employeePension },
    { label: 'NSSF + pension allowable deductions', value: r.nssfPensionAllowable, highlight: true },
    { label: 'Total tax-deductible statutory deductions', value: r.totalTaxAllowableDeductions },
    ...taxRows,
    { label: 'Insurance premiums deducted', value: r.insurancePremiums },
    { label: 'Other deductions', value: r.otherDeductions }
  ];

  const employer = [
    { label: 'NSSF employer', value: r.nssfEmployer },
    { label: 'AHL employer', value: r.ahlEmployer },
    { label: 'Employer pension', value: r.employerPension },
    { label: 'NITA levy', value: r.nitaLevy },
    { label: 'Total employer cost add-ons', value: r.nssfEmployer + r.ahlEmployer + r.employerPension + r.nitaLevy, highlight: true }
  ];

  return {
    header: {
      title: `${emp.first_name} ${emp.last_name} — ${payslip.period_label || ''}`,
      subtitle: [emp.job_position, emp.department, classificationLabels[emp.employee_type]].filter(Boolean).join(' · '),
      employeeNumber: emp.employee_number ? `Employee #: ${emp.employee_number}` : '',
      netPay: r.netPay,
      rate: `Effective PAYE rate: ${r.effectiveTaxRate.toFixed(2)}%`,
      gross: r.displayGross,
      taxable: r.taxablePay,
      paye: r.paye,
      totalDeductions: r.employeeDeductions
    },
    earnings,
    deductions,
    netRow: { label: 'Net pay', value: r.netPay, highlight: true },
    employer
  };
}

function printRow(label, value, highlight = false) {
  const zero = !highlight && Math.round(value * 100) === 0;
  return `<div class="result-row ${highlight ? 'highlight' : ''} ${zero ? 'zero-row' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`;
}

function populatePayslipFields(payslip, prefix) {
  const s = payslipBreakdownSections(payslip);
  const el = id => document.getElementById(`${prefix}${id}`);
  const rowsHtml = rows => rows.map(row => printRow(row.label, row.value, row.highlight)).join('');

  el('Title').textContent = s.header.title;
  el('Subtitle').textContent = s.header.subtitle;
  el('EmployeeNumber').textContent = s.header.employeeNumber;
  el('NetPay').textContent = money(s.header.netPay);
  el('Rate').textContent = s.header.rate;
  el('Gross').textContent = money(s.header.gross);
  el('Taxable').textContent = money(s.header.taxable);
  el('Paye').textContent = money(s.header.paye);
  el('TotalDeductions').textContent = money(s.header.totalDeductions);
  el('Earnings').innerHTML = rowsHtml(s.earnings);
  el('Deductions').innerHTML = rowsHtml(s.deductions);
  el('NetRow').innerHTML = printRow(s.netRow.label, s.netRow.value, s.netRow.highlight);
  el('EmployerRows').innerHTML = rowsHtml(s.employer);
}

// Shared by printPayslip() and emailPayslip() -- populates the same
// hidden #payslipPrintWrap template either way, so the emailed copy is
// guaranteed to match what printing would have produced.
async function populatePayslipPrintView(payslip) {
  populatePayslipFields(payslip, 'payslipPrint');

  const settingsSnap = await getDoc(businessDoc('settings', 'main'));
  const settings = settingsSnap.exists() ? settingsSnap.data() : {};
  const logoEl = document.getElementById('payslipPrintLogo');
  const businessNameEl = document.getElementById('payslipPrintBusinessName');
  logoEl.src = settings.businessLogoUrl || '';
  logoEl.hidden = !settings.businessLogoUrl;
  businessNameEl.textContent = settings.businessName || '';
  businessNameEl.hidden = !settings.businessName;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('payslipPrintDate').textContent = `Printed ${dateStr}, ${timeStr}`;
}

async function printPayslip(payslip) {
  await populatePayslipPrintView(payslip);

  // @page size is a page-level rule, not scopable by a body class, so it's
  // injected just for this print and removed right after -- same trick as
  // the muster roll/leave balances prints. margin: 0 also leaves
  // Chrome/Edge no room to draw their default header/footer (date + page
  // title/URL); .payslip-print-footer replicates that space from inside
  // the content instead, with our own date/time and credit line.
  const pageStyle = document.createElement('style');
  pageStyle.textContent = '@page { size: A5 portrait; margin: 0; }';
  document.head.appendChild(pageStyle);
  const originalTitle = document.title;
  document.title = '';

  const wrap = document.getElementById('payslipPrintWrap');
  applyPrintWatermark(wrap);
  wrap.hidden = false;
  document.body.classList.add('printing-payslip');
  window.print();
  document.body.classList.remove('printing-payslip');
  wrap.hidden = true;
  wrap.querySelectorAll('.print-watermark').forEach(el => el.remove());
  pageStyle.remove();
  document.title = originalTitle;
}

// Never hands the payslip to the browser for a local save -- relayed
// server-side straight to the signed-in owner's own registered email
// (api/email-report.js determines the recipient itself from the auth
// token, so this can't be pointed at an arbitrary address).
async function emailPayslip(payslip) {
  await populatePayslipPrintView(payslip);

  const wrap = document.getElementById('payslipPrintWrap');
  const container = document.createElement('div');
  container.innerHTML = wrap.innerHTML;
  applyPrintWatermark(container);

  await callFunction('/api/email-report', {
    subject: `Payslip — ${payslip.employee_snapshot.first_name} ${payslip.employee_snapshot.last_name}`,
    html: container.innerHTML
  });
}

// Non-highlight rows whose value rounds to zero are dropped entirely on
// screen (not just visually hidden) so an inline breakdown only shows
// the components that actually apply to this employee.
function inlineBreakdownRows(rows) {
  return rows.filter(row => row.highlight || Math.round(row.value * 100) !== 0);
}

function inlineRow({ label, value, highlight = false }) {
  return `<div class="result-row ${highlight ? 'highlight' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`;
}

function renderInlineBreakdown(payslip) {
  const s = payslipBreakdownSections(payslip);
  const earnings = inlineBreakdownRows(s.earnings);
  const deductions = inlineBreakdownRows(s.deductions);
  const employer = inlineBreakdownRows(s.employer);

  return `
    <div class="breakdown-card breakdown-computation">
      <div class="breakdown-columns">
        <div class="breakdown-col"><h3>Earnings</h3>${earnings.map(inlineRow).join('')}</div>
        <div class="breakdown-col"><h3>Deductions &amp; reliefs</h3>${deductions.map(inlineRow).join('')}</div>
      </div>
      <div class="breakdown-net">${inlineRow(s.netRow)}</div>
    </div>
    <div class="breakdown-card employer-card">
      <h2>Employer contributions</h2>
      ${employer.map(inlineRow).join('')}
    </div>
  `;
}

function collapseExpandedPayslipRow() {
  const expandRow = payrollDetailTableBody.querySelector('tr.payroll-detail-expand-row');
  if (expandRow) expandRow.remove();
  const openRow = payrollDetailTableBody.querySelector('tr.payroll-detail-row.is-expanded');
  if (openRow) openRow.classList.remove('is-expanded');
}

payrollDetailTableBody.addEventListener('click', async event => {
  const payslips = JSON.parse(payrollDetailTableBody.dataset.payslips || '[]');

  const printBtn = event.target.closest('.payslip-print-btn');
  if (printBtn) {
    const payslip = payslips.find(p => p.id === printBtn.dataset.payslipId);
    if (payslip && (await requireReportPasscode())) printPayslip(payslip);
    return;
  }

  const emailBtn = event.target.closest('.payslip-email-btn');
  if (emailBtn) {
    const payslip = payslips.find(p => p.id === emailBtn.dataset.payslipId);
    if (!payslip || !(await requireReportPasscode())) return;
    payrollDetailError.hidden = true;
    payrollDetailInfo.hidden = true;
    emailBtn.disabled = true;
    try {
      await emailPayslip(payslip);
      payrollDetailInfo.textContent = `Payslip emailed to your registered email address.`;
      payrollDetailInfo.hidden = false;
    } catch (err) {
      payrollDetailError.textContent = err.message || 'Could not email this payslip.';
      payrollDetailError.hidden = false;
    } finally {
      emailBtn.disabled = false;
    }
    return;
  }

  const row = event.target.closest('tr.payroll-detail-row');
  if (!row) return;

  const alreadyOpen = row.classList.contains('is-expanded');
  collapseExpandedPayslipRow();
  if (alreadyOpen) return;

  const payslip = payslips.find(p => p.id === row.dataset.payslipId);
  if (!payslip) return;

  row.classList.add('is-expanded');
  const expandRow = document.createElement('tr');
  expandRow.className = 'payroll-detail-expand-row';
  const cell = document.createElement('td');
  cell.colSpan = 7;
  cell.innerHTML = renderInlineBreakdown(payslip);
  expandRow.appendChild(cell);
  row.after(expandRow);
});

// --- Muster roll ------------------------------------------------------
// A landscape, paginated printout of every payslip in an approved or
// processed run. Columns are built dynamically: a line item only gets
// its own column if at least one employee in the run has a non-zero
// value for it (basic pay, gross, total deductions, and net pay always
// show as they're subtotals, not optional line items).

const MUSTER_ROWS_PER_PAGE = 20;

function musterEarningColumns() {
  return [
    { key: 'basicPay', label: 'Basic Pay', group: 'EARNINGS', always: true, getValue: p => toNumber(p.compensation_snapshot?.basicPay) },
    ...earningComponents.map(item => ({
      key: item.id, label: item.label, group: 'EARNINGS',
      getValue: p => toNumber(p.compensation_snapshot?.[item.id])
    }))
  ];
}

function musterStatutoryColumns() {
  return [
    { key: 'nssfEmployee', label: 'NSSF', group: 'DEDUCTIONS', getValue: p => p.results.nssfEmployee || 0 },
    { key: 'shif', label: 'SHIF', group: 'DEDUCTIONS', getValue: p => p.results.shif || 0 },
    { key: 'ahlEmployee', label: 'AHL', group: 'DEDUCTIONS', getValue: p => p.results.ahlEmployee || 0 },
    { key: 'payeWht', label: 'PAYE / WHT', group: 'DEDUCTIONS', getValue: p => (p.employee_snapshot.employee_type === 'contractor' ? p.results.wht : p.results.paye) || 0 }
  ];
}

function musterCustomDeductionColumns() {
  return [
    { key: 'employeePension', label: 'Pension', group: 'DEDUCTIONS', getValue: p => p.results.employeePension || 0 },
    { key: 'insurancePremiums', label: 'Insurance Premiums', group: 'DEDUCTIONS', getValue: p => p.results.insurancePremiums || 0 },
    { key: 'otherDeductions', label: 'Other Deductions', group: 'DEDUCTIONS', getValue: p => p.results.otherDeductions || 0 }
  ];
}

function musterEmployerColumns() {
  return [
    { key: 'nssfEmployer', label: 'NSSF (Employer)', group: 'EMPLOYER CONTRIBUTIONS', getValue: p => p.results.nssfEmployer || 0 },
    { key: 'ahlEmployer', label: 'AHL (Employer)', group: 'EMPLOYER CONTRIBUTIONS', getValue: p => p.results.ahlEmployer || 0 },
    { key: 'employerPension', label: 'Pension (Employer)', group: 'EMPLOYER CONTRIBUTIONS', getValue: p => p.results.employerPension || 0 },
    { key: 'nitaLevy', label: 'NITA Levy', group: 'EMPLOYER CONTRIBUTIONS', getValue: p => p.results.nitaLevy || 0 }
  ];
}

function musterReliefColumns() {
  return [
    { key: 'appliedPersonalRelief', label: 'Personal Relief', group: 'TAX RELIEFS', getValue: p => p.results.appliedPersonalRelief || 0 },
    { key: 'insuranceRelief', label: 'Insurance Relief', group: 'TAX RELIEFS', getValue: p => p.results.insuranceRelief || 0 }
  ];
}

function dynamicColumns(columns, payslips) {
  return columns.filter(col => col.always || payslips.some(p => Math.round((col.getValue(p) || 0) * 100) !== 0));
}

// NSSF/SHIF/AHL *base* figures are deliberately left out — a muster
// roll shows what was earned/deducted/contributed, not the statutory
// calculation bases behind them.
function buildMusterRollColumns(payslips) {
  const leading = [
    { key: 'employeeNumber', label: 'Payroll No.', text: true, getValue: p => p.employee_snapshot.employee_number || '—' },
    { key: 'fullName', label: 'Full Name', text: true, getValue: p => `${p.employee_snapshot.first_name} ${p.employee_snapshot.last_name}` },
    { key: 'jobPosition', label: 'Job Position', text: true, getValue: p => p.employee_snapshot.job_position || '—' },
    { key: 'employeeType', label: 'Employee Type', text: true, getValue: p => classificationLabels[p.employee_snapshot.employee_type] || p.employee_snapshot.employee_type }
  ];

  const earnings = dynamicColumns(musterEarningColumns(), payslips);
  const gross = { key: 'gross', label: 'Gross Pay', group: 'EARNINGS', bold: true, getValue: p => p.results.displayGross || 0 };
  const statutory = dynamicColumns(musterStatutoryColumns(), payslips);
  const custom = dynamicColumns(musterCustomDeductionColumns(), payslips);
  const totalDeductions = { key: 'totalDeductions', label: 'Total Deductions', group: 'DEDUCTIONS', bold: true, getValue: p => p.results.employeeDeductions || 0 };
  const netPay = { key: 'netPay', label: 'Net Pay', bold: true, getValue: p => p.results.netPay || 0 };
  const employer = dynamicColumns(musterEmployerColumns(), payslips);
  const reliefs = dynamicColumns(musterReliefColumns(), payslips);

  return [
    ...leading,
    ...earnings, gross,
    ...statutory, ...custom, totalDeductions,
    netPay,
    ...employer,
    ...reliefs
  ];
}

// Builds a two-row <thead>: row 1 merges consecutive same-group columns
// under one heading (colspan), row 2 lists each column's own label.
// Ungrouped columns (the employee-identity columns and Net Pay) span
// both header rows instead.
function musterHeaderRows(columns) {
  const row1 = [];
  const row2 = [];
  let i = 0;
  while (i < columns.length) {
    const col = columns[i];
    if (!col.group) {
      row1.push(`<th rowspan="2">${col.label}</th>`);
      i += 1;
      continue;
    }
    let span = 1;
    while (i + span < columns.length && columns[i + span].group === col.group) span += 1;
    row1.push(`<th colspan="${span}">${col.group}</th>`);
    for (let j = 0; j < span; j += 1) row2.push(`<th>${columns[i + j].label}</th>`);
    i += span;
  }
  return `<tr>${row1.join('')}</tr><tr>${row2.join('')}</tr>`;
}

// Muster roll amounts are unlabelled numbers, not "KES ..." — the
// business name/currency context is already established once in the
// page header, and the columns are far too narrow for the prefix.
function musterBodyRow(payslip, columns) {
  const cells = columns.map(col => {
    const raw = col.getValue(payslip);
    const value = col.text ? raw : rawMoney(raw || 0);
    const classes = [col.text ? 'muster-left' : 'muster-right', col.bold ? 'muster-bold' : ''].filter(Boolean).join(' ');
    return `<td class="${classes}">${value}</td>`;
  });
  return `<tr>${cells.join('')}</tr>`;
}

function musterTotalsRow(payslips, columns) {
  const cells = columns.map((col, idx) => {
    if (col.text) return `<td class="muster-left muster-bold">${idx === 0 ? 'GRAND TOTAL' : ''}</td>`;
    const total = payslips.reduce((sum, p) => sum + (col.getValue(p) || 0), 0);
    return `<td class="muster-right muster-bold">${rawMoney(total)}</td>`;
  });
  return `<tr class="muster-totals-row">${cells.join('')}</tr>`;
}

function chunkRows(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function buildMusterRollHtml(run, payslips, { businessName, logoUrl } = {}) {
  const columns = buildMusterRollColumns(payslips);
  const pages = chunkRows(payslips, MUSTER_ROWS_PER_PAGE);
  if (!pages.length) pages.push([]);
  const now = new Date();
  const generatedAt = now.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  const printedAt = `${generatedAt}, ${now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`;
  const statusLabel = run.status.charAt(0).toUpperCase() + run.status.slice(1);

  return pages.map((pagePayslips, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;
    return `
      <div class="muster-page">
        <div class="muster-header">
          <div class="muster-header-top">
            ${logoUrl ? `<img class="muster-logo" src="${logoUrl}" alt="" />` : ''}
            <div class="muster-business-name">${businessName || 'Business name not set'}</div>
          </div>
          <div class="muster-cycle">Payroll Cycle: ${run.period_label} (${run.period_start} to ${run.period_end})</div>
          <div class="muster-meta">Muster Roll — Status: ${statusLabel} &middot; Generated: ${generatedAt}</div>
        </div>
        <table class="muster-table">
          <thead>${musterHeaderRows(columns)}</thead>
          <tbody>
            ${pagePayslips.map(p => musterBodyRow(p, columns)).join('')}
            ${isLastPage ? musterTotalsRow(payslips, columns) : ''}
          </tbody>
        </table>
        <div class="muster-footer">
          <div class="muster-footer-left">
            ${isLastPage ? '<div class="muster-prepared">Prepared by &mdash; ________________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date: __________________</div>' : ''}
            <div class="muster-printed">Printed ${printedAt}</div>
          </div>
          <div class="muster-footer-right">
            <div class="muster-page-number">Page ${String(pageIndex + 1).padStart(2, '0')}</div>
            <div class="muster-credit">Powered by: James Sammy - JMSolutions - Kenya PAYE &amp; Tax Calculator</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function printMusterRoll() {
  if (!currentRunId || !currentRunMeta) return;
  musterRollBtn.disabled = true;
  payrollDetailError.hidden = true;
  try {
    const settingsSnap = await getDoc(businessDoc('settings', 'main'));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};

    const wrap = document.getElementById('musterRollPrintWrap');
    wrap.innerHTML = buildMusterRollHtml(currentRunMeta, currentRunPayslips, { businessName: settings.businessName, logoUrl: settings.businessLogoUrl });
    applyPrintWatermark(wrap);

    // @page size is a page-level rule, not scopable by a body class, so
    // it's injected just for this print and removed right after —
    // the calculator's own print stays on the browser's portrait default.
    // margin: 0 also leaves Chrome/Edge no room to draw their default
    // header/footer (page title + URL); .muster-page replicates the
    // visual margin from inside the content instead.
    const pageStyle = document.createElement('style');
    pageStyle.textContent = '@page { size: landscape; margin: 0; }';
    document.head.appendChild(pageStyle);
    const originalTitle = document.title;
    document.title = '';

    wrap.hidden = false;
    document.body.classList.add('printing-muster-roll');
    window.print();
    document.body.classList.remove('printing-muster-roll');
    wrap.hidden = true;
    pageStyle.remove();
    document.title = originalTitle;
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not generate the muster roll.';
    payrollDetailError.hidden = false;
  } finally {
    musterRollBtn.disabled = false;
  }
}

musterRollBtn.addEventListener('click', async () => {
  if (await requireReportPasscode()) printMusterRoll();
});

// Generates the exact same HTML as printMusterRoll() but never hands it
// to the browser for a local save -- it's relayed server-side straight
// to the signed-in owner's own registered email (api/email-report.js
// determines the recipient itself from the auth token; it can't be
// pointed at an arbitrary address).
async function emailMusterRoll() {
  if (!currentRunId || !currentRunMeta) return;
  musterRollEmailBtn.disabled = true;
  payrollDetailError.hidden = true;
  payrollDetailInfo.hidden = true;
  try {
    const settingsSnap = await getDoc(businessDoc('settings', 'main'));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {};
    const container = document.createElement('div');
    container.innerHTML = buildMusterRollHtml(currentRunMeta, currentRunPayslips, { businessName: settings.businessName, logoUrl: settings.businessLogoUrl });
    applyPrintWatermark(container);
    await callFunction('/api/email-report', { subject: `Muster roll — ${currentRunMeta.period_label}`, html: container.innerHTML });
    payrollDetailInfo.textContent = 'Muster roll emailed to your registered email address.';
    payrollDetailInfo.hidden = false;
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not email the muster roll.';
    payrollDetailError.hidden = false;
  } finally {
    musterRollEmailBtn.disabled = false;
  }
}

musterRollEmailBtn.addEventListener('click', async () => {
  if (await requireReportPasscode()) emailMusterRoll();
});

document.addEventListener('app:page', event => {
  if (event.detail.page === 'payroll') {
    if (!payrollRunsLoaded) loadPayrollRuns();
    showListView();
  }
});
