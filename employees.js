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
const assignMissingNumbersBtn = document.getElementById('assignMissingNumbersBtn');
const assignMissingNumbersInfo = document.getElementById('assignMissingNumbersInfo');
const statusFilterButtons = [...document.querySelectorAll('[data-status-filter]')];
const employeeTableBody = document.getElementById('employeeTableBody');
const employeesEmptyState = document.getElementById('employeesEmptyState');
const employeeFormTitle = document.getElementById('employeeFormTitle');
const employeeFormNumber = document.getElementById('employeeFormNumber');
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

const employeeTypeDropdown = document.getElementById('employeeTypeDropdown');
const employeeTypeTrigger = document.getElementById('employeeTypeTrigger');
const employeeTypeTriggerIcon = document.getElementById('employeeTypeTriggerIcon');
const employeeTypeTriggerText = document.getElementById('employeeTypeTriggerText');
const employeeTypePanel = document.getElementById('employeeTypePanel');
const employeeTypeOptions = [...employeeTypePanel.querySelectorAll('.classification-option')];
const employeeTypeSelect = document.getElementById('employeeType');

const settingsError = document.getElementById('settingsError');
const settingsInfo = document.getElementById('settingsInfo');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const settingsPage = document.getElementById('settingsPage');

const settingsEmpNumPrefix = document.getElementById('settingsEmpNumPrefix');
const settingsEmpNumPadding = document.getElementById('settingsEmpNumPadding');
const settingsEmpNumSeparator = document.getElementById('settingsEmpNumSeparator');
const settingsEmpNumIncludeYear = document.getElementById('settingsEmpNumIncludeYear');
const settingsEmpNumIncludeMonth = document.getElementById('settingsEmpNumIncludeMonth');
const settingsEmpNumPreview = document.getElementById('settingsEmpNumPreview');

const settingsWorkingDays = document.getElementById('settingsWorkingDays');
const settingsWorkStartTime = document.getElementById('settingsWorkStartTime');
const settingsWorkHoursPerDay = document.getElementById('settingsWorkHoursPerDay');
const settingsBreakMinutes = document.getElementById('settingsBreakMinutes');
const settingsWorkEndTimeDisplay = document.getElementById('settingsWorkEndTimeDisplay');

const LOOKUP_LIST_ELS = { job_positions: 'jobPositionsList', departments: 'departmentsList', sub_departments: 'subDepartmentsList' };
const LOOKUP_INPUT_ELS = { job_positions: 'jobPositionInput', departments: 'departmentInput', sub_departments: 'subDepartmentInput' };

let currentStatusFilter = 'active';
let currentEmployeeId = null;
let currentEmployeeStatus = 'active';
let employeesLoaded = false;
let cachedSettings = null;
let settingsLoadPromise = null;

function defaultSettings() {
  return {
    nssf_rate: 6, nssf_upper_limit: 108000, shif_rate: 2.75, shif_minimum: 300,
    ahl_employee_rate: 1.5, ahl_employer_rate: 1.5, personal_relief: 2400, nita_levy: 50,
    insurance_relief_cap: 5000, telephone_threshold: 5000, meals_threshold: 5000,
    allowable_deduction_cap: 30000, per_diem_threshold: 10000, days_in_month: 30,
    secondary_flat_rate: 35, contractor_wht_rate: 5, pwd_exemption: 150000,
    job_positions: [], departments: [], sub_departments: [],
    employee_number_prefix: 'EMP', employee_number_padding: 3, employee_number_separator: '',
    employee_number_include_year: false, employee_number_include_month: false,
    employee_number_next: 1,
    business_name: '',
    working_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    work_start_time: '08:00',
    work_hours_per_day: 8,
    break_minutes: 60
  };
}

async function loadSettings({ force = false } = {}) {
  if (cachedSettings && !force) return cachedSettings;
  if (!settingsLoadPromise || force) {
    settingsLoadPromise = supabase.from('payroll_settings').select('*').maybeSingle().then(({ data }) => {
      cachedSettings = data || defaultSettings();
      return cachedSettings;
    });
  }
  return settingsLoadPromise;
}

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

// ---------------------------------------------------------------------
// Compensation history — dated entries that override the flat
// compensation/optional-deduction fields above for whichever payroll
// period they cover. A component with no dated entries just keeps
// using the flat field, unchanged, so existing employees nobody
// touches this for are completely unaffected.
// ---------------------------------------------------------------------

