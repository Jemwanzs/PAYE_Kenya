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

const ids = [
  'basicPay',
  ...earningComponents.map(item => item.id),
  ...earningComponents.flatMap(item => [`${item.id}AffectsNssf`, `${item.id}AffectsShif`, `${item.id}AffectsAhl`]),
  'nssfRate','nssfUpperLimit','shifRate','shifMinimum','ahlEmployeeRate','ahlEmployerRate','personalRelief','nitaLevy',
  'employeePensionRate','employerPensionRate','lifeInsurance','educationInsurance','otherDeductions','insuranceReliefCap',
  'telephoneThreshold','mealsThreshold','allowableDeductionCap'
];

const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

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
  return `<div class="result-row ${highlight ? 'highlight' : ''}"><span>${label}</span><strong>${money(value)}</strong></div>`;
}

function statBase(statKey, componentValues, basicPay) {
  return earningComponents.reduce((total, item) => {
    const toggle = el[`${item.id}Affects${statKey}`];
    return total + (toggle?.checked ? componentValues[item.id] : 0);
  }, basicPay);
}

function calculate() {
  const basicPay = toNumber(el.basicPay.value);
  const values = Object.fromEntries(earningComponents.map(item => [item.id, toNumber(el[item.id].value)]));

  const directAllowances = values.regularAllowances + values.oneOffAllowances + values.bonusPay;
  const cashAllowances = values.transportAllowance + values.houseAllowance + values.overtimePay + values.otherCashAllowance;
  const nonCashBenefits = values.carBenefit + values.telephoneBenefit + values.mealsBenefit + values.otherNonCashBenefit;

  const cashGross = basicPay + directAllowances + cashAllowances + values.cashBenefits;
  const displayGross = cashGross + nonCashBenefits;

  const nssfBase = statBase('Nssf', values, basicPay);
  const shifBase = statBase('Shif', values, basicPay);
  const ahlBase = statBase('Ahl', values, basicPay);

  const nssfEmployee = Math.min(nssfBase, toNumber(el.nssfUpperLimit.value)) * percentValue(el.nssfRate);
  const nssfEmployer = nssfEmployee;
  const shif = shifBase > 0 ? Math.max(shifBase * percentValue(el.shifRate), toNumber(el.shifMinimum.value)) : 0;
  const ahlEmployee = ahlBase * percentValue(el.ahlEmployeeRate);
  const ahlEmployer = ahlBase * percentValue(el.ahlEmployerRate);

  const employeePension = basicPay * percentValue(el.employeePensionRate);
  const employerPension = basicPay * percentValue(el.employerPensionRate);
  const allowableDeductionCap = toNumber(el.allowableDeductionCap.value);
  const nssfPensionAllowable = Math.min(nssfEmployee + employeePension, allowableDeductionCap);
  const totalTaxAllowableDeductions = nssfPensionAllowable + shif + ahlEmployee;

  const taxableTelephone = values.telephoneBenefit <= toNumber(el.telephoneThreshold.value) ? 0 : values.telephoneBenefit;
  const taxableMeals = values.mealsBenefit <= toNumber(el.mealsThreshold.value) ? 0 : values.mealsBenefit;
  const taxableBenefits = values.cashBenefits + values.carBenefit + taxableTelephone + taxableMeals + values.otherNonCashBenefit;
  const taxableCashEarnings = basicPay + directAllowances + cashAllowances;
  const excessEmployerPension = Math.max((employerPension + nssfEmployer) - allowableDeductionCap, 0);
  const taxablePay = Math.max(taxableCashEarnings + taxableBenefits + excessEmployerPension - totalTaxAllowableDeductions, 0);

  const incomeTax = progressiveTax(taxablePay);
  const insurancePremiums = toNumber(el.lifeInsurance.value) + toNumber(el.educationInsurance.value);
  const insuranceRelief = Math.min(insurancePremiums * 0.15, toNumber(el.insuranceReliefCap.value));
  const paye = Math.max(incomeTax - toNumber(el.personalRelief.value) - insuranceRelief, 0);

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
  document.getElementById('mobileNetPay').textContent = money(netPay);

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

  document.getElementById('breakdownRows').innerHTML = [
    row('Basic pay', basicPay),
    row('Direct allowances', directAllowances),
    row('Cash allowances breakdown total', cashAllowances),
    row('Taxable benefits used', taxableBenefits),
    row('Gross pay displayed', displayGross, true),
    row('NSSF base selected', nssfBase),
    row('SHIF base selected', shifBase),
    row('AHL base selected', ahlBase),
    row('NSSF employee', nssfEmployee),
    row('SHIF employee', shif),
    row('AHL employee', ahlEmployee),
    row('Employee pension', employeePension),
    row('NSSF + pension allowable deductions', nssfPensionAllowable, true),
    row('Total tax-deductible statutory deductions', totalTaxAllowableDeductions),
    row('Income tax before reliefs', incomeTax),
    row('Personal relief', toNumber(el.personalRelief.value)),
    row('Insurance relief', insuranceRelief),
    row('PAYE payable', paye, true),
    row('Insurance premiums deducted', insurancePremiums),
    row('Other deductions', otherDeductions),
    row('Net pay', netPay, true)
  ].join('');

  document.getElementById('employerRows').innerHTML = [
    row('NSSF employer', nssfEmployer),
    row('AHL employer', ahlEmployer),
    row('Employer pension', employerPension),
    row('NITA levy', toNumber(el.nitaLevy.value)),
    row('Total employer cost add-ons', nssfEmployer + ahlEmployer + employerPension + toNumber(el.nitaLevy.value), true)
  ].join('');
}

moneyFields.forEach(input => {
  input.addEventListener('blur', () => {
    input.value = input.value ? rawMoney(toNumber(input.value)) : '';
  });
});

allInputs.forEach(input => input.addEventListener('input', calculate));

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
  calculate();
});

document.getElementById('printBtn').addEventListener('click', () => window.print());

restoreDefaultStatutoryToggles();
calculate();
