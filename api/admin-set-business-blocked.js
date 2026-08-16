const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');

// Mirrors admin_set_business_blocked() from the old schema. Refuses to
// let an admin block their own account -- a self-lockout would need a
// second admin (or direct DB access) to undo.
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

  const { userId, blocked } = req.body || {};
  if (!userId || typeof blocked !== 'boolean') {
    res.status(400).json({ error: 'Invalid request.' });
    return;
  }
  if (userId === user.uid) {
    res.status(400).json({ error: 'cannot block your own account' });
    return;
  }

  try {
    await firestoreAdmin.collection('profiles').doc(userId).update({ isBlocked: blocked, updatedAt: new Date().toISOString() });
    res.status(200).json({ done: true });
  } catch (err) {
    console.error('admin-set-business-blocked failed', err);
    res.status(500).json({ error: err.message || 'Could not update this business.' });
  }
};
