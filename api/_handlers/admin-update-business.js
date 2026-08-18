const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');
const defaultPayrollSettings = require('../_defaultSettings');

// Lets the platform admin fix up a business's own display name from the
// Businesses page, without needing to sign in as that owner and visit
// their Settings. Writes straight to businesses/{userId}/settings/main
// (Admin SDK, bypassing firestore.rules' owner-only write restriction on
// that doc) -- merge:true so this never touches the rest of an EXISTING
// business's settings. For a business with no settings doc yet, though,
// merge:true would otherwise create one with ONLY businessName +
// updatedAt on it -- every other field (NSSF rate, personal relief, ...)
// staying genuinely absent, not just defaulted, which broke payroll run
// creation the first time it hit computePayroll() with those fields
// undefined (Firestore's set() rejects undefined field values outright).
// Seeding the full defaults on first creation keeps that doc always
// complete, matching what the owner's own Settings page would have
// produced.
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
    const settingsRef = firestoreAdmin.collection('businesses').doc(userId).collection('settings').doc('main');
    const existing = await settingsRef.get();
    const patch = existing.exists
      ? { businessName: trimmed, updatedAt: new Date().toISOString() }
      : { ...defaultPayrollSettings(), businessName: trimmed, updatedAt: new Date().toISOString() };
    await settingsRef.set(patch, { merge: true });
    res.status(200).json({ updated: true });
  } catch (err) {
    console.error('admin-update-business failed', err);
    res.status(500).json({ error: err.message || 'Could not update this business.' });
  }
};
