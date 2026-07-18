const crypto = require('crypto');
const { supabaseAdmin } = require('./_supabaseAdmin');
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

async function extendAccess({ supabaseUserId, email, days }) {
  let selectQuery = supabaseAdmin.from('profiles').select('access_expires_at');
  selectQuery = supabaseUserId ? selectQuery.eq('id', supabaseUserId) : selectQuery.eq('email', email);
  const { data: profile, error: fetchError } = await selectQuery.single();
  if (fetchError) throw fetchError;

  const now = Date.now();
  const currentExpiry = profile?.access_expires_at ? new Date(profile.access_expires_at).getTime() : 0;
  const newExpiry = new Date(Math.max(currentExpiry, now) + days * DAY_MS).toISOString();

  let updateQuery = supabaseAdmin
    .from('profiles')
    .update({ access_expires_at: newExpiry, updated_at: new Date().toISOString() });
  updateQuery = supabaseUserId ? updateQuery.eq('id', supabaseUserId) : updateQuery.eq('email', email);
  const { error } = await updateQuery;
  if (error) throw error;
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
      supabaseUserId: data.metadata?.supabase_user_id,
      email: data.customer?.email,
      days
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to extend access' });
    return;
  }

  res.status(200).json({ received: true });
};
