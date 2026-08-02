const { supabaseAdmin, getAuthenticatedUser } = require('./_supabaseAdmin');
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

  const { data: otpRow, error: fetchError } = await supabaseAdmin
    .from('login_otps')
    .select('*')
    .eq('user_id', user.id)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError || !otpRow) {
    res.status(400).json({ error: 'No active code. Request a new one.' });
    return;
  }
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'This code has expired. Request a new one.' });
    return;
  }
  if (otpRow.attempts >= MAX_ATTEMPTS) {
    res.status(400).json({ error: 'Too many attempts. Request a new code.' });
    return;
  }

  const codeHash = crypto.createHash('sha256').update(`${user.id}:${code}`).digest('hex');
  if (codeHash !== otpRow.code_hash) {
    await supabaseAdmin.from('login_otps').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id);
    const remaining = MAX_ATTEMPTS - (otpRow.attempts + 1);
    res.status(400).json({ error: remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.` : 'Too many attempts. Request a new code.' });
    return;
  }

  await supabaseAdmin.from('login_otps').update({ consumed_at: new Date().toISOString() }).eq('id', otpRow.id);
  res.status(200).json({ verified: true });
};
