const { getAuthenticatedUser } = require('./_supabaseAdmin');

const MAX_HTML_LENGTH = 2_000_000;

// Relays an already-rendered report (the exact same HTML the browser
// would have printed) to the CALLER'S OWN registered email via Resend --
// never an address the client supplies, so this can't become a way to
// exfiltrate payroll data to an arbitrary inbox. The report itself is
// still built client-side (reusing the same buildMusterRollHtml/
// buildLeaveBalancesPrintHtml/payslip-DOM functions already used for
// printing) -- this endpoint is purely a mail relay, not a report
// generator, so there's no risk of it drifting out of sync with what's
// actually shown on screen.
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

  const subject = String(req.body?.subject || 'Report').slice(0, 200);
  const html = String(req.body?.html || '');
  if (!html.trim()) {
    res.status(400).json({ error: 'No report content to send.' });
    return;
  }
  if (html.length > MAX_HTML_LENGTH) {
    res.status(400).json({ error: 'This report is too large to email.' });
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
        subject,
        html
      })
    });
    if (!resendRes.ok) {
      const body = await resendRes.text().catch(() => '');
      console.error('Resend send failed', resendRes.status, body);
      res.status(502).json({ error: 'Could not send the report email.' });
      return;
    }
  } catch (err) {
    console.error('email-report failed', err);
    res.status(502).json({ error: 'Could not send the report email.' });
    return;
  }

  res.status(200).json({ sent: true });
};
