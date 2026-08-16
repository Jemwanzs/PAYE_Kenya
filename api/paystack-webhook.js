const crypto = require('crypto');
const { firestoreAdmin } = require('./_firebaseAdmin');
const { amountForDays, DAY_MS } = require('./_dayPackages');

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function extendAccess({ firebaseUserId, email, days }) {
  let profileRef;
  let profile;
  if (firebaseUserId) {
    profileRef = firestoreAdmin.collection('profiles').doc(firebaseUserId);
    const snap = await profileRef.get();
    if (!snap.exists) throw new Error('Profile not found');
    profile = snap.data();
  } else {
    const query = await firestoreAdmin.collection('profiles').where('email', '==', email).limit(1).get();
    if (query.empty) throw new Error('Profile not found');
    profileRef = query.docs[0].ref;
    profile = query.docs[0].data();
  }

  const now = Date.now();
  const currentExpiry = profile?.accessExpiresAt ? new Date(profile.accessExpiresAt).getTime() : 0;
  const newExpiry = new Date(Math.max(currentExpiry, now) + days * DAY_MS).toISOString();

  await profileRef.update({ accessExpiresAt: newExpiry, updatedAt: new Date().toISOString() });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-paystack-signature'];
  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  if (!signature || signature !== expected) {
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  if (event.event !== 'charge.success') {
    res.status(200).json({ received: true });
    return;
  }

  const data = event.data || {};
  const days = Number(data.metadata?.days);
  const expectedAmount = amountForDays(days);

  if (!expectedAmount || data.amount !== expectedAmount * 100) {
    res.status(400).json({ error: 'Amount/package mismatch' });
    return;
  }

  try {
    await extendAccess({
      firebaseUserId: data.metadata?.firebase_user_id,
      email: data.customer?.email,
      days
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to extend access' });
    return;
  }

  res.status(200).json({ received: true });
};
