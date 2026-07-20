import { supabase } from './auth.js';

const { earningComponents, classificationLabels, toNumber, money, computePayroll } = window.PayrollShared;

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
const payrollDetailStatus = document.getElementById('payrollDetailStatus');
const payrollDetailSummary = document.getElementById('payrollDetailSummary');
const payrollDetailTableBody = document.getElementById('payrollDetailTableBody');
const approveRunBtn = document.getElementById('approveRunBtn');
const processRunBtn = document.getElementById('processRunBtn');
const recalcRunBtn = document.getElementById('recalcRunBtn');
const editRunBtn = document.getElementById('editRunBtn');
const recallRunBtn = document.getElementById('recallRunBtn');

const payslipDetailOverlay = document.getElementById('payslipDetailOverlay');
const payslipDetailCloseBtn = document.getElementById('payslipDetailCloseBtn');

let payrollRunsLoaded = false;
let currentRunId = null;
let currentRunStatus = null;
let editingRunId = null;
let employeesCache = [];

function settingsFromRow(row) {
  return {
    nssfRate: row.nssf_rate,
    nssfUpperLimit: row.nssf_upper_limit,
    shifRate: row.shif_rate,
    shifMinimum: row.shif_minimum,
    ahlEmployeeRate: row.ahl_employee_rate,
    ahlEmployerRate: row.ahl_employer_rate,
    personalRelief: row.personal_relief,
    nitaLevy: row.nita_levy,
    insuranceReliefCap: row.insurance_relief_cap,
    telephoneThreshold: row.telephone_threshold,
    mealsThreshold: row.meals_threshold,
    allowableDeductionCap: row.allowable_deduction_cap,
    perDiemThreshold: row.per_diem_threshold,
    daysInMonth: row.days_in_month,
    secondaryFlatRate: row.secondary_flat_rate,
    contractorWhtRate: row.contractor_wht_rate,
    pwdExemption: row.pwd_exemption
  };
}

function valuesFromEmployee(employee) {
  const comp = employee.compensation || {};
  const values = {};
  earningComponents.forEach(item => { values[item.id] = toNumber(comp[item.id]); });
  values.basicPay = toNumber(comp.basicPay);
  values.employeePensionRate = toNumber(comp.employeePensionRate);
  values.employerPensionRate = toNumber(comp.employerPensionRate);
  values.lifeInsurance = toNumber(comp.lifeInsurance);
  values.educationInsurance = toNumber(comp.educationInsurance);
  values.otherDeductions = toNumber(comp.otherDeductions);
  return values;
}

function togglesFromEmployee(employee) {
  const stored = employee.statutory_toggles || {};
  const toggles = {};
  earningComponents.forEach(item => {
    const saved = stored[item.id] || {};
    toggles[item.id] = { nssf: !!saved.nssf, shif: !!saved.shif, ahl: !!saved.ahl };
  });
  return toggles;
}

async function loadRunSettings() {
  const { data: settingsRow } = await supabase.from('payroll_settings').select('*').maybeSingle();
  return settingsFromRow(settingsRow || {
    nssf_rate: 6, nssf_upper_limit: 108000, shif_rate: 2.75, shif_minimum: 300,
    ahl_employee_rate: 1.5, ahl_employer_rate: 1.5, personal_relief: 2400, nita_levy: 50,
    insurance_relief_cap: 5000, telephone_threshold: 5000, meals_threshold: 5000,
    allowable_deduction_cap: 30000, per_diem_threshold: 10000, days_in_month: 30,
    secondary_flat_rate: 35, contractor_wht_rate: 5, pwd_exemption: 150000
  });
}

function computePayslipRow({ runId, userId, employee, isFinalDues, settings }) {
  const values = valuesFromEmployee(employee);
  const toggles = togglesFromEmployee(employee);
  const results = computePayroll({ classification: employee.employee_type, basicPay: values.basicPay, values, toggles, settings });

  return {
    payroll_run_id: runId,
    employee_id: employee.id,
    user_id: userId,
    employee_snapshot: {
      first_name: employee.first_name, last_name: employee.last_name,
      job_position: employee.job_position, department: employee.department,
      employee_type: employee.employee_type
    },
    compensation_snapshot: { ...values, toggles },
    results,
    is_final_dues: isFinalDues
  };
}

