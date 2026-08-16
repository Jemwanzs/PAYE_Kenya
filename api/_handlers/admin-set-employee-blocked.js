const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');

// Mirrors admin_set_employee_blocked() from the old schema -- blocks/
// unblocks one employee's own portal access, independent of the
// owner's account and independent of `status` (which carries payroll/
// termination meaning this deliberately doesn't touch).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user || !user.isAdmin) {
    res.status(401).json({ error: 'not authorized' });
    return;
  }

  const { ownerUserId, employeeId, blocked } = req.body || {};
  if (!ownerUserId || !employeeId || typeof blocked !== 'boolean') {
    res.status(400).json({ error: 'Invalid request.' });
    return;
  }

  try {
    await firestoreAdmin.collection('businesses').doc(ownerUserId).collection('employees').doc(employeeId)
      .update({ portalBlocked: blocked, updatedAt: new Date().toISOString() });
    res.status(200).json({ done: true });
  } catch (err) {
    console.error('admin-set-employee-blocked failed', err);
    res.status(500).json({ error: err.message || 'Could not update this employee.' });
  }
};
