import { supabase } from './auth.js';

const { earningComponents, irregularComponentIds, toNumber, money, rawMoney } = window.PayrollShared;

const employeeTypeLabels = {
  primary: 'Primary',
  secondary: 'Secondary',
  contractor: 'Contractor',
  pwd: 'PWD'
};

const directoryView = document.getElementById('employeesDirectoryView');
const formView = document.getElementById('employeeFormView');
const addEmployeeBtn = document.getElementById('addEmployeeBtn');
const statusFilterButtons = [...document.querySelectorAll('[data-status-filter]')];
const employeeTableBody = document.getElementById('employeeTableBody');
const employeesEmptyState = document.getElementById('employeesEmptyState');
const employeeFormTitle = document.getElementById('employeeFormTitle');
const employeeFormBackBtn = document.getElementById('employeeFormBackBtn');
const employeeFormError = document.getElementById('employeeFormError');
const employeeForm = document.getElementById('employeeFormView');
const employeeSaveBtn = document.getElementById('employeeSaveBtn');
const employeeTerminateBtn = document.getElementById('employeeTerminateBtn');
const employeeRehireBtn = document.getElementById('employeeRehireBtn');
const compensationFieldsContainer = document.getElementById('employeeCompensationFields');

const terminateOverlay = document.getElementById('terminateOverlay');
const terminateCloseBtn = document.getElementById('terminateCloseBtn');
const terminateCancelBtn = document.getElementById('terminateCancelBtn');
const terminateForm = document.getElementById('terminateForm');
const terminateEmployeeName = document.getElementById('terminateEmployeeName');
const terminateDate = document.getElementById('terminateDate');
const terminateReason = document.getElementById('terminateReason');
const terminateError = document.getElementById('terminateError');

let currentStatusFilter = 'active';
let currentEmployeeId = null;
let currentEmployeeStatus = 'active';
let employeesLoaded = false;

function compFieldId(itemId, suffix = '') {
  return `emp_${itemId}${suffix}`;
}

function renderCompensationFields() {
  compensationFieldsContainer.innerHTML = earningComponents.map(item => {
    const defaultChecked = !irregularComponentIds.includes(item.id) ? 'checked' : '';
    return `
      <div class="earning-line">
        <label>${item.label} <input data-money id="${compFieldId(item.id)}" type="text" inputmode="decimal" placeholder="0.00" /></label>
        <div class="stat-toggles"><span>Affects</span>
          <label><input type="checkbox" id="${compFieldId(item.id, 'AffectsNssf')}" ${defaultChecked} /> <abbr title="National Social Security Fund">NSSF</abbr></label>
          <label><input type="checkbox" id="${compFieldId(item.id, 'AffectsShif')}" ${defaultChecked} /> <abbr title="Social Health Insurance Fund">SHIF</abbr></label>
          <label><input type="checkbox" id="${compFieldId(item.id, 'AffectsAhl')}" ${defaultChecked} /> <abbr title="Affordable Housing Levy">AHL</abbr></label>
        </div>
      </div>
    `;
  }).join('');

  attachMoneyBlurFormatting(compensationFieldsContainer);
}

function attachMoneyBlurFormatting(scope) {
  scope.querySelectorAll('[data-money]').forEach(input => {
    input.addEventListener('blur', () => {
      input.value = input.value ? rawMoney(toNumber(input.value)) : '';
    });
  });
}

function showDirectory() {
  directoryView.hidden = false;
  formView.hidden = true;
  loadEmployees();
}

function showForm() {
  directoryView.hidden = true;
  formView.hidden = false;
}

function resetForm() {
  employeeFormError.hidden = true;
  currentEmployeeId = null;
  currentEmployeeStatus = 'active';
  employeeFormTitle.textContent = 'Add employee';
  employeeTerminateBtn.hidden = true;
  employeeRehireBtn.hidden = true;
  employeeForm.reset();
  earningComponents.forEach(item => {
    const affectsByDefault = !irregularComponentIds.includes(item.id);
    ['Nssf', 'Shif', 'Ahl'].forEach(stat => {
      const checkbox = document.getElementById(compFieldId(item.id, `Affects${stat}`));
      if (checkbox) checkbox.checked = affectsByDefault;
    });
  });
}

