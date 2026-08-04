import { supabase, callFunction, getGeolocation } from './auth.js';
import { hashReportPasscode, invalidateReportPasscodeCache } from './reportPasscode.js';

const { earningComponents, irregularComponentIds, classificationLabels, toNumber, money, rawMoney } = window.PayrollShared;

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
const employeeInviteError = document.getElementById('employeeInviteError');
const employeeInviteInfo = document.getElementById('employeeInviteInfo');
const bulkUploadEmployeesBtn = document.getElementById('bulkUploadEmployeesBtn');
const bulkUploadOverlay = document.getElementById('bulkUploadOverlay');
const bulkUploadCloseBtn = document.getElementById('bulkUploadCloseBtn');
const bulkUploadCancelBtn = document.getElementById('bulkUploadCancelBtn');
const bulkUploadTemplateBtn = document.getElementById('bulkUploadTemplateBtn');
const bulkUploadFile = document.getElementById('bulkUploadFile');
const bulkUploadFilename = document.getElementById('bulkUploadFilename');
const bulkUploadImportBtn = document.getElementById('bulkUploadImportBtn');
const bulkUploadError = document.getElementById('bulkUploadError');
const bulkUploadInfo = document.getElementById('bulkUploadInfo');
const bulkUploadResults = document.getElementById('bulkUploadResults');
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

const reportPasscodeStatus = document.getElementById('reportPasscodeStatus');
const settingsReportPasscode = document.getElementById('settingsReportPasscode');
const settingsReportPasscodeConfirm = document.getElementById('settingsReportPasscodeConfirm');
const settingsReportPasscodeError = document.getElementById('settingsReportPasscodeError');
const settingsReportPasscodeInfo = document.getElementById('settingsReportPasscodeInfo');
const settingsReportPasscodeSaveBtn = document.getElementById('settingsReportPasscodeSaveBtn');
const settingsReportPasscodeClearBtn = document.getElementById('settingsReportPasscodeClearBtn');

const settingsLoginWindowEnabled = document.getElementById('settingsLoginWindowEnabled');
const settingsLoginWindowStart = document.getElementById('settingsLoginWindowStart');
const settingsLoginWindowEnd = document.getElementById('settingsLoginWindowEnd');
const settingsGeofenceEnabled = document.getElementById('settingsGeofenceEnabled');
const settingsGeofenceLat = document.getElementById('settingsGeofenceLat');
const settingsGeofenceLng = document.getElementById('settingsGeofenceLng');
const settingsGeofenceRadius = document.getElementById('settingsGeofenceRadius');
const settingsGeofenceUseCurrentBtn = document.getElementById('settingsGeofenceUseCurrentBtn');
const settingsLoginSecurityError = document.getElementById('settingsLoginSecurityError');
const settingsLoginSecurityInfo = document.getElementById('settingsLoginSecurityInfo');
const settingsLoginSecuritySaveBtn = document.getElementById('settingsLoginSecuritySaveBtn');

const settingsLogoPreview = document.getElementById('settingsLogoPreview');
const settingsLogoPlaceholder = document.getElementById('settingsLogoPlaceholder');
const settingsLogoFile = document.getElementById('settingsLogoFile');
const settingsLogoUrlInput = document.getElementById('settingsLogoUrlInput');
const settingsLogoFetchBtn = document.getElementById('settingsLogoFetchBtn');
const settingsLogoRemoveBtn = document.getElementById('settingsLogoRemoveBtn');
const settingsLogoError = document.getElementById('settingsLogoError');

const LOOKUP_LIST_ELS = { job_positions: 'jobPositionsList', departments: 'departmentsList', sub_departments: 'subDepartmentsList' };
const LOOKUP_INPUT_ELS = { job_positions: 'jobPositionInput', departments: 'departmentInput', sub_departments: 'subDepartmentInput' };

