const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');
const crypto = require('crypto');

const RESEND_MIN_INTERVAL_MS = 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;

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
  if (!user.email) {
    res.status(400).json({ error: 'This account has no email on file.' });
    return;
  }

  const otpsRef = firestoreAdmin.collection('loginOtps');
  const recentSnap = await otpsRef.where('userId', '==', user.uid).orderBy('createdAt', 'desc').limit(1).get();
  if (!recentSnap.empty) {
    const recent = recentSnap.docs[0].data();
    if (Date.now() - new Date(recent.createdAt).getTime() < RESEND_MIN_INTERVAL_MS) {
      res.status(429).json({ error: 'Please wait a minute before requesting another code.' });
      return;
    }
  }

  // 5-digit, zero-padded so e.g. 00512 stays a valid-looking 5-digit
  // code instead of silently becoming a 3-digit one.
  const code = String(crypto.randomInt(0, 100000)).padStart(5, '0');
  const codeHash = crypto.createHash('sha256').update(`${user.uid}:${code}`).digest('hex');

  try {
    await otpsRef.add({
      userId: user.uid,
      codeHash,
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      consumedAt: null,
      attempts: 0,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('send-login-otp insert failed', err);
    res.status(500).json({ error: 'Could not generate a verification code.' });
    return;
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: user.email,
        subject: 'Your verification code',
        html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>`
      })
    });
    if (!resendRes.ok) {
      const body = await resendRes.text().catch(() => '');
      console.error('Resend send failed', resendRes.status, body);
      res.status(502).json({ error: 'Could not send the verification email.' });
      return;
    }
  } catch (err) {
    console.error('Resend request failed', err);
    res.status(502).json({ error: 'Could not send the verification email.' });
    return;
  }

  res.status(200).json({ sent: true });
};
