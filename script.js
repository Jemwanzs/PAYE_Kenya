const moneyFields = [...document.querySelectorAll('[data-money]')];
const allInputs = [...document.querySelectorAll('input')];

const earningComponents = [
  { id: 'regularAllowances', label: 'Recurring allowances' },
  { id: 'oneOffAllowances', label: 'One-off allowances' },
  { id: 'bonusPay', label: 'Bonus / commission' },
  { id: 'transportAllowance', label: 'Transport allowance' },
  { id: 'houseAllowance', label: 'House / rent allowance' },
  { id: 'overtimePay', label: 'Overtime allowance' },
  { id: 'otherCashAllowance', label: 'Other cash allowance' },
  { id: 'cashBenefits', label: 'Cash benefits' },
  { id: 'carBenefit', label: 'Car benefit' },
  { id: 'telephoneBenefit', label: 'Telephone / internet benefit' },
  { id: 'mealsBenefit', label: 'Meals benefit' },
  { id: 'otherNonCashBenefit', label: 'Other non-cash benefit' }
];

// Irregular/one-off components — excluded from the "recurring earnings"
// pool that a PWD employee's tax-exempt amount is deducted from.
const irregularComponentIds = ['oneOffAllowances', 'overtimePay'];

const ids = [
  'basicPay',
  ...earningComponents.map(item => item.id),
  ...earningComponents.flatMap(item => [`${item.id}AffectsNssf`, `${item.id}AffectsShif`, `${item.id}AffectsAhl`]),
  'nssfRate','nssfUpperLimit','shifRate','shifMinimum','ahlEmployeeRate','ahlEmployerRate','personalRelief','nitaLevy',
  'employeePensionRate','employerPensionRate','lifeInsurance','educationInsurance','otherDeductions','insuranceReliefCap',
  'telephoneThreshold','mealsThreshold','allowableDeductionCap',
  'employeeClassification','secondaryFlatRate','contractorWhtRate','pwdExemption'
];

const classificationLabels = {
  primary: 'Primary Employee',
  secondary: 'Secondary Employee',
  contractor: 'Contractor',
  pwd: 'Person With Disability'
};

const classificationHints = {
  primary: 'Primary employee: standard PAYE bands, all statutory deductions and reliefs apply as configured below.',
  secondary: 'Secondary employee: NSSF (employee and employer) is nil. SHIF and AHL remain allowable deductions, pension is not allowable. PAYE is charged at the flat rate below on the resulting taxable amount — no personal or insurance relief applies.',
  contractor: 'Contractor: no NSSF, SHIF, AHL, pension, NITA levy or reliefs apply — WHT (withholding tax) is the only statutory deduction, charged at the flat rate below on total gross pay.',
  pwd: 'Person with disability: taxed as a Primary Employee, except the exempt amount below is deducted from taxable pay before the standard PAYE bands apply.'
};

// Config fields each classification ignores in the calculation — disabled in
// the UI so what's greyed out matches what actually feeds the computation.
const classificationIrrelevantFields = {
  primary: ['secondaryFlatRate', 'contractorWhtRate', 'pwdExemption'],
  secondary: ['nssfRate', 'nssfUpperLimit', 'personalRelief', 'insuranceReliefCap', 'contractorWhtRate', 'pwdExemption'],
  contractor: [
    'nssfRate', 'nssfUpperLimit', 'shifRate', 'shifMinimum', 'ahlEmployeeRate', 'ahlEmployerRate',
    'employeePensionRate', 'employerPensionRate', 'allowableDeductionCap', 'telephoneThreshold', 'mealsThreshold',
    'personalRelief', 'insuranceReliefCap', 'secondaryFlatRate', 'pwdExemption', 'nitaLevy'
  ],
  pwd: ['secondaryFlatRate', 'contractorWhtRate']
};
const allClassificationGatedFields = [...new Set(Object.values(classificationIrrelevantFields).flat())];