const EARNING_TYPE_OPTIONS = earningComponents.map(item => ({
  key: item.id,
  label: item.label,
  bucket: item.id === 'otherCashAllowance' || item.id === 'otherNonCashBenefit'
}));

const DEDUCTION_TYPE_OPTIONS = [
  { key: 'employeePensionRate', label: 'Employee pension %', bucket: false },
  { key: 'employerPensionRate', label: 'Employer pension %', bucket: false },
  { key: 'lifeInsurance', label: 'Life insurance premium', bucket: false },
  { key: 'educationInsurance', label: 'Education insurance premium', bucket: false },
  { key: 'otherDeductions', label: 'Other deduction', bucket: true }
];

const COMP_HISTORY_SECTIONS = {
  basic: {
    types: [{ key: 'basicPay', label: 'Basic pay', bucket: false }],
    hasTypeSelect: false,
    ids: {
      showExpired: 'compHistoryBasicShowExpired', tableBody: 'compHistoryBasicTableBody',
      amount: 'compHistoryBasicAmount', start: 'compHistoryBasicStart', end: 'compHistoryBasicEnd',
      addBtn: 'compHistoryBasicAddBtn', error: 'compHistoryBasicError', typeSelect: null, labelInput: null
    }
  },
  earning: {
    types: EARNING_TYPE_OPTIONS,
    hasTypeSelect: true,
    ids: {
      showExpired: 'compHistoryEarningShowExpired', tableBody: 'compHistoryEarningTableBody',
      amount: 'compHistoryEarningAmount', start: 'compHistoryEarningStart', end: 'compHistoryEarningEnd',
      addBtn: 'compHistoryEarningAddBtn', error: 'compHistoryEarningError',
      typeSelect: 'compHistoryEarningType', labelInput: 'compHistoryEarningLabel'
    }
  },
  deduction: {
    types: DEDUCTION_TYPE_OPTIONS,
    hasTypeSelect: true,
    ids: {
      showExpired: 'compHistoryDeductionShowExpired', tableBody: 'compHistoryDeductionTableBody',
      amount: 'compHistoryDeductionAmount', start: 'compHistoryDeductionStart', end: 'compHistoryDeductionEnd',
      addBtn: 'compHistoryDeductionAddBtn', error: 'compHistoryDeductionError',
      typeSelect: 'compHistoryDeductionType', labelInput: 'compHistoryDeductionLabel'
    }
  }
};

let compensationItemsCache = [];
const compHistoryEditingId = { basic: null, earning: null, deduction: null };

function todayStrLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function compHistoryEl(sectionKey, part) {
  const id = COMP_HISTORY_SECTIONS[sectionKey].ids[part];
  return id ? document.getElementById(id) : null;
}

function compHistoryItemsFor(sectionKey) {
  const keys = COMP_HISTORY_SECTIONS[sectionKey].types.map(t => t.key);
  return compensationItemsCache.filter(i => keys.includes(i.component_key));
}

async function loadCompensationItems(employeeId) {
  if (!employeeId) { compensationItemsCache = []; return; }
  const { data } = await supabase.from('employee_compensation_items').select('*').eq('employee_id', employeeId).order('start_date', { ascending: false });
  compensationItemsCache = data || [];
}

function renderCompHistoryTypeSelect(sectionKey) {
  const cfg = COMP_HISTORY_SECTIONS[sectionKey];
  if (!cfg.hasTypeSelect) return;
  const select = compHistoryEl(sectionKey, 'typeSelect');
  select.innerHTML = cfg.types.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
  select.addEventListener('change', () => {
    const type = cfg.types.find(t => t.key === select.value);
    const labelInput = compHistoryEl(sectionKey, 'labelInput');
    labelInput.hidden = !type?.bucket;
    if (!type?.bucket) labelInput.value = '';
  });
  select.dispatchEvent(new Event('change'));
}

