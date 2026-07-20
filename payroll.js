import { supabase } from './auth.js';

const { earningComponents, classificationLabels, toNumber, money, computePayroll } = window.PayrollShared;

const listView = document.getElementById('payrollListView');
const newView = document.getElementById('payrollNewView');
const detailView = document.getElementById('payrollDetailView');

const newPayrollRunBtn = document.getElementById('newPayrollRunBtn');
const payrollRunsTableBody = document.getElementById('payrollRunsTableBody');
const payrollRunsEmptyState = document.getElementById('payrollRunsEmptyState');

const payrollNewBackBtn = document.getElementById('payrollNewBackBtn');
const payrollNewError = document.getElementById('payrollNewError');
const payrollPeriodLabel = document.getElementById('payrollPeriodLabel');
const payrollPeriodStart = document.getElementById('payrollPeriodStart');
const payrollPeriodEnd = document.getElementById('payrollPeriodEnd');
const payrollEligibleList = document.getElementById('payrollEligibleList');
const payrollTerminatedList = document.getElementById('payrollTerminatedList');
const payrollExcludedList = document.getElementById('payrollExcludedList');
const createPayrollRunBtn = document.getElementById('createPayrollRunBtn');

const payrollDetailBackBtn = document.getElementById('payrollDetailBackBtn');
const payrollDetailTitle = document.getElementById('payrollDetailTitle');
const payrollDetailError = document.getElementById('payrollDetailError');
const payrollDetailStatus = document.getElementById('payrollDetailStatus');
const payrollDetailSummary = document.getElementById('payrollDetailSummary');
const payrollDetailTableBody = document.getElementById('payrollDetailTableBody');
const approveRunBtn = document.getElementById('approveRunBtn');
const processRunBtn = document.getElementById('processRunBtn');

let payrollRunsLoaded = false;
let currentRunId = null;
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

newPayrollRunBtn.addEventListener('click', async () => {
  payrollNewError.hidden = true;
  payrollPeriodLabel.value = '';
  payrollPeriodStart.value = '';
  payrollPeriodEnd.value = '';
  listView.hidden = true;
  newView.hidden = false;

  const { data: employees } = await supabase.from('employees').select('*').order('first_name');
  employeesCache = employees || [];
  renderEligibilityLists();
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

payrollNewBackBtn.addEventListener('click', showListView);

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

  createPayrollRunBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data: settingsRow } = await supabase.from('payroll_settings').select('*').maybeSingle();
    const settings = settingsFromRow(settingsRow || {
      nssf_rate: 6, nssf_upper_limit: 108000, shif_rate: 2.75, shif_minimum: 300,
      ahl_employee_rate: 1.5, ahl_employer_rate: 1.5, personal_relief: 2400, nita_levy: 50,
      insurance_relief_cap: 5000, telephone_threshold: 5000, meals_threshold: 5000,
      allowable_deduction_cap: 30000, per_diem_threshold: 10000, days_in_month: 30,
      secondary_flat_rate: 35, contractor_wht_rate: 5, pwd_exemption: 150000
    });

    const periodLabel = payrollPeriodLabel.value.trim() || `${payrollPeriodStart.value} to ${payrollPeriodEnd.value}`;

    const { data: run, error: runError } = await supabase.from('payroll_runs').insert({
      user_id: user.id,
      period_label: periodLabel,
      period_start: payrollPeriodStart.value,
      period_end: payrollPeriodEnd.value,
      status: 'draft'
    }).select().single();
    if (runError) throw runError;

    const payslipRows = selected.map(checkbox => {
      const employee = employeesCache.find(e => e.id === checkbox.dataset.employeeId);
      const isFinalDues = checkbox.dataset.finalDues === 'true';
      const values = valuesFromEmployee(employee);
      const toggles = togglesFromEmployee(employee);
      const results = computePayroll({ classification: employee.employee_type, basicPay: values.basicPay, values, toggles, settings });

      return {
        payroll_run_id: run.id,
        employee_id: employee.id,
        user_id: user.id,
        employee_snapshot: {
          first_name: employee.first_name, last_name: employee.last_name,
          job_position: employee.job_position, department: employee.department,
          employee_type: employee.employee_type
        },
        compensation_snapshot: { ...values, toggles },
        results,
        is_final_dues: isFinalDues
      };
    });

    const { error: payslipError } = await supabase.from('payslips').insert(payslipRows);
    if (payslipError) throw payslipError;

    await openRun(run.id);
  } catch (err) {
    payrollNewError.textContent = err.message || 'Could not create payroll run.';
    payrollNewError.hidden = false;
  } finally {
    createPayrollRunBtn.disabled = false;
  }
});

