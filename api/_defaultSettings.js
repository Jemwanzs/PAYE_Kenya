// Mirrors every column default from the old payroll_settings table (see
// supabase/schema.sql). Used wherever a business's settings doc might
// need to be created for the very first time, so it's never left
// partially populated -- Firestore has no column-level defaults the way
// Postgres did, so every field has to be written explicitly by
// application code instead. employees.js's own client-side fallback
// (used when populating the Settings form before any doc exists) mirrors
// these same values -- keep both in sync if either changes.
module.exports = function defaultPayrollSettings() {
  return {
    nssfRate: 6,
    nssfUpperLimit: 108000,
    shifRate: 2.75,
    shifMinimum: 300,
    ahlEmployeeRate: 1.5,
    ahlEmployerRate: 1.5,
    personalRelief: 2400,
    nitaLevy: 50,
    insuranceReliefCap: 5000,
    telephoneThreshold: 5000,
    mealsThreshold: 5000,
    allowableDeductionCap: 30000,
    perDiemThreshold: 10000,
    daysInMonth: 30,
    secondaryFlatRate: 35,
    contractorWhtRate: 5,
    pwdExemption: 150000,
    jobPositions: [],
    departments: [],
    subDepartments: [],
    employeeNumberPrefix: 'EMP',
    employeeNumberPadding: 3,
    employeeNumberIncludeYear: false,
    employeeNumberIncludeMonth: false,
    employeeNumberNext: 1,
    employeeNumberSeparator: '',
    businessName: '',
    businessLogoUrl: null,
    workHoursPerDay: 8,
    workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    workStartTime: '08:00',
    breakMinutes: 60,
    reportPasscodeHash: null,
    loginWindowEnabled: false,
    loginWindowStart: '08:00',
    loginWindowEnd: '18:00',
    loginGeofenceEnabled: false,
    loginGeofenceLatitude: null,
    loginGeofenceLongitude: null,
    loginGeofenceRadiusMeters: 500
  };
};