function renderCompHistorySection(sectionKey) {
  const cfg = COMP_HISTORY_SECTIONS[sectionKey];
  const showExpired = compHistoryEl(sectionKey, 'showExpired').checked;
  const today = todayStrLocal();
  const items = compHistoryItemsFor(sectionKey)
    .filter(i => showExpired || !i.end_date || i.end_date >= today)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));

  const colCount = (cfg.hasTypeSelect ? 1 : 0) + 4;
  const tbody = compHistoryEl(sectionKey, 'tableBody');
  tbody.innerHTML = items.length
    ? items.map(i => `
        <tr data-id="${i.id}">
          ${cfg.hasTypeSelect ? `<td>${i.label}</td>` : ''}
          <td>${rawMoney(i.amount)}</td>
          <td>${i.start_date}</td>
          <td>${i.end_date || '—'}</td>
          <td>
            <button type="button" class="ghost-button comp-history-edit-btn" data-section="${sectionKey}" data-id="${i.id}">Edit</button>
            <button type="button" class="ghost-button comp-history-delete-btn" data-section="${sectionKey}" data-id="${i.id}">Delete</button>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="${colCount}">No entries${showExpired ? '' : ' (or all are expired — check "Show expired entries")'}.</td></tr>`;
}

function renderAllCompHistorySections() {
  Object.keys(COMP_HISTORY_SECTIONS).forEach(renderCompHistorySection);
}

function resetCompHistoryForm(sectionKey) {
  compHistoryEditingId[sectionKey] = null;
  const cfg = COMP_HISTORY_SECTIONS[sectionKey];
  compHistoryEl(sectionKey, 'amount').value = '';
  compHistoryEl(sectionKey, 'start').value = '';
  compHistoryEl(sectionKey, 'end').value = '';
  if (cfg.hasTypeSelect) {
    compHistoryEl(sectionKey, 'typeSelect').selectedIndex = 0;
    compHistoryEl(sectionKey, 'typeSelect').dispatchEvent(new Event('change'));
  }
  compHistoryEl(sectionKey, 'addBtn').textContent = 'Add entry';
}

function setCompHistoryFormsEnabled(enabled) {
  Object.values(COMP_HISTORY_SECTIONS).forEach(cfg => {
    [cfg.ids.amount, cfg.ids.start, cfg.ids.end, cfg.ids.addBtn, cfg.ids.typeSelect, cfg.ids.labelInput]
      .filter(Boolean)
      .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !enabled; });
  });
}

// A dated entry conflicts with another only if it shares the same
// component AND label (so multiple differently-labelled entries under
// a catch-all bucket like "Other deduction" can freely coexist) and
// their date ranges overlap (open-ended end dates treated as infinite).
function compHistoryOverlaps(aStart, aEnd, bStart, bEnd) {
  const aEndEff = aEnd || '9999-12-31';
  const bEndEff = bEnd || '9999-12-31';
  return aStart <= bEndEff && bStart <= aEndEff;
}

function findConflictingCompItem(componentKey, label, startDate, endDate, excludeId) {
  const normalizedLabel = label.trim().toLowerCase();
  return compensationItemsCache.find(i => {
    if (i.id === excludeId) return false;
    if (i.component_key !== componentKey) return false;
    if ((i.label || '').trim().toLowerCase() !== normalizedLabel) return false;
    return compHistoryOverlaps(startDate, endDate, i.start_date, i.end_date);
  });
}

async function submitCompHistoryEntry(sectionKey) {
  const cfg = COMP_HISTORY_SECTIONS[sectionKey];
  const errorEl = compHistoryEl(sectionKey, 'error');
  errorEl.hidden = true;

  if (!currentEmployeeId) {
    errorEl.textContent = 'Save this employee first.';
    errorEl.hidden = false;
    return;
  }

  let componentKey, label;
  if (cfg.hasTypeSelect) {
    const type = cfg.types.find(t => t.key === compHistoryEl(sectionKey, 'typeSelect').value);
    componentKey = type.key;
    label = type.bucket ? compHistoryEl(sectionKey, 'labelInput').value.trim() : type.label;
    if (type.bucket && !label) {
      errorEl.textContent = 'A label is required for a custom entry.';
      errorEl.hidden = false;
      return;
    }
  } else {
    componentKey = cfg.types[0].key;
    label = cfg.types[0].label;
  }

  const amount = toNumber(compHistoryEl(sectionKey, 'amount').value);
  const startDate = compHistoryEl(sectionKey, 'start').value;
  const endDate = compHistoryEl(sectionKey, 'end').value || null;

  if (!startDate) {
    errorEl.textContent = 'A start date is required.';
    errorEl.hidden = false;
    return;
  }
  if (endDate && endDate < startDate) {
    errorEl.textContent = 'End date must be on or after the start date.';
    errorEl.hidden = false;
    return;
  }

  const editingId = compHistoryEditingId[sectionKey];
  const conflict = findConflictingCompItem(componentKey, label, startDate, endDate, editingId);
  if (conflict) {
    errorEl.textContent = `This overlaps an existing "${conflict.label}" entry (${conflict.start_date} to ${conflict.end_date || 'ongoing'}).`;
    errorEl.hidden = false;
    return;
  }

  const addBtn = compHistoryEl(sectionKey, 'addBtn');
  addBtn.disabled = true;
  try {
    if (editingId) {
      const { error } = await supabase.from('employee_compensation_items').update({
        component_key: componentKey, label, amount, start_date: startDate, end_date: endDate, updated_at: new Date().toISOString()
      }).eq('id', editingId);
      if (error) throw error;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('employee_compensation_items').insert({
        user_id: user.id, employee_id: currentEmployeeId, component_key: componentKey, label, amount, start_date: startDate, end_date: endDate
      });
      if (error) throw error;
    }
    await loadCompensationItems(currentEmployeeId);
    renderCompHistorySection(sectionKey);
    resetCompHistoryForm(sectionKey);
  } catch (err) {
    errorEl.textContent = err.message || 'Could not save this entry.';
    errorEl.hidden = false;
  } finally {
    addBtn.disabled = false;
  }
}