// Two payroll runs for the same user cannot share a period label or an
// identical start/end date pair — both would be ambiguous to reconcile
// against payroll history. excludeRunId lets an edit-in-place check
// against every *other* run without conflicting with itself.
async function findConflictingRun({ periodStart, periodEnd, periodLabel, excludeRunId }) {
  const { data: runs } = await supabase.from('payroll_runs').select('id, period_label, period_start, period_end');
  const normalizedLabel = periodLabel.trim().toLowerCase();
  return (runs || []).find(run => {
    if (run.id === excludeRunId) return false;
    if (run.period_start === periodStart && run.period_end === periodEnd) return true;
    if (run.period_label.trim().toLowerCase() === normalizedLabel) return true;
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
  const { data: runs, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !runs) {
    payrollRunsTableBody.innerHTML = '';
    payrollRunsEmptyState.hidden = false;
    payrollRunsEmptyState.textContent = 'Could not load payroll runs.';
    return;
  }

  payrollRunsEmptyState.hidden = runs.length > 0;
  payrollRunsEmptyState.textContent = 'No payroll runs yet.';

  const rows = await Promise.all(runs.map(async run => {
    const { count } = await supabase.from('payslips').select('id', { count: 'exact', head: true }).eq('payroll_run_id', run.id);
    const { data: payslips } = await supabase.from('payslips').select('results').eq('payroll_run_id', run.id);
    const totalNet = (payslips || []).reduce((sum, p) => sum + (p.results?.netPay || 0), 0);
    return `
      <tr data-id="${run.id}">
        <td>${run.period_label}</td>
        <td><span class="status-pill status-${run.status === 'processed' ? 'active' : 'terminated'}">${run.status}</span></td>
        <td>${count ?? 0}</td>
        <td>${money(totalNet)}</td>
        <td><button type="button" class="ghost-button payroll-run-open-btn" data-id="${run.id}">Open</button></td>
      </tr>
    `;
  }));
  payrollRunsTableBody.innerHTML = rows.join('');
}

async function syncEmployees() {
  const { data: employees } = await supabase.from('employees').select('*').order('first_name');
  employeesCache = employees || [];
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
    if (!emp.contract_start_date) {
      excluded.push({ emp, reason: 'No contract start date on file' });
      return;
    }
    if (periodEnd && emp.contract_start_date > periodEnd) {
      excluded.push({ emp, reason: `Contract starts ${emp.contract_start_date}, after this period` });
      return;
    }
    eligible.push(emp);
  });

  payrollEligibleList.innerHTML = eligible.length
    ? eligible.map(emp => `
        <label class="payroll-employee-row">
          <input type="checkbox" data-employee-id="${emp.id}" checked />
          <span class="employee-name">${emp.first_name} ${emp.last_name}</span>
          <span class="employee-reason">${classificationLabels[emp.employee_type] || emp.employee_type}</span>
        </label>
      `).join('')
    : '<p class="hint">No eligible employees.</p>';

  payrollTerminatedList.innerHTML = terminated.length
    ? terminated.map(emp => `
        <label class="payroll-employee-row">
          <input type="checkbox" data-employee-id="${emp.id}" data-final-dues="true" />
          <span class="employee-name">${emp.first_name} ${emp.last_name}</span>
          <span class="employee-reason">Terminated ${emp.termination_date || ''}</span>
        </label>
      `).join('')
    : '<p class="hint">No terminated employees.</p>';

  payrollExcludedList.innerHTML = excluded.length
    ? excluded.map(({ emp, reason }) => `
        <div class="payroll-employee-row is-excluded">
          <span class="employee-name">${emp.first_name} ${emp.last_name}</span>
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
    payrollNewError.textContent = `Another payroll run ("${conflict.period_label}") already uses this date range or label.`;
    payrollNewError.hidden = false;
    return;
  }

  createPayrollRunBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const settings = await loadRunSettings();

    let runId = editingRunId;
    if (editingRunId) {
      const { error: updateError } = await supabase.from('payroll_runs').update({
        period_label: periodLabel,
        period_start: payrollPeriodStart.value,
        period_end: payrollPeriodEnd.value
      }).eq('id', editingRunId);
      if (updateError) throw updateError;

      const { error: deleteError } = await supabase.from('payslips').delete().eq('payroll_run_id', editingRunId);
      if (deleteError) throw deleteError;
    } else {
      const { data: run, error: runError } = await supabase.from('payroll_runs').insert({
        user_id: user.id,
        period_label: periodLabel,
        period_start: payrollPeriodStart.value,
        period_end: payrollPeriodEnd.value,
        status: 'draft'
      }).select().single();
      if (runError) throw runError;
      runId = run.id;
    }

    const payslipRows = selected.map(checkbox => {
      const employee = employeesCache.find(e => e.id === checkbox.dataset.employeeId);
      const isFinalDues = checkbox.dataset.finalDues === 'true';
      return computePayslipRow({ runId, userId: user.id, employee, isFinalDues, settings });
    });

    const { error: payslipError } = await supabase.from('payslips').insert(payslipRows);
    if (payslipError) throw payslipError;

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

  const { data: run, error: runError } = await supabase.from('payroll_runs').select('*').eq('id', runId).single();
  if (runError || !run) {
    payrollDetailError.textContent = 'Could not load this payroll run.';
    payrollDetailError.hidden = false;
    return;
  }

  const { data: payslips } = await supabase.from('payslips').select('*').eq('payroll_run_id', runId);
  const rows = payslips || [];

  payrollDetailTitle.textContent = run.period_label;
  payrollDetailStatus.textContent = `Status: ${run.status}${run.status === 'approved' ? ` — approved ${new Date(run.approved_at).toLocaleDateString()}` : ''}${run.status === 'processed' ? ` — processed ${new Date(run.processed_at).toLocaleDateString()}` : ''}`;

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
      <td>${p.employee_snapshot.first_name} ${p.employee_snapshot.last_name}${p.is_final_dues ? ' <small>(final dues)</small>' : ''}</td>
      <td>${classificationLabels[p.employee_snapshot.employee_type] || p.employee_snapshot.employee_type}</td>
      <td>${money(p.results.displayGross)}</td>
      <td>${money(p.results.paye)}</td>
      <td>${money(p.results.netPay)}</td>
      <td><button type="button" class="ghost-button payslip-print-btn" data-payslip-id="${p.id}">Payslip</button></td>
    </tr>
  `).join('');
  payrollDetailTableBody.dataset.payslips = JSON.stringify(rows.map(p => ({ id: p.id, employee_snapshot: p.employee_snapshot, compensation_snapshot: p.compensation_snapshot, results: p.results, period_label: run.period_label })));

  currentRunStatus = run.status;
  approveRunBtn.hidden = run.status !== 'draft';
  processRunBtn.hidden = run.status !== 'approved';
  recalcRunBtn.hidden = run.status !== 'draft';
  editRunBtn.hidden = run.status !== 'draft';
  recallRunBtn.hidden = run.status === 'draft';
  recallRunBtn.textContent = run.status === 'processed' ? 'Recall to approved' : 'Recall to draft';
}

payrollRunsTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.payroll-run-open-btn');
  if (btn) openRun(btn.dataset.id);
});

payrollDetailBackBtn.addEventListener('click', showListView);

approveRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  const { error } = await supabase.from('payroll_runs').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', currentRunId);
  if (error) {
    payrollDetailError.textContent = error.message;
    payrollDetailError.hidden = false;
    return;
  }
  openRun(currentRunId);
});

processRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  const { error } = await supabase.from('payroll_runs').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('id', currentRunId);
  if (error) {
    payrollDetailError.textContent = error.message;
    payrollDetailError.hidden = false;
    return;
  }
  openRun(currentRunId);
});

recallRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  const patch = currentRunStatus === 'processed'
    ? { status: 'approved', processed_at: null }
    : { status: 'draft', approved_at: null };
  const { error } = await supabase.from('payroll_runs').update(patch).eq('id', currentRunId);
  if (error) {
    payrollDetailError.textContent = error.message;
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
    const { data: payslips, error: payslipsError } = await supabase.from('payslips').select('*').eq('payroll_run_id', currentRunId);
    if (payslipsError) throw payslipsError;

    const employeeIds = [...new Set((payslips || []).map(p => p.employee_id).filter(Boolean))];
    const { data: freshEmployees, error: employeesError } = await supabase.from('employees').select('*').in('id', employeeIds);
    if (employeesError) throw employeesError;
    const employeeById = new Map((freshEmployees || []).map(e => [e.id, e]));

    const settings = await loadRunSettings();

    for (const payslip of payslips || []) {
      const employee = employeeById.get(payslip.employee_id);
      if (!employee) continue;
      const row = computePayslipRow({ runId: currentRunId, userId: payslip.user_id, employee, isFinalDues: payslip.is_final_dues, settings });
      const { error: updateError } = await supabase.from('payslips').update({
        employee_snapshot: row.employee_snapshot,
        compensation_snapshot: row.compensation_snapshot,
        results: row.results
      }).eq('id', payslip.id);
      if (updateError) throw updateError;
    }

    await openRun(currentRunId);
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not sync this payroll run.';
    payrollDetailError.hidden = false;
  } finally {
    recalcRunBtn.disabled = false;
  }
});