function applyClassificationFieldState(classification) {
  const irrelevant = new Set(classificationIrrelevantFields[classification] || []);
  allClassificationGatedFields.forEach(id => {
    const field = el[id];
    if (!field) return;
    field.disabled = irrelevant.has(id);
    field.closest('label')?.classList.toggle('field-disabled', irrelevant.has(id));
  });
}

const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

const classificationDropdown = document.getElementById('classificationDropdown');
const classificationTrigger = document.getElementById('classificationTrigger');
const classificationTriggerIcon = document.getElementById('classificationTriggerIcon');
const classificationTriggerText = document.getElementById('classificationTriggerText');
const classificationPanel = document.getElementById('classificationPanel');
const classificationOptions = [...document.querySelectorAll('.classification-option')];

function closeClassificationPanel() {
  classificationPanel.hidden = true;
  classificationTrigger.setAttribute('aria-expanded', 'false');
}

function openClassificationPanel() {
  classificationPanel.hidden = false;
  classificationTrigger.setAttribute('aria-expanded', 'true');
}

classificationTrigger.addEventListener('click', () => {
  if (classificationPanel.hidden) openClassificationPanel(); else closeClassificationPanel();
});

function syncClassificationTrigger() {
  const value = el.employeeClassification.value;
  const option = classificationOptions.find(opt => opt.dataset.value === value) || classificationOptions[0];
  classificationTriggerIcon.textContent = option.dataset.icon;
  classificationTriggerText.textContent = option.dataset.label;
  classificationOptions.forEach(opt => opt.classList.toggle('is-selected', opt === option));
}

classificationOptions.forEach(option => {
  option.addEventListener('click', () => {
    el.employeeClassification.value = option.dataset.value;
    el.employeeClassification.dispatchEvent(new Event('change', { bubbles: true }));
    syncClassificationTrigger();
    closeClassificationPanel();
  });
});

document.addEventListener('click', event => {
  if (!classificationDropdown.contains(event.target)) closeClassificationPanel();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeClassificationPanel();
});

function toNumber(value) {
  return Number(String(value || '').replace(/,/g, '')) || 0;
}

function money(value) {
  return `KES ${Math.max(value, 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rawMoney(value) {
  return Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function percentValue(input) {
  return toNumber(input.value) / 100;
}

function progressiveTax(taxablePay) {
  const bands = [
    { limit: 24000, rate: 0.10 },
    { limit: 32333, rate: 0.25 },
    { limit: 500000, rate: 0.30 },
    { limit: 800000, rate: 0.325 },
    { limit: Infinity, rate: 0.35 }
  ];

  let tax = 0;
  let previousLimit = 0;

  for (const band of bands) {
    if (taxablePay > previousLimit) {
      const amountInBand = Math.min(taxablePay, band.limit) - previousLimit;
      tax += amountInBand * band.rate;
      previousLimit = band.limit;
    }
  }

  return Math.max(tax, 0);
}

function row(label, value, highlight = false) {
  const zero = !highlight && Math.round(value * 100) === 0;
  return `<div class="result-row ${highlight ? 'highlight' : ''} ${zero ? 'zero-row' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`;
}

function statBase(statKey, componentValues, basicPay) {
  return earningComponents.reduce((total, item) => {
    const toggle = el[`${item.id}Affects${statKey}`];
    return total + (toggle?.checked ? componentValues[item.id] : 0);
  }, basicPay);
}

