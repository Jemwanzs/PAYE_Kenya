const { getAuthenticatedUser } = require('./_supabaseAdmin');
const { amountForDays } = require('./_dayPackages');

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

  const days = Number(req.body?.days);
  const amount = amountForDays(days);
  if (!amount) {
    res.status(400).json({ error: 'Invalid package selected' });
    return;
  }

  const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  try {
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        amount: amount * 100,
        currency: 'KES',
        channels: ['card', 'mobile_money'],
        callback_url: `${appUrl}/?checkout=complete`,
        metadata: { supabase_user_id: user.id, days }
      })
    });

    const payload = await paystackRes.json();
    if (!paystackRes.ok || !payload.status) {
      console.error('Paystack init failed', paystackRes.status, payload);
      res.status(502).json({ error: payload.message || 'Could not start checkout' });
      return;
    }

    res.status(200).json({ url: payload.data.authorization_url });
  } catch (err) {
    console.error('init-checkout crashed', err);
    res.status(500).json({ error: err.message || 'Could not start checkout' });
  }
};