editRunBtn.addEventListener('click', async () => {
  if (!currentRunId) return;
  editRunBtn.disabled = true;
  try {
    const { data: run, error: runError } = await supabase.from('payroll_runs').select('*').eq('id', currentRunId).single();
    if (runError || !run) throw runError || new Error('Could not load this payroll run.');
    const { data: payslips, error: payslipsError } = await supabase.from('payslips').select('employee_id, is_final_dues').eq('payroll_run_id', currentRunId);
    if (payslipsError) throw payslipsError;

    editingRunId = run.id;
    payrollNewTitle.textContent = `Edit ${run.period_label}`;
    createPayrollRunBtnText.textContent = 'Save changes';
    payrollNewError.hidden = true;
    payrollPeriodLabel.value = run.period_label;
    payrollPeriodStart.value = run.period_start;
    payrollPeriodEnd.value = run.period_end;
    listView.hidden = true;
    detailView.hidden = true;
    newView.hidden = false;

    await syncEmployees();

    const selectedIds = new Set((payslips || []).map(p => p.employee_id));
    [...payrollEligibleList.querySelectorAll('input[type="checkbox"]'), ...payrollTerminatedList.querySelectorAll('input[type="checkbox"]')]
      .forEach(checkbox => { checkbox.checked = selectedIds.has(checkbox.dataset.employeeId); });
  } catch (err) {
    payrollDetailError.textContent = err.message || 'Could not open this run for editing.';
    payrollDetailError.hidden = false;
  } finally {
    editRunBtn.disabled = false;
  }
});

function printRow(label, value, highlight = false) {
  const zero = !highlight && Math.round(value * 100) === 0;
  return `<div class="result-row ${highlight ? 'highlight' : ''} ${zero ? 'zero-row' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`;
}