async function deleteCompHistoryItem(sectionKey, id) {
  const { error } = await supabase.from('employee_compensation_items').delete().eq('id', id);
  if (!error) {
    if (compHistoryEditingId[sectionKey] === id) resetCompHistoryForm(sectionKey);
    await loadCompensationItems(currentEmployeeId);
    renderCompHistorySection(sectionKey);
  }
}

function wireCompHistorySection(sectionKey) {
  const cfg = COMP_HISTORY_SECTIONS[sectionKey];
  renderCompHistoryTypeSelect(sectionKey);

  compHistoryEl(sectionKey, 'tableBody').addEventListener('click', event => {
    const editBtn = event.target.closest('.comp-history-edit-btn');
    const delBtn = event.target.closest('.comp-history-delete-btn');
    if (editBtn) {
      const item = compensationItemsCache.find(i => i.id === editBtn.dataset.id);
      if (!item) return;
      compHistoryEditingId[sectionKey] = item.id;
      if (cfg.hasTypeSelect) {
        const typeSelect = compHistoryEl(sectionKey, 'typeSelect');
        typeSelect.value = item.component_key;
        typeSelect.dispatchEvent(new Event('change'));
        const type = cfg.types.find(t => t.key === item.component_key);
        if (type?.bucket) compHistoryEl(sectionKey, 'labelInput').value = item.label;
      }
      compHistoryEl(sectionKey, 'amount').value = rawMoney(item.amount);
      compHistoryEl(sectionKey, 'start').value = item.start_date;
      compHistoryEl(sectionKey, 'end').value = item.end_date || '';
      compHistoryEl(sectionKey, 'addBtn').textContent = 'Update entry';
    }
    if (delBtn) deleteCompHistoryItem(sectionKey, delBtn.dataset.id);
  });

  compHistoryEl(sectionKey, 'showExpired').addEventListener('change', () => renderCompHistorySection(sectionKey));
  compHistoryEl(sectionKey, 'addBtn').addEventListener('click', () => submitCompHistoryEntry(sectionKey));
}

Object.keys(COMP_HISTORY_SECTIONS).forEach(wireCompHistorySection);
attachMoneyBlurFormatting(document.getElementById('compHistoryBasicAddRow'));
attachMoneyBlurFormatting(document.getElementById('compHistoryEarningAddRow'));

