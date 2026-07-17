const { getAuthenticatedUser } = require('./_supabaseAdmin');

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
        plan: process.env.PAYSTACK_PLAN_CODE,
        callback_url: `${appUrl}/?checkout=complete`,
        metadata: { supabase_user_id: user.id }
      })
    });

    const payload = await paystackRes.json();
    if (!paystackRes.ok || !payload.status) {
      res.status(502).json({ error: 'Could not start checkout' });
      return;
    }

    res.status(200).json({ url: payload.data.authorization_url });
  } catch (err) {
    res.status(500).json({ error: 'Could not start checkout' });
  }
};