function populateForm(employee) {
  currentEmployeeId = employee.id;
  currentEmployeeStatus = employee.status;
  employeeFormTitle.textContent = `${employee.first_name} ${employee.last_name}`;
  employeeTerminateBtn.hidden = employee.status !== 'active';
  employeeRehireBtn.hidden = employee.status !== 'terminated';

  document.getElementById('employeeFirstName').value = employee.first_name || '';
  document.getElementById('employeeLastName').value = employee.last_name || '';
  document.getElementById('employeeEmail').value = employee.email || '';
  document.getElementById('employeePhone').value = employee.phone || '';
  document.getElementById('employeeJobPosition').value = employee.job_position || '';
  document.getElementById('employeeDepartment').value = employee.department || '';
  document.getElementById('employeeSubDepartment').value = employee.sub_department || '';
  document.getElementById('employeeType').value = employee.employee_type || 'primary';
  document.getElementById('employeeContractStart').value = employee.contract_start_date || '';

  const comp = employee.compensation || {};
  document.getElementById('employeeBasicPay').value = comp.basicPay ? rawMoney(comp.basicPay) : '';
  earningComponents.forEach(item => {
    const input = document.getElementById(compFieldId(item.id));
    if (input) input.value = comp[item.id] ? rawMoney(comp[item.id]) : '';
  });
  document.getElementById('employeePensionRateField').value = comp.employeePensionRate || '';
  document.getElementById('employerPensionRateField').value = comp.employerPensionRate || '';
  document.getElementById('employeeLifeInsurance').value = comp.lifeInsurance ? rawMoney(comp.lifeInsurance) : '';
  document.getElementById('employeeEducationInsurance').value = comp.educationInsurance ? rawMoney(comp.educationInsurance) : '';
  document.getElementById('employeeOtherDeductions').value = comp.otherDeductions ? rawMoney(comp.otherDeductions) : '';

  const toggles = employee.statutory_toggles || {};
  earningComponents.forEach(item => {
    const saved = toggles[item.id] || {};
    ['Nssf', 'Shif', 'Ahl'].forEach(stat => {
      const checkbox = document.getElementById(compFieldId(item.id, `Affects${stat}`));
      if (checkbox) checkbox.checked = !!saved[stat.toLowerCase()];
    });
  });
}

function collectFormData() {
  const compensation = {
    basicPay: toNumber(document.getElementById('employeeBasicPay').value),
    employeePensionRate: toNumber(document.getElementById('employeePensionRateField').value),
    employerPensionRate: toNumber(document.getElementById('employerPensionRateField').value),
    lifeInsurance: toNumber(document.getElementById('employeeLifeInsurance').value),
    educationInsurance: toNumber(document.getElementById('employeeEducationInsurance').value),
    otherDeductions: toNumber(document.getElementById('employeeOtherDeductions').value)
  };
  const statutoryToggles = {};
  earningComponents.forEach(item => {
    compensation[item.id] = toNumber(document.getElementById(compFieldId(item.id)).value);
    statutoryToggles[item.id] = {
      nssf: document.getElementById(compFieldId(item.id, 'AffectsNssf')).checked,
      shif: document.getElementById(compFieldId(item.id, 'AffectsShif')).checked,
      ahl: document.getElementById(compFieldId(item.id, 'AffectsAhl')).checked
    };
  });

  return {
    first_name: document.getElementById('employeeFirstName').value.trim(),
    last_name: document.getElementById('employeeLastName').value.trim(),
    email: document.getElementById('employeeEmail').value.trim() || null,
    phone: document.getElementById('employeePhone').value.trim() || null,
    job_position: document.getElementById('employeeJobPosition').value.trim() || null,
    department: document.getElementById('employeeDepartment').value.trim() || null,
    sub_department: document.getElementById('employeeSubDepartment').value.trim() || null,
    employee_type: document.getElementById('employeeType').value,
    contract_start_date: document.getElementById('employeeContractStart').value || null,
    compensation,
    statutory_toggles: statutoryToggles,
    updated_at: new Date().toISOString()
  };
}

async function loadEmployees() {
  employeesLoaded = true;
  let query = supabase.from('employees').select('*').order('first_name', { ascending: true });
  if (currentStatusFilter !== 'all') query = query.eq('status', currentStatusFilter);

  const { data, error } = await query;
  if (error) {
    employeeTableBody.innerHTML = '';
    employeesEmptyState.hidden = false;
    employeesEmptyState.textContent = 'Could not load employees. Please try again.';
    return;
  }

  renderEmployeeTable(data || []);
}

