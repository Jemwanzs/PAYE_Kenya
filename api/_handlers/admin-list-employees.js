const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');

// Mirrors admin_list_employees(p_owner_user_id) from the old schema --
// the admin dashboard's drill-down into one business's employee list.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user || !user.isAdmin) {
    res.status(200).json({ employees: [] });
    return;
  }

  const ownerUserId = req.body?.ownerUserId;
  if (!ownerUserId) {
    res.status(400).json({ error: 'ownerUserId is required.' });
    return;
  }

  try {
    const snap = await firestoreAdmin.collection('businesses').doc(ownerUserId).collection('employees').orderBy('firstName').get();
    const employees = snap.docs.map(d => {
      const e = d.data();
      return {
        id: d.id,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email || null,
        status: e.status,
        authUserId: e.authUserId || null,
        portalBlocked: !!e.portalBlocked,
        employeeNumber: e.employeeNumber || null
      };
    });
    res.status(200).json({ employees });
  } catch (err) {
    console.error('admin-list-employees failed', err);
    res.status(500).json({ error: err.message || 'Could not load employees.' });
  }
};