// Reusable dropdown controller — same open/close/select behavior and
// visual style as the Employee Type picker, but for a flat, dynamic list
// of plain strings (job positions/departments/sub-departments) instead of
// a fixed set of icon+description options.
function createLookupDropdown(fieldId) {
  const dropdown = document.getElementById(`${fieldId}Dropdown`);
  const trigger = document.getElementById(`${fieldId}Trigger`);
  const triggerText = document.getElementById(`${fieldId}TriggerText`);
  const panel = document.getElementById(`${fieldId}Panel`);
  const select = document.getElementById(fieldId);

  function close() {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }
  function open() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  }
  function sync() {
    const value = select.value;
    triggerText.textContent = value || '— Select —';
    panel.querySelectorAll('.classification-option').forEach(btn => {
      btn.classList.toggle('is-selected', btn.dataset.value === value);
    });
  }

  trigger.addEventListener('click', () => { panel.hidden ? open() : close(); });
  document.addEventListener('click', event => {
    if (!dropdown.contains(event.target)) close();
  });

  function setOptions(items, ensureValue) {
    const options = [...items];
    // Never silently drop an employee's existing value if it was since
    // removed from the canonical list in Settings — editing them would
    // otherwise overwrite it with blank on save.
    if (ensureValue && !options.includes(ensureValue)) options.push(ensureValue);

    select.innerHTML = '<option value="">— Select —</option>' +
      options.map(item => `<option value="${item}">${item}</option>`).join('');
    select.value = ensureValue || '';

    panel.innerHTML = `<button type="button" class="classification-option simple" data-value="">— Select —</button>` +
      options.map(item => `<button type="button" class="classification-option simple" data-value="${item}">${item}</button>`).join('');
    panel.querySelectorAll('.classification-option').forEach(btn => {
      btn.addEventListener('click', () => {
        select.value = btn.dataset.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        close();
      });
    });
    sync();
  }

  return { setOptions };
}

const jobPositionDropdown = createLookupDropdown('employeeJobPosition');
const departmentDropdown = createLookupDropdown('employeeDepartment');
const subDepartmentDropdown = createLookupDropdown('employeeSubDepartment');

async function populateJobSelects(employee) {
  const settings = await loadSettings();
  jobPositionDropdown.setOptions(settings.job_positions || [], employee?.job_position);
  departmentDropdown.setOptions(settings.departments || [], employee?.department);
  subDepartmentDropdown.setOptions(settings.sub_departments || [], employee?.sub_department);
}

function closeEmployeeTypePanel() {
  employeeTypePanel.hidden = true;
  employeeTypeTrigger.setAttribute('aria-expanded', 'false');
}

function syncEmployeeTypeTrigger() {
  const value = employeeTypeSelect.value;
  const option = employeeTypeOptions.find(o => o.dataset.value === value) || employeeTypeOptions[0];
  employeeTypeTriggerIcon.textContent = option.dataset.icon;
  employeeTypeTriggerText.textContent = option.dataset.label;
  employeeTypeOptions.forEach(o => o.classList.toggle('is-selected', o === option));
}

employeeTypeTrigger.addEventListener('click', () => {
  const opening = employeeTypePanel.hidden;
  employeeTypePanel.hidden = !opening;
  employeeTypeTrigger.setAttribute('aria-expanded', String(opening));
});

employeeTypeOptions.forEach(option => {
  option.addEventListener('click', () => {
    employeeTypeSelect.value = option.dataset.value;
    syncEmployeeTypeTrigger();
    closeEmployeeTypePanel();
  });
});

document.addEventListener('click', event => {
  if (!employeeTypeDropdown.contains(event.target)) closeEmployeeTypePanel();
});

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
  employeeFormNumber.hidden = false;
  employeeFormNumber.textContent = 'Number assigned on save';
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
  syncEmployeeTypeTrigger();
}

function populateForm(employee) {
  currentEmployeeId = employee.id;
  currentEmployeeStatus = employee.status;
  employeeFormTitle.textContent = `${employee.first_name} ${employee.last_name}`;
  employeeFormNumber.hidden = !employee.employee_number;
  employeeFormNumber.textContent = employee.employee_number || '';
  employeeTerminateBtn.hidden = employee.status !== 'active';
  employeeRehireBtn.hidden = employee.status !== 'terminated';

  document.getElementById('employeeFirstName').value = employee.first_name || '';
  document.getElementById('employeeLastName').value = employee.last_name || '';
  document.getElementById('employeeEmail').value = employee.email || '';
  document.getElementById('employeePhone').value = employee.phone || '';
  document.getElementById('employeeGender').value = employee.gender || '';
  // Job position/department/sub-department are populated separately via
  // populateJobSelects(employee), which must run before this so the
  // relevant <option> exists (including a fallback if it was since
  // removed from Settings) before we try to select it.
  document.getElementById('employeeType').value = employee.employee_type || 'primary';
  syncEmployeeTypeTrigger();
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
    gender: document.getElementById('employeeGender').value || null,
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
  checkMissingNumbers();
}

