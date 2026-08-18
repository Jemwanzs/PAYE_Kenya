import { auth, db, callFunction, getGeolocation } from './auth.js';
import { hashReportPasscode, invalidateReportPasscodeCache } from './reportPasscode.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query, where, orderBy, getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const storage = getStorage();

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
const employeeDeleteBtn = document.getElementById('employeeDeleteBtn');
const compensationFieldsContainer = document.getElementById('employeeCompensationFields');

const terminateOverlay = document.getElementById('terminateOverlay');
const terminateCloseBtn = document.getElementById('terminateCloseBtn');
const terminateCancelBtn = document.getElementById('terminateCancelBtn');
const terminateForm = document.getElementById('terminateForm');
const terminateEmployeeName = document.getElementById('terminateEmployeeName');
const terminateDate = document.getElementById('terminateDate');
const terminateReason = document.getElementById('terminateReason');
const terminateError = document.getElementById('terminateError');

const employeeDeleteOverlay = document.getElementById('employeeDeleteOverlay');
const employeeDeleteName = document.getElementById('employeeDeleteName');
const employeeDeleteCloseBtn = document.getElementById('employeeDeleteCloseBtn');
const employeeDeleteCancelBtn = document.getElementById('employeeDeleteCancelBtn');
const employeeDeleteConfirmBtn = document.getElementById('employeeDeleteConfirmBtn');
const employeeDeleteError = document.getElementById('employeeDeleteError');

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

const LOOKUP_LIST_ELS = { jobPositions: 'jobPositionsList', departments: 'departmentsList', subDepartments: 'subDepartmentsList' };
const LOOKUP_INPUT_ELS = { jobPositions: 'jobPositionInput', departments: 'departmentInput', subDepartments: 'subDepartmentInput' };

let currentStatusFilter = 'active';
let currentEmployeeId = null;
let currentEmployeeStatus = 'active';
let employeesLoaded = false;
let cachedSettings = null;
let settingsLoadPromise = null;
let pendingLogoUrl = null; // staged like every other settings field -- only saved on "Save settings"

function businessDoc(...pathSegments) {
  return doc(db, 'businesses', auth.currentUser.uid, ...pathSegments);
}
function businessCollection(...pathSegments) {
  return collection(db, 'businesses', auth.currentUser.uid, ...pathSegments);
}

function defaultSettings() {
  return {
    nssfRate: 6, nssfUpperLimit: 108000, shifRate: 2.75, shifMinimum: 300,
    ahlEmployeeRate: 1.5, ahlEmployerRate: 1.5, personalRelief: 2400, nitaLevy: 50,
    insuranceReliefCap: 5000, telephoneThreshold: 5000, mealsThreshold: 5000,
    allowableDeductionCap: 30000, perDiemThreshold: 10000, daysInMonth: 30,
    secondaryFlatRate: 35, contractorWhtRate: 5, pwdExemption: 150000,
    jobPositions: [], departments: [], subDepartments: [],
    employeeNumberPrefix: 'EMP', employeeNumberPadding: 3, employeeNumberSeparator: '',
    employeeNumberIncludeYear: false, employeeNumberIncludeMonth: false,
    employeeNumberNext: 1,
    businessName: '',
    businessLogoUrl: '',
    workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    workStartTime: '08:00',
    workHoursPerDay: 8,
    breakMinutes: 60
  };
}

