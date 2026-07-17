const { getAuthenticatedUser, supabaseAdmin } = require('./_supabaseAdmin');

const PAYSTACK_HEADERS = {
  Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json'
};

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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('paystack_subscription_code')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.paystack_subscription_code) {
    res.status(400).json({ error: 'No active subscription found' });
    return;
  }

  const code = profile.paystack_subscription_code;

  try {
    // Preferred path: Paystack's hosted subscription-management link.
    const linkRes = await fetch(`https://api.paystack.co/subscription/${code}/manage/link`, {
      headers: PAYSTACK_HEADERS
    });
    const linkPayload = await linkRes.json();

    if (linkRes.ok && linkPayload.status && linkPayload.data?.link) {
      res.status(200).json({ url: linkPayload.data.link });
      return;
    }

    // Fallback: disable the subscription directly (requires the subscription's email_token).
    const subRes = await fetch(`https://api.paystack.co/subscription/${code}`, {
      headers: PAYSTACK_HEADERS
    });
    const subPayload = await subRes.json();
    const emailToken = subPayload?.data?.email_token;

    if (!subRes.ok || !emailToken) {
      res.status(502).json({ error: 'Could not load subscription' });
      return;
    }

    const disableRes = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: PAYSTACK_HEADERS,
      body: JSON.stringify({ code, token: emailToken })
    });
    const disablePayload = await disableRes.json();

    if (!disableRes.ok || !disablePayload.status) {
      res.status(502).json({ error: 'Could not cancel subscription' });
      return;
    }

    res.status(200).json({ cancelled: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not manage subscription' });
  }
};