// Scoped to all employees regardless of the current status filter, so
// the button doesn't stay hidden just because the visible tab happens
// to be fully numbered while another status bucket isn't.
async function checkMissingNumbers() {
  const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true }).is('employee_number', null);
  assignMissingNumbersBtn.hidden = !count;
}

assignMissingNumbersBtn.addEventListener('click', async () => {
  assignMissingNumbersBtn.disabled = true;
  assignMissingNumbersInfo.hidden = true;
  try {
    const { data: missing, error } = await supabase.from('employees').select('id').is('employee_number', null);
    if (error) throw error;

    let assigned = 0;
    for (const emp of missing || []) {
      const { data: employeeNumber, error: numberError } = await supabase.rpc('next_employee_number');
      if (numberError) throw numberError;
      const { error: updateError } = await supabase.from('employees').update({ employee_number: employeeNumber }).eq('id', emp.id);
      if (updateError) throw updateError;
      assigned += 1;
    }

    assignMissingNumbersInfo.textContent = assigned
      ? `Assigned ${assigned} employee number${assigned === 1 ? '' : 's'}.`
      : 'No employees were missing a number.';
    assignMissingNumbersInfo.hidden = false;
    await loadEmployees();
  } catch (err) {
    assignMissingNumbersInfo.textContent = err.message || 'Could not assign missing numbers.';
    assignMissingNumbersInfo.hidden = false;
  } finally {
    assignMissingNumbersBtn.disabled = false;
  }
});

function renderEmployeeTable(employees) {
  employeesEmptyState.hidden = employees.length > 0;
  employeesEmptyState.textContent = 'No employees here yet.';

  employeeTableBody.innerHTML = employees.map(emp => `
    <tr data-id="${emp.id}">
      <td>${emp.employee_number || '—'}</td>
      <td>${emp.first_name} ${emp.last_name}</td>
      <td>${emp.job_position || '—'}</td>
      <td>${emp.department || '—'}</td>
      <td>${employeeTypeLabels[emp.employee_type] || emp.employee_type}</td>
      <td><span class="status-pill status-${emp.status}">${emp.status === 'active' ? 'Active' : 'Terminated'}</span></td>
      <td><button type="button" class="ghost-button employee-edit-btn" data-id="${emp.id}">Edit</button></td>
    </tr>
  `).join('');
}