let currentStatusFilter = 'active';
let currentEmployeeId = null;
let currentEmployeeStatus = 'active';
let employeesLoaded = false;
let cachedSettings = null;
let settingsLoadPromise = null;
let pendingLogoUrl = null; // staged like every other settings field -- only saved on "Save settings"

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
    business_logo_url: '',
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

// ---------------------------------------------------------------------
// Bulk employee upload — Excel template covering the core identity/
// employment fields + basic pay only (not the full per-component
// allowance/benefit matrix, which is added afterward by editing the
// employee normally). Employee numbers are never a column: they're
// always server-assigned via next_employee_number(), same as a single
// manual add (see the submit handler above).
// ---------------------------------------------------------------------

const BULK_UPLOAD_HEADERS = [
  'First name', 'Last name', 'Email', 'Phone', 'Gender',
  'Job position', 'Department', 'Sub department', 'Employee type',
  'Contract start date (YYYY-MM-DD)', 'Basic pay'
];

const BULK_UPLOAD_GENDER_OPTIONS = ['Male', 'Female', 'Others'];
const BULK_UPLOAD_GENDER_MAP = { male: 'male', female: 'female', others: 'other', other: 'other' };
const BULK_UPLOAD_EMPLOYEE_TYPE_OPTIONS = Object.keys(classificationLabels).map(key => classificationLabels[key]);
const BULK_UPLOAD_EMPLOYEE_TYPE_MAP = Object.fromEntries(
  Object.entries(classificationLabels).map(([key, label]) => [label.toLowerCase(), key])
);
const VALID_EMPLOYEE_TYPES = Object.keys(classificationLabels);

function openBulkUploadModal() {
  bulkUploadFile.value = '';
  bulkUploadFilename.textContent = 'No file chosen';
  bulkUploadError.hidden = true;
  bulkUploadInfo.hidden = true;
  bulkUploadResults.hidden = true;
  bulkUploadResults.innerHTML = '';
  bulkUploadOverlay.hidden = false;
}

function closeBulkUploadModal() { bulkUploadOverlay.hidden = true; }

bulkUploadFile.addEventListener('change', () => {
  bulkUploadFilename.textContent = bulkUploadFile.files?.[0]?.name || 'No file chosen';
});

bulkUploadEmployeesBtn.addEventListener('click', openBulkUploadModal);
bulkUploadCloseBtn.addEventListener('click', closeBulkUploadModal);
bulkUploadCancelBtn.addEventListener('click', closeBulkUploadModal);