function calculate() {
  const classification = el.employeeClassification.value;
  const isSecondary = classification === 'secondary';
  const isContractor = classification === 'contractor';
  const isPwd = classification === 'pwd';

  document.getElementById('classificationHint').textContent = classificationHints[classification] || classificationHints.primary;
  applyClassificationFieldState(classification);

  const basicPay = toNumber(el.basicPay.value);
  const values = Object.fromEntries(earningComponents.map(item => [item.id, toNumber(el[item.id].value)]));

  const directAllowances = values.regularAllowances + values.oneOffAllowances + values.bonusPay;
  const cashAllowances = values.transportAllowance + values.houseAllowance + values.overtimePay + values.otherCashAllowance;
  const nonCashBenefits = values.carBenefit + values.telephoneBenefit + values.mealsBenefit + values.otherNonCashBenefit;

  const cashGross = basicPay + directAllowances + cashAllowances + values.cashBenefits;
  const displayGross = cashGross + nonCashBenefits;

  // A PWD employee's tax-exempt amount comes off Basic pay + recurring
  // earnings (not one-off allowances/overtime) before anything else is
  // computed — proportionally, so each earning's own NSSF/SHIF/AHL toggle
  // still applies to its (reduced) share exactly like a Primary employee.
  // Actual gross/cash-flow figures above are untouched — only the base that
  // NSSF/SHIF/AHL/pension/taxable pay are built from shrinks.
  const pwdExemption = toNumber(el.pwdExemption.value);
  const regularEarningsPool = earningComponents.reduce((total, item) => {
    return total + (irregularComponentIds.includes(item.id) ? 0 : values[item.id]);
  }, basicPay);
  const pwdReductionApplied = isPwd ? Math.min(pwdExemption, regularEarningsPool) : 0;
  const pwdReductionRatio = pwdReductionApplied > 0 ? pwdReductionApplied / regularEarningsPool : 0;

  function taxBasis(id, rawValue) {
    return (pwdReductionRatio > 0 && !irregularComponentIds.includes(id)) ? rawValue * (1 - pwdReductionRatio) : rawValue;
  }

  const taxBasicPay = taxBasis('basicPay', basicPay);
  const taxValues = Object.fromEntries(earningComponents.map(item => [item.id, taxBasis(item.id, values[item.id])]));

  const nssfBase = isContractor ? 0 : statBase('Nssf', taxValues, taxBasicPay);
  const shifBase = isContractor ? 0 : statBase('Shif', taxValues, taxBasicPay);
  const ahlBase = isContractor ? 0 : statBase('Ahl', taxValues, taxBasicPay);

  const nssfEmployee = (isSecondary || isContractor) ? 0 : Math.min(nssfBase, toNumber(el.nssfUpperLimit.value)) * percentValue(el.nssfRate);
  const nssfEmployer = nssfEmployee;
  const shif = isContractor ? 0 : (shifBase > 0 ? Math.max(shifBase * percentValue(el.shifRate), toNumber(el.shifMinimum.value)) : 0);
  const ahlEmployee = isContractor ? 0 : ahlBase * percentValue(el.ahlEmployeeRate);
  const ahlEmployer = isContractor ? 0 : ahlBase * percentValue(el.ahlEmployerRate);

  const employeePension = isContractor ? 0 : taxBasicPay * percentValue(el.employeePensionRate);
  const employerPension = isContractor ? 0 : taxBasicPay * percentValue(el.employerPensionRate);
  const allowableDeductionCap = toNumber(el.allowableDeductionCap.value);
  const nssfPensionAllowable = (isSecondary || isContractor) ? 0 : Math.min(nssfEmployee + employeePension, allowableDeductionCap);
  const totalTaxAllowableDeductions = isContractor ? 0 : (nssfPensionAllowable + shif + ahlEmployee);

  const taxableTelephone = taxValues.telephoneBenefit <= toNumber(el.telephoneThreshold.value) ? 0 : taxValues.telephoneBenefit;
  const taxableMeals = taxValues.mealsBenefit <= toNumber(el.mealsThreshold.value) ? 0 : taxValues.mealsBenefit;
  const taxableBenefits = taxValues.cashBenefits + taxValues.carBenefit + taxableTelephone + taxableMeals + taxValues.otherNonCashBenefit;
  const taxDirectAllowances = taxValues.regularAllowances + taxValues.oneOffAllowances + taxValues.bonusPay;
  const taxCashAllowances = taxValues.transportAllowance + taxValues.houseAllowance + taxValues.overtimePay + taxValues.otherCashAllowance;
  const taxableCashEarnings = taxBasicPay + taxDirectAllowances + taxCashAllowances;
  const excessEmployerPension = Math.max((employerPension + nssfEmployer) - allowableDeductionCap, 0);

  const insurancePremiums = toNumber(el.lifeInsurance.value) + toNumber(el.educationInsurance.value);

  let taxablePay;
  let incomeTax;
  let insuranceRelief = 0;
  let appliedPersonalRelief = 0;
  let paye;

  if (isContractor) {
    taxablePay = displayGross;
    incomeTax = displayGross * percentValue(el.contractorWhtRate);
    paye = incomeTax;
  } else {
    taxablePay = Math.max(taxableCashEarnings + taxableBenefits + excessEmployerPension - totalTaxAllowableDeductions, 0);

    if (isSecondary) {
      incomeTax = taxablePay * percentValue(el.secondaryFlatRate);
      paye = incomeTax;
    } else {
      // For PWD, the exempt amount is already baked into taxablePay above
      // (it reduced the earnings that fed NSSF/SHIF/AHL/taxable pay), so it
      // isn't subtracted again here — from this point on a PWD employee
      // follows exactly the same route as a Primary employee.
      incomeTax = progressiveTax(taxablePay);
      insuranceRelief = Math.min(insurancePremiums * 0.15, toNumber(el.insuranceReliefCap.value));
      appliedPersonalRelief = toNumber(el.personalRelief.value);
      paye = Math.max(incomeTax - appliedPersonalRelief - insuranceRelief, 0);
    }
  }

  const wht = isContractor ? paye : 0;
  const nitaLevy = isContractor ? 0 : toNumber(el.nitaLevy.value);

  const otherDeductions = toNumber(el.otherDeductions.value);
  const employeeDeductions = paye + nssfEmployee + shif + ahlEmployee + employeePension + insurancePremiums + otherDeductions;
  const netPay = Math.max(cashGross - employeeDeductions, 0);
  const effectiveTaxRate = taxablePay > 0 ? (paye / taxablePay) * 100 : 0;

  document.getElementById('netPay').textContent = money(netPay);
  document.getElementById('grossPay').textContent = money(displayGross);
  document.getElementById('taxablePay').textContent = money(taxablePay);
  document.getElementById('paye').textContent = money(paye);
  document.getElementById('totalDeductions').textContent = money(employeeDeductions);
  document.getElementById('effectiveTaxRate').textContent = `Effective PAYE rate: ${effectiveTaxRate.toFixed(2)}%`;
  document.getElementById('netCardClassification').textContent = `Employee type: ${classificationLabels[classification] || classificationLabels.primary}`;

  const barSegments = [
    { label: 'Net pay', value: netPay, className: 'seg-net' },
    { label: 'PAYE', value: paye, className: 'seg-paye' },
    { label: 'NSSF', value: nssfEmployee, className: 'seg-nssf' },
    { label: 'SHIF', value: shif, className: 'seg-shif' },
    { label: 'AHL', value: ahlEmployee, className: 'seg-ahl' },
    { label: 'Other deductions', value: employeePension + insurancePremiums + otherDeductions, className: 'seg-other' }
  ];
  const barTotal = barSegments.reduce((sum, seg) => sum + seg.value, 0);

  document.getElementById('stackedBar').innerHTML = barTotal > 0
    ? barSegments
        .filter(seg => seg.value > 0)
        .map(seg => `<span class="bar-seg ${seg.className}" style="width:${(seg.value / barTotal * 100).toFixed(2)}%" title="${seg.label}: ${money(seg.value)}"></span>`)
        .join('')
    : '';

  document.getElementById('barLegend').innerHTML = barTotal > 0
    ? barSegments
        .map(seg => `<div class="legend-item"><span class="dot ${seg.className}"></span><span>${seg.label}</span><strong>${money(seg.value)}</strong></div>`)
        .join('')
    : '<div class="legend-item">Enter pay details to see the breakdown.</div>';

  document.getElementById('earningsRows').innerHTML = [
    row('Basic pay', basicPay),
    row('Direct allowances', directAllowances),
    row('Cash allowances breakdown total', cashAllowances),
    row('Taxable benefits used', taxableBenefits),
    row('Gross pay displayed', displayGross, true)
  ].join('');

  const taxRows = isContractor
    ? [row('WHT', wht, true)]
    : [
        row('Income tax before reliefs', incomeTax),
        row('Personal relief', appliedPersonalRelief),
        row('Insurance relief', insuranceRelief),
        row('PAYE payable', paye, true),
        row('WHT', wht)
      ];

  // Contractors have no NSSF/SHIF/AHL at all, so the base figures those
  // would be computed from aren't a meaningful line item on their payslip.
  const statutoryBaseRows = isContractor
    ? []
    : [
        row('PWD exempt amount applied', pwdReductionApplied),
        row('NSSF Base', nssfBase),
        row('SHIF Base', shifBase),
        row('AHL Base', ahlBase)
      ];

  document.getElementById('deductionsRows').innerHTML = [
    ...statutoryBaseRows,
    row('NSSF employee', nssfEmployee),
    row('SHIF employee', shif),
    row('AHL employee', ahlEmployee),
    row('Employee pension', employeePension),
    row('NSSF + pension allowable deductions', nssfPensionAllowable, true),
    row('Total tax-deductible statutory deductions', totalTaxAllowableDeductions),
    ...taxRows,
    row('Insurance premiums deducted', insurancePremiums),
    row('Other deductions', otherDeductions)
  ].join('');

  document.getElementById('netPayRow').innerHTML = row('Net pay', netPay, true);

  document.getElementById('employerRows').innerHTML = [
    row('NSSF employer', nssfEmployer),
    row('AHL employer', ahlEmployer),
    row('Employer pension', employerPension),
    row('NITA levy', nitaLevy),
    row('Total employer cost add-ons', nssfEmployer + ahlEmployer + employerPension + nitaLevy, true)
  ].join('');
}