addEmployeeBtn.addEventListener('click', async () => {
  resetForm();
  renderCompensationFields();
  compensationItemsCache = [];
  Object.keys(COMP_HISTORY_SECTIONS).forEach(sectionKey => { resetCompHistoryForm(sectionKey); renderCompHistorySection(sectionKey); });
  setCompHistoryFormsEnabled(false);
  showForm();
  await populateJobSelects();
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
  await populateJobSelects(data);
  populateForm(data);
  await loadCompensationItems(data.id);
  Object.keys(COMP_HISTORY_SECTIONS).forEach(sectionKey => { resetCompHistoryForm(sectionKey); renderCompHistorySection(sectionKey); });
  setCompHistoryFormsEnabled(true);
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
      const { data: employeeNumber, error: numberError } = await supabase.rpc('next_employee_number');
      if (numberError) throw numberError;
      const { error } = await supabase.from('employees').insert({ ...payload, employee_number: employeeNumber, user_id: user.id });
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

function renderLookupList(key, items) {
  const container = document.getElementById(LOOKUP_LIST_ELS[key]);
  if (!items.length) {
    container.innerHTML = '<p class="lookup-empty">None added yet.</p>';
    return;
  }
  container.innerHTML = items.map((item, idx) => `
    <span class="lookup-item">${item}<button type="button" data-remove="${key}" data-index="${idx}" aria-label="Remove ${item}">&times;</button></span>
  `).join('');
}

function populateSettingsForm(s) {
  document.getElementById('settingsBusinessName').value = s.business_name || '';
  document.getElementById('settingsNssfRate').value = s.nssf_rate;
  document.getElementById('settingsNssfUpperLimit').value = rawMoney(s.nssf_upper_limit);
  document.getElementById('settingsShifRate').value = s.shif_rate;
  document.getElementById('settingsShifMinimum').value = rawMoney(s.shif_minimum);
  document.getElementById('settingsAhlEmployeeRate').value = s.ahl_employee_rate;
  document.getElementById('settingsAhlEmployerRate').value = s.ahl_employer_rate;
  document.getElementById('settingsPersonalRelief').value = rawMoney(s.personal_relief);
  document.getElementById('settingsNitaLevy').value = rawMoney(s.nita_levy);
  document.getElementById('settingsTelephoneThreshold').value = rawMoney(s.telephone_threshold);
  document.getElementById('settingsMealsThreshold').value = rawMoney(s.meals_threshold);
  document.getElementById('settingsAllowableDeductionCap').value = rawMoney(s.allowable_deduction_cap);
  document.getElementById('settingsPerDiemThreshold').value = rawMoney(s.per_diem_threshold);
  document.getElementById('settingsDaysInMonth').value = s.days_in_month;
  document.getElementById('settingsInsuranceReliefCap').value = rawMoney(s.insurance_relief_cap);
  document.getElementById('settingsSecondaryFlatRate').value = s.secondary_flat_rate;
  document.getElementById('settingsContractorWhtRate').value = s.contractor_wht_rate;
  document.getElementById('settingsPwdExemption').value = rawMoney(s.pwd_exemption);
  renderLookupList('job_positions', s.job_positions || []);
  renderLookupList('departments', s.departments || []);
  renderLookupList('sub_departments', s.sub_departments || []);
  settingsEmpNumPrefix.value = s.employee_number_prefix ?? 'EMP';
  settingsEmpNumPadding.value = s.employee_number_padding ?? 3;
  settingsEmpNumSeparator.value = s.employee_number_separator ?? '';
  settingsEmpNumIncludeYear.checked = !!s.employee_number_include_year;
  settingsEmpNumIncludeMonth.checked = !!s.employee_number_include_month;
  updateEmployeeNumberPreview(s.employee_number_next ?? 1);

  const workingDays = s.working_days || ['mon', 'tue', 'wed', 'thu', 'fri'];
  [...settingsWorkingDays.querySelectorAll('input')].forEach(cb => { cb.checked = workingDays.includes(cb.value); });
  settingsWorkStartTime.value = s.work_start_time ? s.work_start_time.slice(0, 5) : '08:00';
  settingsWorkHoursPerDay.value = s.work_hours_per_day ?? 8;
  settingsBreakMinutes.value = s.break_minutes ?? 60;
  updateWorkEndTimePreview();
}

function updateWorkEndTimePreview() {
  const [sh, sm] = (settingsWorkStartTime.value || '08:00').split(':').map(Number);
  const hours = toNumber(settingsWorkHoursPerDay.value) || 0;
  const breakMinutes = toNumber(settingsBreakMinutes.value) || 0;
  const totalMinutes = sh * 60 + sm + hours * 60 + breakMinutes;
  const endH = Math.floor((totalMinutes / 60) % 24);
  const endM = Math.round(totalMinutes % 60);
  settingsWorkEndTimeDisplay.value = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
}

[settingsWorkStartTime, settingsWorkHoursPerDay, settingsBreakMinutes].forEach(el => {
  el.addEventListener('input', updateWorkEndTimePreview);
});

function updateEmployeeNumberPreview(nextNumber = cachedSettings?.employee_number_next ?? 1) {
  const prefix = settingsEmpNumPrefix.value.trim();
  const padding = Math.max(toNumber(settingsEmpNumPadding.value) || 3, 1);
  const separator = settingsEmpNumSeparator.value;
  const now = new Date();
  const parts = [];
  if (prefix) parts.push(prefix);
  if (settingsEmpNumIncludeYear.checked) parts.push(String(now.getFullYear()));
  if (settingsEmpNumIncludeMonth.checked) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
  parts.push(String(nextNumber).padStart(padding, '0'));
  settingsEmpNumPreview.textContent = parts.join(separator);
}

[settingsEmpNumPrefix, settingsEmpNumPadding, settingsEmpNumSeparator, settingsEmpNumIncludeYear, settingsEmpNumIncludeMonth].forEach(el => {
  el.addEventListener('input', () => updateEmployeeNumberPreview());
});

function setSettingsPageBusy(busy) {
  settingsPage.querySelectorAll('input, textarea, select, button').forEach(el => { el.disabled = busy; });
}

async function showSettingsPage() {
  setSettingsPageBusy(true);
  try {
    const settings = await loadSettings({ force: true });
    populateSettingsForm(settings);
  } finally {
    setSettingsPageBusy(false);
  }
}

Object.entries(LOOKUP_INPUT_ELS).forEach(([key, inputId]) => {
  const addBtn = document.querySelector(`[data-lookup-add="${key}"]`);
  const input = document.getElementById(inputId);
  const addItem = () => {
    const value = input.value.trim();
    if (!value) return;
    if (!cachedSettings) cachedSettings = defaultSettings();
    if (!cachedSettings[key]) cachedSettings[key] = [];
    if (cachedSettings[key].includes(value)) { input.value = ''; return; }
    cachedSettings[key].push(value);
    renderLookupList(key, cachedSettings[key]);
    input.value = '';
    input.focus();
  };
  addBtn.addEventListener('click', addItem);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); addItem(); }
  });
});