function renderEmployeeTable(employees) {
  employeesEmptyState.hidden = employees.length > 0;
  employeesEmptyState.textContent = 'No employees here yet.';

  employeeTableBody.innerHTML = employees.map(emp => `
    <tr data-id="${emp.id}">
      <td>${emp.first_name} ${emp.last_name}</td>
      <td>${emp.job_position || '—'}</td>
      <td>${emp.department || '—'}</td>
      <td>${employeeTypeLabels[emp.employee_type] || emp.employee_type}</td>
      <td><span class="status-pill status-${emp.status}">${emp.status === 'active' ? 'Active' : 'Terminated'}</span></td>
      <td><button type="button" class="ghost-button employee-edit-btn" data-id="${emp.id}">Edit</button></td>
    </tr>
  `).join('');
}

addEmployeeBtn.addEventListener('click', () => {
  resetForm();
  renderCompensationFields();
  showForm();
});

employeeFormBackBtn.addEventListener('click', showDirectory);

statusFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    currentStatusFilter = btn.dataset.statusFilter;
    statusFilterButtons.forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    loadEmployees();
  });
});

employeeTableBody.addEventListener('click', async event => {
  const btn = event.target.closest('.employee-edit-btn');
  if (!btn) return;
  const { data, error } = await supabase.from('employees').select('*').eq('id', btn.dataset.id).single();
  if (error || !data) return;
  resetForm();
  renderCompensationFields();
  populateForm(data);
  showForm();
});

employeeForm.addEventListener('submit', async event => {
  event.preventDefault();
  employeeFormError.hidden = true;

  const payload = collectFormData();
  if (!payload.first_name || !payload.last_name) {
    employeeFormError.textContent = 'First and last name are required.';
    employeeFormError.hidden = false;
    return;
  }

  employeeSaveBtn.disabled = true;
  try {
    if (currentEmployeeId) {
      const { error } = await supabase.from('employees').update(payload).eq('id', currentEmployeeId);
      if (error) throw error;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('employees').insert({ ...payload, user_id: user.id });
      if (error) throw error;
    }
    showDirectory();
  } catch (err) {
    employeeFormError.textContent = err.message || 'Could not save employee.';
    employeeFormError.hidden = false;
  } finally {
    employeeSaveBtn.disabled = false;
  }
});

employeeTerminateBtn.addEventListener('click', () => {
  if (!currentEmployeeId) return;
  terminateError.hidden = true;
  terminateForm.reset();
  terminateEmployeeName.textContent = `Terminate ${employeeFormTitle.textContent}`;
  terminateOverlay.hidden = false;
});

terminateCloseBtn.addEventListener('click', () => { terminateOverlay.hidden = true; });
terminateCancelBtn.addEventListener('click', () => { terminateOverlay.hidden = true; });

terminateForm.addEventListener('submit', async event => {
  event.preventDefault();
  terminateError.hidden = true;

  if (!terminateDate.value || !terminateReason.value.trim()) {
    terminateError.textContent = 'A termination date and reason are both required.';
    terminateError.hidden = false;
    return;
  }

  const { error } = await supabase.from('employees').update({
    status: 'terminated',
    termination_date: terminateDate.value,
    termination_reason: terminateReason.value.trim(),
    updated_at: new Date().toISOString()
  }).eq('id', currentEmployeeId);

  if (error) {
    terminateError.textContent = error.message || 'Could not terminate employee.';
    terminateError.hidden = false;
    return;
  }

  terminateOverlay.hidden = true;
  showDirectory();
});

employeeRehireBtn.addEventListener('click', async () => {
  if (!currentEmployeeId) return;
  const { error } = await supabase.from('employees').update({
    status: 'active',
    termination_date: null,
    termination_reason: null,
    updated_at: new Date().toISOString()
  }).eq('id', currentEmployeeId);

  if (!error) showDirectory();
});

document.addEventListener('app:page', event => {
  if (event.detail.page === 'employees' && !employeesLoaded) loadEmployees();
  if (event.detail.page === 'employees') showDirectory();
});