// Uses ExcelJS (not the xlsx/SheetJS library used for reading the filled-in
// template back in below) purely because SheetJS's free tier can't write
// real dropdown data validation into a workbook -- ExcelJS can. The option
// lists live on a second, hidden sheet, referenced by range rather than
// inlined into the validation formula, since department/job-position names
// are free text that could contain commas or run past Excel's ~255-char
// inline-list limit.
bulkUploadTemplateBtn.addEventListener('click', async () => {
  bulkUploadError.hidden = true;
  bulkUploadTemplateBtn.disabled = true;
  try {
    const settings = await loadSettings();
    const jobPositions = settings.job_positions || [];
    const departments = settings.departments || [];
    const subDepartments = settings.sub_departments || [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.columns = BULK_UPLOAD_HEADERS.map(header => ({ header, width: Math.max(16, header.length + 2) }));
    sheet.addRow(['Jane', 'Wanjiru', 'jane@example.com', '0712345678', 'Female', jobPositions[0] || 'Accountant', departments[0] || 'Finance', '', 'Primary Employee', '2026-01-01', 80000]);

    const lists = workbook.addWorksheet('Lists', { state: 'hidden' });
    const listColumns = [
      { col: 'A', values: BULK_UPLOAD_GENDER_OPTIONS },
      { col: 'B', values: BULK_UPLOAD_EMPLOYEE_TYPE_OPTIONS },
      { col: 'C', values: jobPositions },
      { col: 'D', values: departments },
      { col: 'E', values: subDepartments }
    ];
    listColumns.forEach(({ col, values }) => {
      values.forEach((value, i) => { lists.getCell(`${col}${i + 1}`).value = value; });
    });

    const dropdownColumns = [
      { col: 'E', listCol: 'A', values: BULK_UPLOAD_GENDER_OPTIONS },
      { col: 'F', listCol: 'C', values: jobPositions },
      { col: 'G', listCol: 'D', values: departments },
      { col: 'H', listCol: 'E', values: subDepartments },
      { col: 'I', listCol: 'B', values: BULK_UPLOAD_EMPLOYEE_TYPE_OPTIONS }
    ];
    for (let row = 2; row <= 300; row += 1) {
      dropdownColumns.forEach(({ col, listCol, values }) => {
        if (!values.length) return;
        sheet.getCell(`${col}${row}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`Lists!$${listCol}$1:$${listCol}$${values.length}`]
        };
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'employee-bulk-upload-template.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    bulkUploadError.textContent = err.message || 'Could not build the template.';
    bulkUploadError.hidden = false;
  } finally {
    bulkUploadTemplateBtn.disabled = false;
  }
});

// Excel date cells arrive as JS Date objects (via cellDates:true) built at
// UTC midnight for that day. Reading them back out with local getters is
// safe for Kenya's UTC+3 offset (always rolls forward into the same day,
// never back) -- the inverse of the UTC-rollback pitfall already called
// out elsewhere in this codebase (see leave.js's toDateStr).
function formatBulkUploadDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value)) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = new Date(str);
  if (isNaN(parsed)) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function bulkUploadRowToPayload(row) {
  const firstName = String(row['First name'] || '').trim();
  const lastName = String(row['Last name'] || '').trim();
  if (!firstName || !lastName) return { error: 'First and last name are required.' };

  // Accepts either the dropdown's display label ("Primary Employee",
  // "Others") or a raw value typed directly (backward-compatible with
  // templates downloaded before dropdowns existed).
  const typeRaw = String(row['Employee type'] || '').trim().toLowerCase();
  const employeeType = VALID_EMPLOYEE_TYPES.includes(typeRaw)
    ? typeRaw
    : (BULK_UPLOAD_EMPLOYEE_TYPE_MAP[typeRaw] || 'primary');

  const genderRaw = String(row['Gender'] || '').trim().toLowerCase();
  const gender = BULK_UPLOAD_GENDER_MAP[genderRaw] || null;

  const compensation = {
    basicPay: toNumber(row['Basic pay']),
    employeePensionRate: 0, employerPensionRate: 0,
    lifeInsurance: 0, educationInsurance: 0, otherDeductions: 0
  };
  const statutoryToggles = {};
  earningComponents.forEach(item => {
    compensation[item.id] = 0;
    const defaultChecked = !irregularComponentIds.includes(item.id);
    statutoryToggles[item.id] = { nssf: defaultChecked, shif: defaultChecked, ahl: defaultChecked };
  });

  return {
    payload: {
      first_name: firstName,
      last_name: lastName,
      email: String(row['Email'] || '').trim() || null,
      phone: String(row['Phone'] || '').trim() || null,
      gender,
      job_position: String(row['Job position'] || '').trim() || null,
      department: String(row['Department'] || '').trim() || null,
      sub_department: String(row['Sub department'] || '').trim() || null,
      employee_type: employeeType,
      contract_start_date: formatBulkUploadDate(row['Contract start date (YYYY-MM-DD)'] || row['Contract start date']),
      compensation,
      statutory_toggles: statutoryToggles,
      updated_at: new Date().toISOString()
    }
  };
}

bulkUploadImportBtn.addEventListener('click', async () => {
  const file = bulkUploadFile.files?.[0];
  bulkUploadError.hidden = true;
  bulkUploadInfo.hidden = true;
  bulkUploadResults.hidden = true;
  if (!file) {
    bulkUploadError.textContent = 'Choose a filled-in template file first.';
    bulkUploadError.hidden = false;
    return;
  }

  bulkUploadImportBtn.disabled = true;
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const { data: { user } } = await supabase.auth.getUser();
    let created = 0;
    const skipped = [];

    for (let i = 0; i < rows.length; i += 1) {
      const rowNumber = i + 2; // +1 for header row, +1 for 1-indexing
      const { payload, error: rowError } = bulkUploadRowToPayload(rows[i]);
      if (rowError) {
        skipped.push({ rowNumber, reason: rowError });
        continue;
      }
      try {
        const { data: employeeNumber, error: numberError } = await supabase.rpc('next_employee_number');
        if (numberError) throw numberError;
        const { error: insertError } = await supabase.from('employees').insert({ ...payload, employee_number: employeeNumber, user_id: user.id });
        if (insertError) throw insertError;
        created += 1;
      } catch (err) {
        skipped.push({ rowNumber, reason: err.message || 'Could not save this row.' });
      }
    }

    bulkUploadInfo.textContent = `Created ${created} employee${created === 1 ? '' : 's'}.`;
    bulkUploadInfo.hidden = false;
    if (skipped.length) {
      bulkUploadResults.innerHTML = skipped.map(s => `<p>Row ${s.rowNumber}: <strong>${s.reason}</strong></p>`).join('');
      bulkUploadResults.hidden = false;
    }
    if (created) await loadEmployees();
  } catch (err) {
    bulkUploadError.textContent = err.message || 'Could not read that file.';
    bulkUploadError.hidden = false;
  } finally {
    bulkUploadImportBtn.disabled = false;
  }
});

function renderEmployeeTable(employees) {
  employeesEmptyState.hidden = employees.length > 0;
  employeesEmptyState.textContent = 'No employees here yet.';

  employeeTableBody.innerHTML = employees.map(emp => {
    const portalCell = emp.auth_user_id
      ? '<span class="status-pill status-active">Active</span>'
      : emp.email
        ? `<button type="button" class="ghost-button employee-invite-btn" data-id="${emp.id}">Invite</button>`
        : '<span class="hint">No email on file</span>';
    return `
    <tr data-id="${emp.id}">
      <td>${emp.employee_number || '—'}</td>
      <td>${emp.first_name} ${emp.last_name}</td>
      <td>${emp.job_position || '—'}</td>
      <td>${emp.department || '—'}</td>
      <td>${employeeTypeLabels[emp.employee_type] || emp.employee_type}</td>
      <td><span class="status-pill status-${emp.status}">${emp.status === 'active' ? 'Active' : 'Terminated'}</span></td>
      <td>${portalCell}</td>
      <td><button type="button" class="ghost-button employee-edit-btn" data-id="${emp.id}">Edit</button></td>
    </tr>
  `;
  }).join('');
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

employeeTableBody.addEventListener('click', async event => {
  const btn = event.target.closest('.employee-invite-btn');
  if (!btn) return;
  employeeInviteError.hidden = true;
  employeeInviteInfo.hidden = true;
  btn.disabled = true;
  try {
    await callFunction('/api/invite-employee', { employee_id: btn.dataset.id });
    employeeInviteInfo.textContent = 'Invite sent -- they\'ll get an email with a link to set a password and log in.';
    employeeInviteInfo.hidden = false;
    await loadEmployees();
  } catch (err) {
    employeeInviteError.textContent = err.message || 'Could not send this invite.';
    employeeInviteError.hidden = false;
    btn.disabled = false;
  }
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
  setLogoPreview(s.business_logo_url || null);
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

  reportPasscodeStatus.textContent = s.report_passcode_hash
    ? 'A report passcode is currently set.'
    : 'No report passcode is set -- reports can be downloaded without one.';
  settingsReportPasscodeClearBtn.hidden = !s.report_passcode_hash;
  settingsReportPasscode.value = '';
  settingsReportPasscodeConfirm.value = '';

  settingsLoginWindowEnabled.checked = !!s.login_window_enabled;
  settingsLoginWindowStart.value = s.login_window_start ? s.login_window_start.slice(0, 5) : '08:00';
  settingsLoginWindowEnd.value = s.login_window_end ? s.login_window_end.slice(0, 5) : '18:00';
  settingsGeofenceEnabled.checked = !!s.login_geofence_enabled;
  settingsGeofenceLat.value = s.login_geofence_latitude ?? '';
  settingsGeofenceLng.value = s.login_geofence_longitude ?? '';
  settingsGeofenceRadius.value = s.login_geofence_radius_meters ?? 500;
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

// ---------------------------------------------------------------------
// Business logo — upload or paste-a-URL-to-fetch, both funnel through
// the same client-side resize step before landing in Supabase Storage,
// so a fetched favicon and a manually uploaded file end up identical.
// ---------------------------------------------------------------------

function setLogoPreview(url) {
  pendingLogoUrl = url || null;
  settingsLogoPreview.src = url || '';
  settingsLogoPreview.hidden = !url;
  settingsLogoPlaceholder.hidden = !!url;
  settingsLogoRemoveBtn.hidden = !url;
}

// Draws the source onto a canvas capped at maxDim x maxDim (preserving
// aspect ratio, never upscaling) and exports PNG bytes. Also doubles as
// sanitization for SVG uploads, since only rendered pixels come back out,
// not the original markup (which could carry embedded script content).
function resizeImageToBlob(source, maxDim = 320) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))), 'image/png');
    };
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = source;
  });
}

async function uploadLogoBlob(blob) {
  const { data: { user } } = await supabase.auth.getUser();
  const path = `${user.id}/logo.png`;
  const { error } = await supabase.storage.from('business-logos').upload(path, blob, { upsert: true, contentType: 'image/png' });
  if (error) throw error;
  const { data } = supabase.storage.from('business-logos').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

async function processAndUploadLogo(source) {
  const blob = await resizeImageToBlob(source);
  return uploadLogoBlob(blob);
}

settingsLogoFile.addEventListener('change', async () => {
  const file = settingsLogoFile.files?.[0];
  settingsLogoFile.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    settingsLogoError.textContent = 'Choose an image file.';
    settingsLogoError.hidden = false;
    return;
  }
  settingsLogoError.hidden = true;
  const objectUrl = URL.createObjectURL(file);
  try {
    const url = await processAndUploadLogo(objectUrl);
    setLogoPreview(url);
  } catch (err) {
    settingsLogoError.textContent = err.message || 'Could not upload that logo.';
    settingsLogoError.hidden = false;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
});

settingsLogoFetchBtn.addEventListener('click', async () => {
  const url = settingsLogoUrlInput.value.trim();
  if (!url) return;
  settingsLogoError.hidden = true;
  settingsLogoFetchBtn.disabled = true;
  try {
    const { dataUrl } = await callFunction('/api/fetch-logo', { url });
    const finalUrl = await processAndUploadLogo(dataUrl);
    setLogoPreview(finalUrl);
    settingsLogoUrlInput.value = '';
  } catch (err) {
    settingsLogoError.textContent = err.message || 'Could not fetch a logo from that URL.';
    settingsLogoError.hidden = false;
  } finally {
    settingsLogoFetchBtn.disabled = false;
  }
});

settingsLogoRemoveBtn.addEventListener('click', () => {
  settingsLogoError.hidden = true;
  setLogoPreview(null);
});

// ---------------------------------------------------------------------
// Approval workflows -- appoint portal-active employees as required
// approvers for payroll runs / leave applications. Deliberately kept
// simple: one workflow per action type, delete-and-reinsert its approver
// list on every save (small lists, no need for a diffing update).
// ---------------------------------------------------------------------

const approvalWorkflowEligibleHint = document.getElementById('approvalWorkflowEligibleHint');
const approvalWorkflowPayrollActive = document.getElementById('approvalWorkflowPayrollActive');
const approvalWorkflowPayrollApprovers = document.getElementById('approvalWorkflowPayrollApprovers');
const approvalWorkflowLeaveActive = document.getElementById('approvalWorkflowLeaveActive');
const approvalWorkflowLeaveApprovers = document.getElementById('approvalWorkflowLeaveApprovers');
const approvalWorkflowError = document.getElementById('approvalWorkflowError');
const approvalWorkflowInfo = document.getElementById('approvalWorkflowInfo');
const approvalWorkflowSaveBtn = document.getElementById('approvalWorkflowSaveBtn');

async function loadApprovalWorkflows() {
  approvalWorkflowError.hidden = true;
  approvalWorkflowInfo.hidden = true;

  const { data: eligible } = await supabase
    .from('employees')
    .select('id, first_name, last_name')
    .not('auth_user_id', 'is', null)
    .eq('status', 'active')
    .order('first_name');
  const eligibleEmployees = eligible || [];
  approvalWorkflowEligibleHint.hidden = eligibleEmployees.length > 0;

  const { data: workflows } = await supabase.from('approval_workflows').select('id, action_type, is_active');
  const { data: approvers } = await supabase.from('approval_workflow_approvers').select('workflow_id, employee_id');

  const payrollWorkflow = (workflows || []).find(w => w.action_type === 'payroll_run');
  const leaveWorkflow = (workflows || []).find(w => w.action_type === 'leave_application');
  const payrollApproverIds = new Set((approvers || []).filter(a => a.workflow_id === payrollWorkflow?.id).map(a => a.employee_id));
  const leaveApproverIds = new Set((approvers || []).filter(a => a.workflow_id === leaveWorkflow?.id).map(a => a.employee_id));

  approvalWorkflowPayrollActive.checked = !!payrollWorkflow?.is_active;
  approvalWorkflowLeaveActive.checked = !!leaveWorkflow?.is_active;

  const renderChecklist = (container, selectedIds) => {
    container.innerHTML = eligibleEmployees.map(e => `
      <label class="payroll-employee-row">
        <input type="checkbox" value="${e.id}" ${selectedIds.has(e.id) ? 'checked' : ''} />
        <span class="employee-name">${e.first_name} ${e.last_name}</span>
      </label>
    `).join('');
  };
  renderChecklist(approvalWorkflowPayrollApprovers, payrollApproverIds);
  renderChecklist(approvalWorkflowLeaveApprovers, leaveApproverIds);

  markApprovalWorkflowClean();
}

// Dirty-state tracking for the save button -- bright/enabled the moment
// anything differs from what's actually persisted, grayed/disabled once
// it matches again (right after load or right after a successful save).
// Without this, a save that silently no-ops (e.g. nothing actually
// changed) looks identical to one that worked, so there was no way to
// tell at a glance whether the on-screen configuration was really saved.
let approvalWorkflowCleanSnapshot = '';

function computeApprovalWorkflowSnapshot() {
  const checkedIds = container => [...container.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value).sort().join(',');
  return JSON.stringify({
    payrollActive: approvalWorkflowPayrollActive.checked,
    payrollApprovers: checkedIds(approvalWorkflowPayrollApprovers),
    leaveActive: approvalWorkflowLeaveActive.checked,
    leaveApprovers: checkedIds(approvalWorkflowLeaveApprovers),
  });
}

function markApprovalWorkflowClean() {
  approvalWorkflowCleanSnapshot = computeApprovalWorkflowSnapshot();
  approvalWorkflowSaveBtn.disabled = true;
}

function refreshApprovalWorkflowDirtyState() {
  approvalWorkflowSaveBtn.disabled = computeApprovalWorkflowSnapshot() === approvalWorkflowCleanSnapshot;
}

approvalWorkflowPayrollActive.addEventListener('change', refreshApprovalWorkflowDirtyState);
approvalWorkflowLeaveActive.addEventListener('change', refreshApprovalWorkflowDirtyState);
approvalWorkflowPayrollApprovers.addEventListener('change', refreshApprovalWorkflowDirtyState);
approvalWorkflowLeaveApprovers.addEventListener('change', refreshApprovalWorkflowDirtyState);

async function saveApprovalWorkflow(actionType, isActive, container, ownerId) {
  const approverIds = [...container.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);

  const { data: workflow, error: upsertError } = await supabase
    .from('approval_workflows')
    .upsert({ user_id: ownerId, action_type: actionType, is_active: isActive, updated_at: new Date().toISOString() }, { onConflict: 'user_id,action_type' })
    .select()
    .single();
  if (upsertError) throw upsertError;

  const { error: deleteError } = await supabase.from('approval_workflow_approvers').delete().eq('workflow_id', workflow.id);
  if (deleteError) throw deleteError;

  if (approverIds.length) {
    const { error: insertError } = await supabase.from('approval_workflow_approvers').insert(
      approverIds.map(employeeId => ({ workflow_id: workflow.id, employee_id: employeeId, user_id: ownerId }))
    );
    if (insertError) throw insertError;
  }
}

approvalWorkflowSaveBtn.addEventListener('click', async () => {
  approvalWorkflowError.hidden = true;
  approvalWorkflowInfo.hidden = true;
  approvalWorkflowSaveBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await saveApprovalWorkflow('payroll_run', approvalWorkflowPayrollActive.checked, approvalWorkflowPayrollApprovers, user.id);
    await saveApprovalWorkflow('leave_application', approvalWorkflowLeaveActive.checked, approvalWorkflowLeaveApprovers, user.id);
    approvalWorkflowInfo.textContent = 'Approval workflows saved.';
    approvalWorkflowInfo.hidden = false;
    // Reload from the database (not just re-mark the current form clean)
    // so the button's clean state reflects what's actually persisted,
    // not just what was submitted.
    await loadApprovalWorkflows();
  } catch (err) {
    approvalWorkflowError.textContent = err.message || 'Could not save approval workflows.';
    approvalWorkflowError.hidden = false;
    approvalWorkflowSaveBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Report passcode -- see reportPasscode.js for the gate itself; this is
// just the Settings UI to set/clear it. A dedicated save button (not
// folded into the big saveSettingsBtn payload above) since that payload
// re-submits every field on every save -- an empty passcode input would
// otherwise have to be special-cased there to avoid clobbering the
// existing hash on an unrelated settings change.
// ---------------------------------------------------------------------

settingsReportPasscodeSaveBtn.addEventListener('click', async () => {
  settingsReportPasscodeError.hidden = true;
  settingsReportPasscodeInfo.hidden = true;

  const passcode = settingsReportPasscode.value;
  const confirm = settingsReportPasscodeConfirm.value;
  if (!passcode) {
    settingsReportPasscodeError.textContent = 'Enter a new passcode.';
    settingsReportPasscodeError.hidden = false;
    return;
  }
  if (passcode !== confirm) {
    settingsReportPasscodeError.textContent = 'Passcodes do not match.';
    settingsReportPasscodeError.hidden = false;
    return;
  }

  settingsReportPasscodeSaveBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const hash = await hashReportPasscode(passcode, user.id);
    const { data, error } = await supabase
      .from('payroll_settings')
      .upsert({ user_id: user.id, report_passcode_hash: hash, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;

    cachedSettings = data;
    invalidateReportPasscodeCache();
    settingsReportPasscodeInfo.textContent = 'Report passcode saved.';
    settingsReportPasscodeInfo.hidden = false;
    populateSettingsForm(data);
  } catch (err) {
    settingsReportPasscodeError.textContent = err.message || 'Could not save the passcode.';
    settingsReportPasscodeError.hidden = false;
  } finally {
    settingsReportPasscodeSaveBtn.disabled = false;
  }
});

settingsReportPasscodeClearBtn.addEventListener('click', async () => {
  settingsReportPasscodeError.hidden = true;
  settingsReportPasscodeInfo.hidden = true;
  settingsReportPasscodeClearBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('payroll_settings')
      .upsert({ user_id: user.id, report_passcode_hash: null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;

    cachedSettings = data;
    invalidateReportPasscodeCache();
    settingsReportPasscodeInfo.textContent = 'Report passcode removed -- reports can now be downloaded without one.';
    settingsReportPasscodeInfo.hidden = false;
    populateSettingsForm(data);
  } catch (err) {
    settingsReportPasscodeError.textContent = err.message || 'Could not remove the passcode.';
    settingsReportPasscodeError.hidden = false;
  } finally {
    settingsReportPasscodeClearBtn.disabled = false;
  }
});

settingsGeofenceUseCurrentBtn.addEventListener('click', async () => {
  settingsLoginSecurityError.hidden = true;
  settingsGeofenceUseCurrentBtn.disabled = true;
  try {
    const geo = await getGeolocation();
    if (geo.status !== 'granted') {
      settingsLoginSecurityError.textContent = 'Could not get your current location -- check that location access is allowed for this site in your browser.';
      settingsLoginSecurityError.hidden = false;
      return;
    }
    settingsGeofenceLat.value = geo.latitude.toFixed(6);
    settingsGeofenceLng.value = geo.longitude.toFixed(6);
  } finally {
    settingsGeofenceUseCurrentBtn.disabled = false;
  }
});

settingsLoginSecuritySaveBtn.addEventListener('click', async () => {
  settingsLoginSecurityError.hidden = true;
  settingsLoginSecurityInfo.hidden = true;

  const geofenceEnabled = settingsGeofenceEnabled.checked;
  const lat = settingsGeofenceLat.value.trim() ? Number(settingsGeofenceLat.value) : null;
  const lng = settingsGeofenceLng.value.trim() ? Number(settingsGeofenceLng.value) : null;
  const radius = toNumber(settingsGeofenceRadius.value) || 500;
  if (geofenceEnabled && (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng))) {
    settingsLoginSecurityError.textContent = 'Enter a valid latitude and longitude, or use "Use my current location".';
    settingsLoginSecurityError.hidden = false;
    return;
  }
  if (lat !== null && (lat < -90 || lat > 90)) {
    settingsLoginSecurityError.textContent = 'Latitude must be between -90 and 90.';
    settingsLoginSecurityError.hidden = false;
    return;
  }
  if (lng !== null && (lng < -180 || lng > 180)) {
    settingsLoginSecurityError.textContent = 'Longitude must be between -180 and 180.';
    settingsLoginSecurityError.hidden = false;
    return;
  }

  settingsLoginSecuritySaveBtn.disabled = true;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('payroll_settings')
      .upsert({
        user_id: user.id,
        login_window_enabled: settingsLoginWindowEnabled.checked,
        login_window_start: settingsLoginWindowStart.value || '08:00',
        login_window_end: settingsLoginWindowEnd.value || '18:00',
        login_geofence_enabled: geofenceEnabled,
        login_geofence_latitude: lat,
        login_geofence_longitude: lng,
        login_geofence_radius_meters: radius,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;

    cachedSettings = data;
    settingsLoginSecurityInfo.textContent = 'Security settings saved.';
    settingsLoginSecurityInfo.hidden = false;
    populateSettingsForm(data);
  } catch (err) {
    settingsLoginSecurityError.textContent = err.message || 'Could not save security settings.';
    settingsLoginSecurityError.hidden = false;
  } finally {
    settingsLoginSecuritySaveBtn.disabled = false;
  }
});

async function showSettingsPage() {
  setSettingsPageBusy(true);
  try {
    const settings = await loadSettings({ force: true });
    populateSettingsForm(settings);
    await loadApprovalWorkflows();
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
    business_logo_url: pendingLogoUrl || null,
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
