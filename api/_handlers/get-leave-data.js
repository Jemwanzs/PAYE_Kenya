const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');
const defaultPayrollSettings = require('../_defaultSettings');

// The employee portal's leave tab shares its whole data layer (balance
// math, calendar, eligibility) with the owner's Leave page (see
// leave.js's top-of-file comment), but an owner's plain collection-wide
// Firestore reads don't work for an employee session: firestore.rules
// restricts employees to their OWN employees/leaveApplications/
// leaveBalanceAdjustments docs, and Firestore rejects a collection query
// outright unless every possible result is provably allowed. Rather than
// let the employee tab silently show only itself, this endpoint (Admin
// SDK, bypassing rules) does the same broad reads the owner's browser
// does directly -- employees/leaveTypes/publicHolidays/settings in full
// (needed for the team calendar and eligibility checks), applications in
// full too (so "who's on leave" on the calendar shows the whole team),
// but balance adjustments scoped to the caller's own employeeId only --
// nobody else's manual balance corrections are this employee's business.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.role !== 'employee' || !user.ownerUserId) {
    res.status(403).json({ error: 'Employee session required.' });
    return;
  }

  const businessRef = firestoreAdmin.collection('businesses').doc(user.ownerUserId);

  try {
    const [employeesSnap, typesSnap, holidaysSnap, appsSnap, adjustmentsSnap, settingsSnap] = await Promise.all([
      businessRef.collection('employees').orderBy('firstName').get(),
      businessRef.collection('leaveTypes').orderBy('name').get(),
      businessRef.collection('publicHolidays').orderBy('holidayDate').get(),
      businessRef.collection('leaveApplications').orderBy('startDate', 'desc').get(),
      businessRef.collection('leaveBalanceAdjustments').where('employeeId', '==', user.employeeId).orderBy('adjustmentDate', 'desc').get(),
      businessRef.collection('settings').doc('main').get()
    ]);

    res.status(200).json({
      employees: employeesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      leaveTypes: typesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      holidays: holidaysSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      applications: appsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      adjustments: adjustmentsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      settings: settingsSnap.exists ? settingsSnap.data() : defaultPayrollSettings()
    });
  } catch (err) {
    console.error('get-leave-data failed', err);
    res.status(500).json({ error: err.message || 'Could not load leave data.' });
  }
};
