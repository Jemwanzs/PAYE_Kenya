const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');

// Lets the platform admin fix up a business's own display name from the
// Businesses page, without needing to sign in as that owner and visit
// their Settings. Writes straight to businesses/{userId}/settings/main
// (Admin SDK, bypassing firestore.rules' owner-only write restriction on
// that doc) -- merge:true so this never clobbers the rest of that
// business's settings, and works fine even if the doc doesn't exist yet
// (the owner's own Settings page fills in every other default the first
// time they save there, same as it always has).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const admin = await getAuthenticatedUser(req);
  if (!admin || !admin.isAdmin) {
    res.status(403).json({ error: 'Not authorized.' });
    return;
  }

  const { userId, businessName } = req.body || {};
  if (!userId || typeof businessName !== 'string') {
    res.status(400).json({ error: 'userId and businessName are required.' });
    return;
  }
  const trimmed = businessName.trim();
  if (!trimmed) {
    res.status(400).json({ error: 'Business name cannot be empty.' });
    return;
  }

  try {
    await firestoreAdmin.collection('businesses').doc(userId).collection('settings').doc('main')
      .set({ businessName: trimmed, updatedAt: new Date().toISOString() }, { merge: true });
    res.status(200).json({ updated: true });
  } catch (err) {
    console.error('admin-update-business failed', err);
    res.status(500).json({ error: err.message || 'Could not update this business.' });
  }
};