moneyFields.forEach(input => {
  input.addEventListener('blur', () => {
    input.value = input.value ? rawMoney(toNumber(input.value)) : '';
  });
});

allInputs.forEach(input => input.addEventListener('input', calculate));
el.employeeClassification.addEventListener('change', calculate);

function restoreDefaultStatutoryToggles() {
  earningComponents.forEach(item => {
    const affectsByDefault = !['oneOffAllowances', 'overtimePay'].includes(item.id);
    ['Nssf', 'Shif', 'Ahl'].forEach(stat => {
      const checkbox = el[`${item.id}Affects${stat}`];
      if (checkbox) checkbox.checked = affectsByDefault;
    });
  });
}

document.getElementById('resetBtn').addEventListener('click', () => {
  document.getElementById('payrollForm').reset();
  restoreDefaultStatutoryToggles();
  el.nssfRate.value = 6;
  el.nssfUpperLimit.value = rawMoney(108000);
  el.shifRate.value = 2.75;
  el.shifMinimum.value = rawMoney(300);
  el.ahlEmployeeRate.value = 1.5;
  el.ahlEmployerRate.value = 1.5;
  el.personalRelief.value = rawMoney(2400);
  el.nitaLevy.value = rawMoney(50);
  el.insuranceReliefCap.value = rawMoney(5000);
  el.telephoneThreshold.value = rawMoney(5000);
  el.mealsThreshold.value = rawMoney(5000);
  el.allowableDeductionCap.value = rawMoney(30000);
  el.employeeClassification.value = 'primary';
  el.secondaryFlatRate.value = 35;
  el.contractorWhtRate.value = 5;
  el.pwdExemption.value = rawMoney(150000);
  syncClassificationTrigger();
  calculate();
});

document.getElementById('printBtn').addEventListener('click', () => window.print());

const tabButtons = [...document.querySelectorAll('.tab-btn')];
const tabPanels = Object.fromEntries([...document.querySelectorAll('.tab-panel')].map(panel => [panel.dataset.tabPanel, panel]));

function activateTab(name) {
  tabButtons.forEach(btn => btn.setAttribute('aria-selected', String(btn.dataset.tab === name)));
  Object.entries(tabPanels).forEach(([key, panel]) => { panel.hidden = key !== name; });
}

tabButtons.forEach(btn => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
document.getElementById('proceedBtn').addEventListener('click', () => activateTab('calculate'));

activateTab('config');
restoreDefaultStatutoryToggles();
syncClassificationTrigger();
calculate();