async function loadSettings({ force = false } = {}) {
  if (cachedSettings && !force) return cachedSettings;
  if (!settingsLoadPromise || force) {
    // Merges per-field over the defaults rather than an all-or-nothing
    // "doc exists? use it as-is" check -- a settings doc that exists but
    // is missing some of these fields (e.g. one only ever touched by
    // api/admin-update-business.js, which merge-writes just
    // businessName) would otherwise leave every other field undefined
    // here too.
    settingsLoadPromise = getDoc(businessDoc('settings', 'main')).then(snap => {
      cachedSettings = { ...defaultSettings(), ...(snap.exists() ? snap.data() : {}) };
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
  return compensationItemsCache.filter(i => keys.includes(i.componentKey));
}

async function loadCompensationItems(employeeId) {
  if (!employeeId) { compensationItemsCache = []; return; }
  const q = query(businessCollection('employeeCompensationItems'), where('employeeId', '==', employeeId));
  const snap = await getDocs(q);
  compensationItemsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
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
    .filter(i => showExpired || !i.endDate || i.endDate >= today)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  const colCount = (cfg.hasTypeSelect ? 1 : 0) + 4;
  const tbody = compHistoryEl(sectionKey, 'tableBody');
  tbody.innerHTML = items.length
    ? items.map(i => `
        <tr data-id="${i.id}">
          ${cfg.hasTypeSelect ? `<td>${i.label}</td>` : ''}
          <td>${rawMoney(i.amount)}</td>
          <td>${i.startDate}</td>
          <td>${i.endDate || '—'}</td>
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
    if (i.componentKey !== componentKey) return false;
    if ((i.label || '').trim().toLowerCase() !== normalizedLabel) return false;
    return compHistoryOverlaps(startDate, endDate, i.startDate, i.endDate);
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
    errorEl.textContent = `This overlaps an existing "${conflict.label}" entry (${conflict.startDate} to ${conflict.endDate || 'ongoing'}).`;
    errorEl.hidden = false;
    return;
  }

  const addBtn = compHistoryEl(sectionKey, 'addBtn');
  addBtn.disabled = true;
  try {
    if (editingId) {
      await updateDoc(businessDoc('employeeCompensationItems', editingId), {
        componentKey, label, amount, startDate, endDate, updatedAt: new Date().toISOString()
      });
    } else {
      await addDoc(businessCollection('employeeCompensationItems'), {
        employeeId: currentEmployeeId, componentKey, label, amount, startDate, endDate, createdAt: new Date().toISOString()
      });
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
  try {
    await deleteDoc(businessDoc('employeeCompensationItems', id));
    if (compHistoryEditingId[sectionKey] === id) resetCompHistoryForm(sectionKey);
    await loadCompensationItems(currentEmployeeId);
    renderCompHistorySection(sectionKey);
  } catch {
    // Best-effort -- the row simply stays if the delete failed.
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
        typeSelect.value = item.componentKey;
        typeSelect.dispatchEvent(new Event('change'));
        const type = cfg.types.find(t => t.key === item.componentKey);
        if (type?.bucket) compHistoryEl(sectionKey, 'labelInput').value = item.label;
      }
      compHistoryEl(sectionKey, 'amount').value = rawMoney(item.amount);
      compHistoryEl(sectionKey, 'start').value = item.startDate;
      compHistoryEl(sectionKey, 'end').value = item.endDate || '';
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
  jobPositionDropdown.setOptions(settings.jobPositions || [], employee?.jobPosition);
  departmentDropdown.setOptions(settings.departments || [], employee?.department);
  subDepartmentDropdown.setOptions(settings.subDepartments || [], employee?.subDepartment);
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
  employeeDeleteBtn.hidden = true;
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
  employeeFormTitle.textContent = `${employee.firstName} ${employee.lastName}`;
  employeeFormNumber.hidden = !employee.employeeNumber;
  employeeFormNumber.textContent = employee.employeeNumber || '';
  employeeTerminateBtn.hidden = employee.status !== 'active';
  employeeRehireBtn.hidden = employee.status !== 'terminated';
  // Always available for an existing record regardless of status --
  // unlike Terminate/Rehire (a reversible status change), this is a
  // separate, permanent removal, meant for a genuine mistake (duplicate
  // records, a test entry) rather than normal offboarding.
  employeeDeleteBtn.hidden = false;

  document.getElementById('employeeFirstName').value = employee.firstName || '';
  document.getElementById('employeeLastName').value = employee.lastName || '';
  document.getElementById('employeeEmail').value = employee.email || '';
  document.getElementById('employeePhone').value = employee.phone || '';
  document.getElementById('employeeGender').value = employee.gender || '';
  // Job position/department/sub-department are populated separately via
  // populateJobSelects(employee), which must run before this so the
  // relevant <option> exists (including a fallback if it was since
  // removed from Settings) before we try to select it.
  document.getElementById('employeeType').value = employee.employeeType || 'primary';
  syncEmployeeTypeTrigger();
  document.getElementById('employeeContractStart').value = employee.contractStartDate || '';

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

  const toggles = employee.statutoryToggles || {};
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
    firstName: document.getElementById('employeeFirstName').value.trim(),
    lastName: document.getElementById('employeeLastName').value.trim(),
    email: document.getElementById('employeeEmail').value.trim() || null,
    phone: document.getElementById('employeePhone').value.trim() || null,
    gender: document.getElementById('employeeGender').value || null,
    jobPosition: document.getElementById('employeeJobPosition').value.trim() || null,
    department: document.getElementById('employeeDepartment').value.trim() || null,
    subDepartment: document.getElementById('employeeSubDepartment').value.trim() || null,
    employeeType: document.getElementById('employeeType').value,
    contractStartDate: document.getElementById('employeeContractStart').value || null,
    compensation,
    statutoryToggles,
    updatedAt: new Date().toISOString()
  };
}

async function loadEmployees() {
  employeesLoaded = true;
  try {
    let q = query(businessCollection('employees'), orderBy('firstName', 'asc'));
    if (currentStatusFilter !== 'all') q = query(businessCollection('employees'), where('status', '==', currentStatusFilter), orderBy('firstName', 'asc'));
    const snap = await getDocs(q);
    renderEmployeeTable(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    checkMissingNumbers();
  } catch {
    employeeTableBody.innerHTML = '';
    employeesEmptyState.hidden = false;
    employeesEmptyState.textContent = 'Could not load employees. Please try again.';
  }
}

// Scoped to all employees regardless of the current status filter, so
// the button doesn't stay hidden just because the visible tab happens
// to be fully numbered while another status bucket isn't.
async function checkMissingNumbers() {
  const q = query(businessCollection('employees'), where('employeeNumber', '==', null));
  const snap = await getCountFromServer(q);
  assignMissingNumbersBtn.hidden = !snap.data().count;
}

assignMissingNumbersBtn.addEventListener('click', async () => {
  assignMissingNumbersBtn.disabled = true;
  assignMissingNumbersInfo.hidden = true;
  try {
    const q = query(businessCollection('employees'), where('employeeNumber', '==', null));
    const snap = await getDocs(q);

    let assigned = 0;
    for (const empDoc of snap.docs) {
      const { employeeNumber } = await callFunction('/api/next-employee-number');
      await updateDoc(businessDoc('employees', empDoc.id), { employeeNumber });
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
// always server-assigned via /api/next-employee-number, same as a
// single manual add (see the submit handler above).
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
    const jobPositions = settings.jobPositions || [];
    const departments = settings.departments || [];
    const subDepartments = settings.subDepartments || [];

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
      firstName,
      lastName,
      email: String(row['Email'] || '').trim() || null,
      phone: String(row['Phone'] || '').trim() || null,
      gender,
      jobPosition: String(row['Job position'] || '').trim() || null,
      department: String(row['Department'] || '').trim() || null,
      subDepartment: String(row['Sub department'] || '').trim() || null,
      employeeType,
      contractStartDate: formatBulkUploadDate(row['Contract start date (YYYY-MM-DD)'] || row['Contract start date']),
      status: 'active',
      compensation,
      statutoryToggles,
      updatedAt: new Date().toISOString()
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
        const { employeeNumber } = await callFunction('/api/next-employee-number');
        await addDoc(businessCollection('employees'), { ...payload, employeeNumber, authUserId: null, portalBlocked: false, createdAt: new Date().toISOString() });
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
    const portalCell = emp.authUserId
      ? '<span class="status-pill status-active">Active</span>'
      : emp.email
        ? `<button type="button" class="ghost-button employee-invite-btn" data-id="${emp.id}">Invite</button>`
        : '<span class="hint">No email on file</span>';
    return `
    <tr data-id="${emp.id}">
      <td>${emp.employeeNumber || '—'}</td>
      <td>${emp.firstName} ${emp.lastName}</td>
      <td>${emp.jobPosition || '—'}</td>
      <td>${emp.department || '—'}</td>
      <td>${employeeTypeLabels[emp.employeeType] || emp.employeeType}</td>
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
  const snap = await getDoc(businessDoc('employees', btn.dataset.id));
  if (!snap.exists()) return;
  const data = { id: snap.id, ...snap.data() };
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
  if (!payload.firstName || !payload.lastName) {
    employeeFormError.textContent = 'First and last name are required.';
    employeeFormError.hidden = false;
    return;
  }

  employeeSaveBtn.disabled = true;
  try {
    if (currentEmployeeId) {
      await updateDoc(businessDoc('employees', currentEmployeeId), payload);
    } else {
      const { employeeNumber } = await callFunction('/api/next-employee-number');
      await addDoc(businessCollection('employees'), { ...payload, employeeNumber, status: 'active', authUserId: null, portalBlocked: false, createdAt: new Date().toISOString() });
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

  try {
    await updateDoc(businessDoc('employees', currentEmployeeId), {
      status: 'terminated',
      terminationDate: terminateDate.value,
      terminationReason: terminateReason.value.trim(),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    terminateError.textContent = err.message || 'Could not terminate employee.';
    terminateError.hidden = false;
    return;
  }

  terminateOverlay.hidden = true;
  showDirectory();
});

employeeRehireBtn.addEventListener('click', async () => {
  if (!currentEmployeeId) return;
  try {
    await updateDoc(businessDoc('employees', currentEmployeeId), {
      status: 'active',
      terminationDate: null,
      terminationReason: null,
      updatedAt: new Date().toISOString()
    });
    showDirectory();
  } catch {
    // Best-effort -- stays on the form if it failed.
  }
});

employeeDeleteBtn.addEventListener('click', () => {
  if (!currentEmployeeId) return;
  employeeDeleteError.hidden = true;
  employeeDeleteName.textContent = `Delete ${employeeFormTitle.textContent}?`;
  employeeDeleteOverlay.hidden = false;
});

employeeDeleteCloseBtn.addEventListener('click', () => { employeeDeleteOverlay.hidden = true; });
employeeDeleteCancelBtn.addEventListener('click', () => { employeeDeleteOverlay.hidden = true; });

// Payslips keep their own embedded employeeSnapshot/compensationSnapshot
// copy rather than a live reference (see payroll.js's computePayslipRow),
// so deleting the source employee record afterward never corrupts a
// historical payroll run -- unlike compensationItemsCache's dated
// entries, which genuinely belong to this employee alone and would
// otherwise sit orphaned in Firestore forever.
employeeDeleteConfirmBtn.addEventListener('click', async () => {
  if (!currentEmployeeId) return;
  employeeDeleteError.hidden = true;
  employeeDeleteConfirmBtn.disabled = true;
  try {
    const itemsSnap = await getDocs(query(businessCollection('employeeCompensationItems'), where('employeeId', '==', currentEmployeeId)));
    await Promise.all(itemsSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(businessDoc('employees', currentEmployeeId));
  } catch (err) {
    employeeDeleteError.textContent = err.message || 'Could not delete this employee.';
    employeeDeleteError.hidden = false;
    employeeDeleteConfirmBtn.disabled = false;
    return;
  }
  employeeDeleteConfirmBtn.disabled = false;
  employeeDeleteOverlay.hidden = true;
  showDirectory();
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
  document.getElementById('settingsBusinessName').value = s.businessName || '';
  setLogoPreview(s.businessLogoUrl || null);
  document.getElementById('settingsNssfRate').value = s.nssfRate;
  document.getElementById('settingsNssfUpperLimit').value = rawMoney(s.nssfUpperLimit);
  document.getElementById('settingsShifRate').value = s.shifRate;
  document.getElementById('settingsShifMinimum').value = rawMoney(s.shifMinimum);
  document.getElementById('settingsAhlEmployeeRate').value = s.ahlEmployeeRate;
  document.getElementById('settingsAhlEmployerRate').value = s.ahlEmployerRate;
  document.getElementById('settingsPersonalRelief').value = rawMoney(s.personalRelief);
  document.getElementById('settingsNitaLevy').value = rawMoney(s.nitaLevy);
  document.getElementById('settingsTelephoneThreshold').value = rawMoney(s.telephoneThreshold);
  document.getElementById('settingsMealsThreshold').value = rawMoney(s.mealsThreshold);
  document.getElementById('settingsAllowableDeductionCap').value = rawMoney(s.allowableDeductionCap);
  document.getElementById('settingsPerDiemThreshold').value = rawMoney(s.perDiemThreshold);
  document.getElementById('settingsDaysInMonth').value = s.daysInMonth;
  document.getElementById('settingsInsuranceReliefCap').value = rawMoney(s.insuranceReliefCap);
  document.getElementById('settingsSecondaryFlatRate').value = s.secondaryFlatRate;
  document.getElementById('settingsContractorWhtRate').value = s.contractorWhtRate;
  document.getElementById('settingsPwdExemption').value = rawMoney(s.pwdExemption);
  renderLookupList('jobPositions', s.jobPositions || []);
  renderLookupList('departments', s.departments || []);
  renderLookupList('subDepartments', s.subDepartments || []);
  settingsEmpNumPrefix.value = s.employeeNumberPrefix ?? 'EMP';
  settingsEmpNumPadding.value = s.employeeNumberPadding ?? 3;
  settingsEmpNumSeparator.value = s.employeeNumberSeparator ?? '';
  settingsEmpNumIncludeYear.checked = !!s.employeeNumberIncludeYear;
  settingsEmpNumIncludeMonth.checked = !!s.employeeNumberIncludeMonth;
  updateEmployeeNumberPreview(s.employeeNumberNext ?? 1);

  const workingDays = s.workingDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
  [...settingsWorkingDays.querySelectorAll('input')].forEach(cb => { cb.checked = workingDays.includes(cb.value); });
  settingsWorkStartTime.value = s.workStartTime ? s.workStartTime.slice(0, 5) : '08:00';
  settingsWorkHoursPerDay.value = s.workHoursPerDay ?? 8;
  settingsBreakMinutes.value = s.breakMinutes ?? 60;
  updateWorkEndTimePreview();

  reportPasscodeStatus.textContent = s.reportPasscodeHash
    ? 'A report passcode is currently set.'
    : 'No report passcode is set -- reports can be downloaded without one.';
  settingsReportPasscodeClearBtn.hidden = !s.reportPasscodeHash;
  settingsReportPasscode.value = '';
  settingsReportPasscodeConfirm.value = '';

  settingsLoginWindowEnabled.checked = !!s.loginWindowEnabled;
  settingsLoginWindowStart.value = s.loginWindowStart ? s.loginWindowStart.slice(0, 5) : '08:00';
  settingsLoginWindowEnd.value = s.loginWindowEnd ? s.loginWindowEnd.slice(0, 5) : '18:00';
  settingsGeofenceEnabled.checked = !!s.loginGeofenceEnabled;
  settingsGeofenceLat.value = s.loginGeofenceLatitude ?? '';
  settingsGeofenceLng.value = s.loginGeofenceLongitude ?? '';
  settingsGeofenceRadius.value = s.loginGeofenceRadiusMeters ?? 500;
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

function updateEmployeeNumberPreview(nextNumber = cachedSettings?.employeeNumberNext ?? 1) {
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
// the same client-side resize step before landing in Firebase Storage,
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
  const path = `business-logos/${auth.currentUser.uid}/logo.png`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: 'image/png' });
  const url = await getDownloadURL(storageRef);
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
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
// approvers for payroll runs / leave applications. One workflow doc per
// action type (doc id = the action type itself, e.g. "payroll_run"),
// with an `approvers` subcollection (doc id = employeeId) -- replacing
// the old approval_workflows/approval_workflow_approvers tables and
// their delete-and-reinsert save pattern.
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

  const employeesSnap = await getDocs(query(businessCollection('employees'), where('status', '==', 'active'), orderBy('firstName')));
  const eligibleEmployees = employeesSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.authUserId);
  approvalWorkflowEligibleHint.hidden = eligibleEmployees.length > 0;

  const [payrollWorkflowSnap, leaveWorkflowSnap] = await Promise.all([
    getDoc(businessDoc('approvalWorkflows', 'payroll_run')),
    getDoc(businessDoc('approvalWorkflows', 'leave_application'))
  ]);
  const [payrollApproversSnap, leaveApproversSnap] = await Promise.all([
    getDocs(collection(businessDoc('approvalWorkflows', 'payroll_run'), 'approvers')),
    getDocs(collection(businessDoc('approvalWorkflows', 'leave_application'), 'approvers'))
  ]);
  const payrollApproverIds = new Set(payrollApproversSnap.docs.map(d => d.id));
  const leaveApproverIds = new Set(leaveApproversSnap.docs.map(d => d.id));

  approvalWorkflowPayrollActive.checked = !!(payrollWorkflowSnap.exists() && payrollWorkflowSnap.data().isActive);
  approvalWorkflowLeaveActive.checked = !!(leaveWorkflowSnap.exists() && leaveWorkflowSnap.data().isActive);

  const renderChecklist = (container, selectedIds) => {
    container.innerHTML = eligibleEmployees.map(e => `
      <label class="payroll-employee-row">
        <input type="checkbox" value="${e.id}" ${selectedIds.has(e.id) ? 'checked' : ''} />
        <span class="employee-name">${e.firstName} ${e.lastName}</span>
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

async function saveApprovalWorkflow(actionType, isActive, container) {
  const approverIds = [...container.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);

  const workflowRef = businessDoc('approvalWorkflows', actionType);
  await setDoc(workflowRef, { isActive, updatedAt: new Date().toISOString() }, { merge: true });

  const approversRef = collection(workflowRef, 'approvers');
  const existingSnap = await getDocs(approversRef);
  await Promise.all(existingSnap.docs.map(d => deleteDoc(d.ref)));
  await Promise.all(approverIds.map(employeeId => setDoc(doc(approversRef, employeeId), { addedAt: new Date().toISOString() })));
}

approvalWorkflowSaveBtn.addEventListener('click', async () => {
  approvalWorkflowError.hidden = true;
  approvalWorkflowInfo.hidden = true;
  approvalWorkflowSaveBtn.disabled = true;
  try {
    await saveApprovalWorkflow('payroll_run', approvalWorkflowPayrollActive.checked, approvalWorkflowPayrollApprovers);
    await saveApprovalWorkflow('leave_application', approvalWorkflowLeaveActive.checked, approvalWorkflowLeaveApprovers);
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
    const hash = await hashReportPasscode(passcode, auth.currentUser.uid);
    await setDoc(businessDoc('settings', 'main'), { reportPasscodeHash: hash, updatedAt: new Date().toISOString() }, { merge: true });

    cachedSettings = await loadSettings({ force: true });
    invalidateReportPasscodeCache();
    settingsReportPasscodeInfo.textContent = 'Report passcode saved.';
    settingsReportPasscodeInfo.hidden = false;
    populateSettingsForm(cachedSettings);
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
    await setDoc(businessDoc('settings', 'main'), { reportPasscodeHash: null, updatedAt: new Date().toISOString() }, { merge: true });

    cachedSettings = await loadSettings({ force: true });
    invalidateReportPasscodeCache();
    settingsReportPasscodeInfo.textContent = 'Report passcode removed -- reports can now be downloaded without one.';
    settingsReportPasscodeInfo.hidden = false;
    populateSettingsForm(cachedSettings);
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
    await setDoc(businessDoc('settings', 'main'), {
      loginWindowEnabled: settingsLoginWindowEnabled.checked,
      loginWindowStart: settingsLoginWindowStart.value || '08:00',
      loginWindowEnd: settingsLoginWindowEnd.value || '18:00',
      loginGeofenceEnabled: geofenceEnabled,
      loginGeofenceLatitude: lat,
      loginGeofenceLongitude: lng,
      loginGeofenceRadiusMeters: radius,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    cachedSettings = await loadSettings({ force: true });
    settingsLoginSecurityInfo.textContent = 'Security settings saved.';
    settingsLoginSecurityInfo.hidden = false;
    populateSettingsForm(cachedSettings);
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
    businessName: document.getElementById('settingsBusinessName').value.trim(),
    businessLogoUrl: pendingLogoUrl || null,
    workingDays: [...settingsWorkingDays.querySelectorAll('input:checked')].map(cb => cb.value),
    workStartTime: settingsWorkStartTime.value || '08:00',
    workHoursPerDay: toNumber(settingsWorkHoursPerDay.value) || 8,
    breakMinutes: Math.round(toNumber(settingsBreakMinutes.value)) || 0,
    nssfRate: toNumber(document.getElementById('settingsNssfRate').value),
    nssfUpperLimit: toNumber(document.getElementById('settingsNssfUpperLimit').value),
    shifRate: toNumber(document.getElementById('settingsShifRate').value),
    shifMinimum: toNumber(document.getElementById('settingsShifMinimum').value),
    ahlEmployeeRate: toNumber(document.getElementById('settingsAhlEmployeeRate').value),
    ahlEmployerRate: toNumber(document.getElementById('settingsAhlEmployerRate').value),
    personalRelief: toNumber(document.getElementById('settingsPersonalRelief').value),
    nitaLevy: toNumber(document.getElementById('settingsNitaLevy').value),
    insuranceReliefCap: toNumber(document.getElementById('settingsInsuranceReliefCap').value),
    telephoneThreshold: toNumber(document.getElementById('settingsTelephoneThreshold').value),
    mealsThreshold: toNumber(document.getElementById('settingsMealsThreshold').value),
    allowableDeductionCap: toNumber(document.getElementById('settingsAllowableDeductionCap').value),
    perDiemThreshold: toNumber(document.getElementById('settingsPerDiemThreshold').value),
    daysInMonth: toNumber(document.getElementById('settingsDaysInMonth').value),
    secondaryFlatRate: toNumber(document.getElementById('settingsSecondaryFlatRate').value),
    contractorWhtRate: toNumber(document.getElementById('settingsContractorWhtRate').value),
    pwdExemption: toNumber(document.getElementById('settingsPwdExemption').value),
    jobPositions: cachedSettings?.jobPositions || [],
    departments: cachedSettings?.departments || [],
    subDepartments: cachedSettings?.subDepartments || [],
    employeeNumberPrefix: settingsEmpNumPrefix.value.trim() || 'EMP',
    employeeNumberPadding: Math.max(toNumber(settingsEmpNumPadding.value) || 3, 1),
    employeeNumberSeparator: settingsEmpNumSeparator.value,
    employeeNumberIncludeYear: settingsEmpNumIncludeYear.checked,
    employeeNumberIncludeMonth: settingsEmpNumIncludeMonth.checked,
    updatedAt: new Date().toISOString()
  };

  saveSettingsBtn.disabled = true;
  try {
    await setDoc(businessDoc('settings', 'main'), payload, { merge: true });
    cachedSettings = await loadSettings({ force: true });
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
