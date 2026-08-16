const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');

// Called by an employee's own portal session to find out whether their
// business's owner has been blocked -- they have no read access to the
// owner's profiles doc otherwise (see firestore.rules). Mirrors
// is_my_owner_blocked() from the old schema. Blocking a business this
// way cascades to every one of its employees automatically, without
// the admin having to separately block each one.
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
  if (!user.ownerUserId) {
    res.status(200).json({ blocked: false });
    return;
  }

  const ownerSnap = await firestoreAdmin.collection('profiles').doc(user.ownerUserId).get();
  const blocked = ownerSnap.exists ? !!ownerSnap.data().isBlocked : false;
  res.status(200).json({ blocked });
};
