const { firestoreAdmin, authAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');

// One-time, self-limiting admin bootstrap for the platform's own
// operator account(s) -- mirrors auth.js's SUPER_ADMIN_EMAILS constant
// exactly (keep both lists in sync). Firestore's profiles/{uid}.isAdmin
// alone isn't enough to unlock the admin-only /api/admin-*.js endpoints
// or firestore.rules' sessionLogs read policy -- both check the ID
// token's isAdmin CUSTOM CLAIM, which only the Admin SDK can set -- so
// this exists purely to flip that claim (and the mirrored Firestore
// field, for the client's own computeAccess() check) the first time a
// listed email signs in. auth.js calls this once, right after login,
// guarded by !profile.isAdmin -- once granted, it never fires again for
// that account.
const SUPER_ADMIN_EMAILS = ['jamosammy@gmail.com'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await getAuthenticatedUser(req);
  if (!user || !SUPER_ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
    res.status(403).json({ error: 'Not authorized.' });
    return;
  }

  try {
    await firestoreAdmin.collection('profiles').doc(user.uid).set(
      { isAdmin: true, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    // Custom claims are a full overwrite, not a merge -- carry forward
    // whatever role/ownerUserId/employeeId this token already had (all
    // arrive as plain fields on the decoded token alongside the
    // standard ones) so granting admin never accidentally demotes an
    // employee-role account or drops its business linkage.
    const claims = { isAdmin: true };
    if (user.role) claims.role = user.role;
    if (user.ownerUserId) claims.ownerUserId = user.ownerUserId;
    if (user.employeeId) claims.employeeId = user.employeeId;
    await authAdmin.setCustomUserClaims(user.uid, claims);

    res.status(200).json({ granted: true });
  } catch (err) {
    console.error('bootstrap-admin failed', err);
    res.status(500).json({ error: err.message || 'Could not grant admin access.' });
  }
};