settingsPage.addEventListener('click', event => {
  const removeBtn = event.target.closest('[data-remove]');
  if (!removeBtn) return;
  const key = removeBtn.dataset.remove;
  const idx = Number(removeBtn.dataset.index);
  cachedSettings[key].splice(idx, 1);
  renderLookupList(key, cachedSettings[key]);
});

saveSettingsBtn.addEventListener('click', async () => {
  settingsError.hidden = true;
  settingsInfo.hidden = true;

  const payload = {
    business_name: document.getElementById('settingsBusinessName').value.trim(),
    working_days: [...settingsWorkingDays.querySelectorAll('input:checked')].map(cb => cb.value),
    work_start_time: settingsWorkStartTime.value || '08:00',
    work_hours_per_day: toNumber(settingsWorkHoursPerDay.value) || 8,
    break_minutes: Math.round(toNumber(settingsBreakMinutes.value)) || 0,
    nssf_rate: toNumber(document.getElementById('settingsNssfRate').value),
    nssf_upper_limit: toNumber(document.getElementById('settingsNssfUpperLimit').value),
    shif_rate: toNumber(document.getElementById('settingsShifRate').value),
    shif_minimum: toNumber(document.getElementById('settingsShifMinimum').value),
    ahl_employee_rate: toNumber(document.getElementById('settingsAhlEmployeeRate').value),
    ahl_employer_rate: toNumber(document.getElementById('settingsAhlEmployerRate').value),
    personal_relief: toNumber(document.getElementById('settingsPersonalRelief').value),
    nita_levy: toNumber(document.getElementById('settingsNitaLevy').value),
    insurance_relief_cap: toNumber(document.getElementById('settingsInsuranceReliefCap').value),
    telephone_threshold: toNumber(document.getElementById('settingsTelephoneThreshold').value),
    meals_threshold: toNumber(document.getElementById('settingsMealsThreshold').value),
    allowable_deduction_cap: toNumber(document.getElementById('settingsAllowableDeductionCap').value),
    per_diem_threshold: toNumber(document.getElementById('settingsPerDiemThreshold').value),
    days_in_month: toNumber(document.getElementById('settingsDaysInMonth').value),
    secondary_flat_rate: toNumber(document.getElementById('settingsSecondaryFlatRate').value),
    contractor_wht_rate: toNumber(document.getElementById('settingsContractorWhtRate').value),
    pwd_exemption: toNumber(document.getElementById('settingsPwdExemption').value),
    job_positions: cachedSettings?.job_positions || [],
    departments: cachedSettings?.departments || [],
    sub_departments: cachedSettings?.sub_departments || [],
    employee_number_prefix: settingsEmpNumPrefix.value.trim() || 'EMP',
    employee_number_padding: Math.max(toNumber(settingsEmpNumPadding.value) || 3, 1),
    employee_number_separator: settingsEmpNumSeparator.value,
    employee_number_include_year: settingsEmpNumIncludeYear.checked,
    employee_number_include_month: settingsEmpNumIncludeMonth.checked,
    updated_at: new Date().toISOString()
  };

  saveSettingsBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('payroll_settings')
      .upsert({ ...payload, user_id: user.id }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;

    cachedSettings = data;
    settingsInfo.textContent = 'Settings saved.';
    settingsInfo.hidden = false;
  } catch (err) {
    settingsError.textContent = err.message || 'Could not save settings.';
    settingsError.hidden = false;
  } finally {
    saveSettingsBtn.disabled = false;
  }
});

document.addEventListener('app:page', event => {
  const page = event.detail.page;
  if (page === 'employees') {
    if (!employeesLoaded) loadEmployees();
    showDirectory();
  }
  if (page === 'settings') showSettingsPage();
});