async function openRun(runId) {
  currentRunId = runId;
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
    <tr data-payslip-id="${p.id}">
      <td>${p.employee_snapshot.first_name} ${p.employee_snapshot.last_name}${p.is_final_dues ? ' <small>(final dues)</small>' : ''}</td>
      <td>${classificationLabels[p.employee_snapshot.employee_type] || p.employee_snapshot.employee_type}</td>
      <td>${money(p.results.displayGross)}</td>
      <td>${money(p.results.paye)}</td>
      <td>${money(p.results.netPay)}</td>
      <td><button type="button" class="ghost-button payslip-print-btn" data-payslip-id="${p.id}">Payslip</button></td>
    </tr>
  `).join('');
  payrollDetailTableBody.dataset.payslips = JSON.stringify(rows.map(p => ({ id: p.id, employee_snapshot: p.employee_snapshot, compensation_snapshot: p.compensation_snapshot, results: p.results, period_label: run.period_label })));

  approveRunBtn.hidden = run.status !== 'draft';
  processRunBtn.hidden = run.status !== 'approved';
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

function printRow(label, value, highlight = false) {
  const zero = !highlight && Math.round(value * 100) === 0;
  return `<div class="result-row ${highlight ? 'highlight' : ''} ${zero ? 'zero-row' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`;
}

function printPayslip(payslip) {
  const r = payslip.results;
  const emp = payslip.employee_snapshot;
  const comp = payslip.compensation_snapshot || {};
  const isContractor = emp.employee_type === 'contractor';

  document.getElementById('payslipPrintTitle').textContent = `${emp.first_name} ${emp.last_name} — ${payslip.period_label || ''}`;
  document.getElementById('payslipPrintSubtitle').textContent =
    [emp.job_position, emp.department, classificationLabels[emp.employee_type]].filter(Boolean).join(' · ');
  document.getElementById('payslipPrintNetPay').textContent = money(r.netPay);
  document.getElementById('payslipPrintRate').textContent = `Effective PAYE rate: ${r.effectiveTaxRate.toFixed(2)}%`;
  document.getElementById('payslipPrintGross').textContent = money(r.displayGross);
  document.getElementById('payslipPrintTaxable').textContent = money(r.taxablePay);
  document.getElementById('payslipPrintPaye').textContent = money(r.paye);
  document.getElementById('payslipPrintTotalDeductions').textContent = money(r.employeeDeductions);

  document.getElementById('payslipPrintEarnings').innerHTML = [
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

  document.getElementById('payslipPrintDeductions').innerHTML = [
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

  document.getElementById('payslipPrintNetRow').innerHTML = printRow('Net pay', r.netPay, true);

  document.getElementById('payslipPrintEmployerRows').innerHTML = [
    printRow('NSSF employer', r.nssfEmployer),
    printRow('AHL employer', r.ahlEmployer),
    printRow('Employer pension', r.employerPension),
    printRow('NITA levy', r.nitaLevy),
    printRow('Total employer cost add-ons', r.nssfEmployer + r.ahlEmployer + r.employerPension + r.nitaLevy, true)
  ].join('');

  const wrap = document.getElementById('payslipPrintWrap');
  wrap.hidden = false;
  document.body.classList.add('printing-payslip');
  window.print();
  document.body.classList.remove('printing-payslip');
  wrap.hidden = true;
}

payrollDetailTableBody.addEventListener('click', event => {
  const btn = event.target.closest('.payslip-print-btn');
  if (!btn) return;
  const payslips = JSON.parse(payrollDetailTableBody.dataset.payslips || '[]');
  const payslip = payslips.find(p => p.id === btn.dataset.payslipId);
  if (payslip) printPayslip(payslip);
});

document.addEventListener('app:page', event => {
  if (event.detail.page === 'payroll') {
    if (!payrollRunsLoaded) loadPayrollRuns();
    showListView();
  }
});
