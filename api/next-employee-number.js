const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');
const defaultPayrollSettings = require('./_defaultSettings');

// Atomically formats and reserves the next employee number for the
// caller's own business -- mirrors next_employee_number() from the old
// schema. A Firestore transaction replaces Postgres's `for update` row
// lock for the same reason: two employees being created at once must
// never be handed the same number.
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

  const settingsRef = firestoreAdmin.collection('businesses').doc(user.uid).collection('settings').doc('main');

  try {
    const formatted = await firestoreAdmin.runTransaction(async tx => {
      const snap = await tx.get(settingsRef);
      const settings = snap.exists ? snap.data() : defaultPayrollSettings();
      if (!snap.exists) tx.set(settingsRef, settings);

      const parts = [];
      if ((settings.employeeNumberPrefix || '') !== '') parts.push(settings.employeeNumberPrefix);
      const now = new Date();
      if (settings.employeeNumberIncludeYear) parts.push(String(now.getFullYear()));
      if (settings.employeeNumberIncludeMonth) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
      const nextNumber = settings.employeeNumberNext ?? 1;
      const padding = Math.max(settings.employeeNumberPadding ?? 3, 1);
      parts.push(String(nextNumber).padStart(padding, '0'));

      tx.update(settingsRef, { employeeNumberNext: nextNumber + 1 });
      return parts.join(settings.employeeNumberSeparator || '');
    });

    res.status(200).json({ employeeNumber: formatted });
  } catch (err) {
    console.error('next-employee-number failed', err);
    res.status(500).json({ error: err.message || 'Could not generate an employee number.' });
  }
};
