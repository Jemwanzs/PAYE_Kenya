const crypto = require('crypto');
const { supabaseAdmin } = require('./_supabaseAdmin');

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function statusForEvent(eventName, data) {
  if (eventName === 'charge.success' || eventName === 'subscription.create') return 'active';
  if (eventName === 'subscription.not_renew') return 'non-renewing';
  if (eventName === 'subscription.disable') return 'cancelled';
  if (eventName === 'invoice.payment_failed') return 'attention';
  return null;
}

async function upsertProfile({ supabaseUserId, email, customerCode, subscriptionCode, status }) {
  const update = { updated_at: new Date().toISOString() };
  if (customerCode) update.paystack_customer_code = customerCode;
  if (subscriptionCode) update.paystack_subscription_code = subscriptionCode;
  if (status) update.subscription_status = status;

  let query = supabaseAdmin.from('profiles').update(update);
  query = supabaseUserId ? query.eq('id', supabaseUserId) : query.eq('email', email);
  const { error } = await query;
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

  const eventName = event.event;
  const data = event.data || {};
  const status = statusForEvent(eventName, data);

  if (status) {
    try {
      await upsertProfile({
        supabaseUserId: data.metadata?.supabase_user_id || data.plan_object?.metadata?.supabase_user_id,
        email: data.customer?.email,
        customerCode: data.customer?.customer_code,
        subscriptionCode: data.subscription_code,
        status
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to sync subscription status' });
      return;
    }
  }

  res.status(200).json({ received: true });
};