function populatePayslipFields(payslip, prefix) {
  const r = payslip.results;
  const emp = payslip.employee_snapshot;
  const comp = payslip.compensation_snapshot || {};
  const isContractor = emp.employee_type === 'contractor';
  const el = id => document.getElementById(`${prefix}${id}`);

  el('Title').textContent = `${emp.first_name} ${emp.last_name} — ${payslip.period_label || ''}`;
  el('Subtitle').textContent =
    [emp.job_position, emp.department, classificationLabels[emp.employee_type]].filter(Boolean).join(' · ');
  el('NetPay').textContent = money(r.netPay);
  el('Rate').textContent = `Effective PAYE rate: ${r.effectiveTaxRate.toFixed(2)}%`;
  el('Gross').textContent = money(r.displayGross);
  el('Taxable').textContent = money(r.taxablePay);
  el('Paye').textContent = money(r.paye);
  el('TotalDeductions').textContent = money(r.employeeDeductions);

  el('Earnings').innerHTML = [
    printRow('Basic pay', comp.basicPay || 0),
    printRow('Direct allowances', r.directAllowances),
    printRow('Cash allowances breakdown total', r.cashAllowances),
    printRow('Taxable benefits used', r.taxableBenefits),
    printRow('Gross pay displayed', r.displayGross, true)
  ].join('');

  const taxRows = isContractor
    ? [printRow('WHT', r.wht, true)]
    : [
        printRow('Income tax before reliefs', r.incomeTax),
        printRow('Personal relief', r.appliedPersonalRelief),
        printRow('Insurance relief', r.insuranceRelief),
        printRow('PAYE payable', r.paye, true),
        printRow('WHT', r.wht)
      ];
  const statutoryBaseRows = isContractor ? [] : [
    printRow('PWD exempt amount applied', r.pwdReductionApplied),
    printRow('NSSF Base', r.nssfBase),
    printRow('SHIF Base', r.shifBase),
    printRow('AHL Base', r.ahlBase)
  ];

  el('Deductions').innerHTML = [
    ...statutoryBaseRows,
    printRow('NSSF employee', r.nssfEmployee),
    printRow('SHIF employee', r.shif),
    printRow('AHL employee', r.ahlEmployee),
    printRow('Employee pension', r.employeePension),
    printRow('NSSF + pension allowable deductions', r.nssfPensionAllowable, true),
    printRow('Total tax-deductible statutory deductions', r.totalTaxAllowableDeductions),
    ...taxRows,
    printRow('Insurance premiums deducted', r.insurancePremiums),
    printRow('Other deductions', r.otherDeductions)
  ].join('');

  el('NetRow').innerHTML = printRow('Net pay', r.netPay, true);

  el('EmployerRows').innerHTML = [
    printRow('NSSF employer', r.nssfEmployer),
    printRow('AHL employer', r.ahlEmployer),
    printRow('Employer pension', r.employerPension),
    printRow('NITA levy', r.nitaLevy),
    printRow('Total employer cost add-ons', r.nssfEmployer + r.ahlEmployer + r.employerPension + r.nitaLevy, true)
  ].join('');
}

function printPayslip(payslip) {
  populatePayslipFields(payslip, 'payslipPrint');
  const wrap = document.getElementById('payslipPrintWrap');
  wrap.hidden = false;
  document.body.classList.add('printing-payslip');
  window.print();
  document.body.classList.remove('printing-payslip');
  wrap.hidden = true;
}

function showPayslipDetail(payslip) {
  populatePayslipFields(payslip, 'payslipDetail');
  payslipDetailOverlay.hidden = false;
}

payslipDetailCloseBtn.addEventListener('click', () => { payslipDetailOverlay.hidden = true; });
payslipDetailOverlay.addEventListener('click', event => {
  if (event.target === payslipDetailOverlay) payslipDetailOverlay.hidden = true;
});

payrollDetailTableBody.addEventListener('click', event => {
  const payslips = JSON.parse(payrollDetailTableBody.dataset.payslips || '[]');

  const printBtn = event.target.closest('.payslip-print-btn');
  if (printBtn) {
    const payslip = payslips.find(p => p.id === printBtn.dataset.payslipId);
    if (payslip) printPayslip(payslip);
    return;
  }

  const row = event.target.closest('tr[data-payslip-id]');
  if (row) {
    const payslip = payslips.find(p => p.id === row.dataset.payslipId);
    if (payslip) showPayslipDetail(payslip);
  }
});

document.addEventListener('app:page', event => {
  if (event.detail.page === 'payroll') {
    if (!payrollRunsLoaded) loadPayrollRuns();
    showListView();
  }
});
