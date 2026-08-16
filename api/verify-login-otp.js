const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');
const crypto = require('crypto');

const MAX_ATTEMPTS = 5;

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

  const code = String(req.body?.code || '').trim();
  if (!/^\d{5}$/.test(code)) {
    res.status(400).json({ error: 'Enter the 5-digit code.' });
    return;
  }

  const otpsRef = firestoreAdmin.collection('loginOtps');
  const snap = await otpsRef
    .where('userId', '==', user.uid)
    .where('consumedAt', '==', null)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) {
    res.status(400).json({ error: 'No active code. Request a new one.' });
    return;
  }
  const otpDoc = snap.docs[0];
  const otpRow = otpDoc.data();

  if (new Date(otpRow.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: 'This code has expired. Request a new one.' });
    return;
  }
  if (otpRow.attempts >= MAX_ATTEMPTS) {
    res.status(400).json({ error: 'Too many attempts. Request a new code.' });
    return;
  }

  const codeHash = crypto.createHash('sha256').update(`${user.uid}:${code}`).digest('hex');
  if (codeHash !== otpRow.codeHash) {
    await otpDoc.ref.update({ attempts: otpRow.attempts + 1 });
    const remaining = MAX_ATTEMPTS - (otpRow.attempts + 1);
    res.status(400).json({ error: remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.` : 'Too many attempts. Request a new code.' });
    return;
  }

  await otpDoc.ref.update({ consumedAt: new Date().toISOString() });
  res.status(200).json({ verified: true });
};
