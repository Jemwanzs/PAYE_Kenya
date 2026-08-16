const { firestoreAdmin, authAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');

// Creates the profiles/{uid} doc and sets the initial custom claims
// (role:'owner', isAdmin:false) right after a fresh owner signup --
// mirrors handle_new_user(), which ran automatically as a Postgres
// trigger on auth.users insert. Firestore has no equivalent synchronous
// trigger this app relies on elsewhere (see api/invite-employee.js for
// the same reasoning on the employee side), so the client calls this
// explicitly right after createUserWithEmailAndPassword() succeeds.
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

  const profileRef = firestoreAdmin.collection('profiles').doc(user.uid);
  const existing = await profileRef.get();
  if (!existing.exists) {
    await profileRef.set({
      email: user.email || null,
      role: 'owner',
      isAdmin: false,
      isBlocked: false,
      trialStartedAt: new Date().toISOString(),
      accessExpiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Idempotent -- safe to call again if a previous attempt's profile
  // write succeeded but the client never got the response (e.g. a
  // dropped connection right after), since this is just an overwrite,
  // not an increment/append.
  await authAdmin.setCustomUserClaims(user.uid, { role: 'owner', isAdmin: false });

  res.status(200).json({ done: true });
};
