const { firestoreAdmin, authAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');

// Firebase's Admin SDK has no built-in "invite by email" the way
// Supabase's inviteUserByEmail() was -- it only creates the Auth user
// and can generate a password-reset-style action link; it never sends
// mail itself. This creates the user with no password set, generates
// that link (which works even for a brand-new passwordless account, and
// with handleCodeInApp:true resolves directly to this app's own
// ?mode=resetPassword&oobCode=... recovery screen rather than Firebase's
// hosted page), and emails it via Resend -- the same "set your
// password" screen doubles as both the invite-acceptance flow and the
// ordinary forgot-password flow (see auth.js's recovery handling).
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const owner = await getAuthenticatedUser(req);
  if (!owner) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const employeeId = req.body?.employee_id;
  if (!employeeId) {
    res.status(400).json({ error: 'employee_id is required' });
    return;
  }

  // Reading from the caller's own business subtree is what stops an
  // owner from inviting (or re-inviting) an employee who belongs to a
  // different business -- the path itself is the scoping, no separate
  // ownership filter needed.
  const employeeRef = firestoreAdmin.collection('businesses').doc(owner.uid).collection('employees').doc(employeeId);
  const employeeSnap = await employeeRef.get();
  if (!employeeSnap.exists) {
    res.status(404).json({ error: 'Employee not found.' });
    return;
  }
  const employee = employeeSnap.data();
  if (!employee.email) {
    res.status(400).json({ error: 'This employee has no email on file to invite.' });
    return;
  }
  if (employee.authUserId) {
    res.status(400).json({ error: 'This employee has already been invited.' });
    return;
  }

  const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  try {
    let newUserId;
    try {
      const created = await authAdmin.createUser({ email: employee.email });
      newUserId = created.uid;
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        res.status(409).json({ error: 'This email is already registered on the platform under a different account.' });
        return;
      }
      throw err;
    }

    const resetLink = await authAdmin.generatePasswordResetLink(employee.email, {
      url: `${appUrl}/`,
      handleCodeInApp: true
    });

    const now = new Date().toISOString();

    await employeeRef.update({ authUserId: newUserId, invitedAt: now });

    // trialStartedAt/accessExpiresAt are irrelevant for an employee-role
    // profile -- an employee's access is never routed through
    // computeAccess() at all -- so they're left unset rather than
    // copied from anywhere.
    await firestoreAdmin.collection('profiles').doc(newUserId).set({
      email: employee.email,
      role: 'employee',
      ownerUserId: owner.uid,
      employeeId,
      isAdmin: false,
      isBlocked: false,
      createdAt: now,
      updatedAt: now
    });

    await authAdmin.setCustomUserClaims(newUserId, {
      role: 'employee',
      ownerUserId: owner.uid,
      employeeId,
      isAdmin: false
    });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: employee.email,
        subject: 'You have been invited to your employee self-service portal',
        html: `<p>${employee.firstName ? `Hi ${employee.firstName},` : 'Hello,'}</p>
<p>Your employer has invited you to view your payslips and manage your leave online.</p>
<p><a href="${resetLink}">Click here to set your password and get started</a>.</p>
<p>If you weren't expecting this, you can safely ignore this email.</p>`
      })
    });
    if (!resendRes.ok) {
      const body = await resendRes.text().catch(() => '');
      console.error('Resend invite send failed', resendRes.status, body);
      res.status(502).json({ error: 'Account created, but the invite email could not be sent. Try again shortly.' });
      return;
    }

    res.status(200).json({ invited: true });
  } catch (err) {
    console.error('invite-employee failed', err);
    res.status(500).json({ error: err.message || 'Could not invite this employee.' });
  }
};
