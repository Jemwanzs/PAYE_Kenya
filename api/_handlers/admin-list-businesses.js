const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');

// Mirrors admin_list_businesses() from the old schema. Returns an empty
// list for a non-admin caller rather than a 403 -- lets the client
// treat "not admin" and "no businesses yet" the same way, same pattern
// RLS-scoped queries used elsewhere in this app.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user || !user.isAdmin) {
    res.status(200).json({ businesses: [] });
    return;
  }

  try {
    const ownersSnap = await firestoreAdmin.collection('profiles').where('role', '==', 'owner').orderBy('createdAt', 'desc').get();

    const businesses = await Promise.all(ownersSnap.docs.map(async ownerDoc => {
      const owner = ownerDoc.data();
      const [settingsSnap, employeesSnap] = await Promise.all([
        firestoreAdmin.collection('businesses').doc(ownerDoc.id).collection('settings').doc('main').get(),
        firestoreAdmin.collection('businesses').doc(ownerDoc.id).collection('employees').get()
      ]);
      const employeeCount = employeesSnap.docs.filter(d => d.data().status !== 'terminated').length;

      return {
        userId: ownerDoc.id,
        email: owner.email,
        businessName: settingsSnap.exists ? settingsSnap.data().businessName : null,
        isAdmin: !!owner.isAdmin,
        isBlocked: !!owner.isBlocked,
        trialStartedAt: owner.trialStartedAt,
        accessExpiresAt: owner.accessExpiresAt,
        employeeCount,
        createdAt: owner.createdAt
      };
    }));

    res.status(200).json({ businesses });
  } catch (err) {
    console.error('admin-list-businesses failed', err);
    res.status(500).json({ error: err.message || 'Could not load businesses.' });
  }
};
