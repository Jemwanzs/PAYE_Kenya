const { supabaseAdmin, getAuthenticatedUser } = require('./_supabaseAdmin');

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

  // Scoping to the caller's own user_id is what stops an owner from
  // inviting (or re-inviting) an employee who belongs to a different
  // business.
  const { data: employee, error: employeeError } = await supabaseAdmin
    .from('employees')
    .select('id, email, first_name, last_name, auth_user_id')
    .eq('id', employeeId)
    .eq('user_id', owner.id)
    .single();
  if (employeeError || !employee) {
    res.status(404).json({ error: 'Employee not found.' });
    return;
  }
  if (!employee.email) {
    res.status(400).json({ error: 'This employee has no email on file to invite.' });
    return;
  }
  if (employee.auth_user_id) {
    res.status(400).json({ error: 'This employee has already been invited.' });
    return;
  }

  const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  try {
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(employee.email, {
      redirectTo: `${appUrl}/?invite=complete`
    });
    if (inviteError) {
      const alreadyRegistered = /already been registered|already exists/i.test(inviteError.message || '');
      res.status(alreadyRegistered ? 409 : 502).json({
        error: alreadyRegistered
          ? 'This email is already registered on the platform under a different account.'
          : (inviteError.message || 'Could not send the invite.')
      });
      return;
    }

    const newUserId = inviteData.user.id;
    const now = new Date().toISOString();

    const { error: employeeUpdateError } = await supabaseAdmin
      .from('employees')
      .update({ auth_user_id: newUserId, invited_at: now })
      .eq('id', employeeId);
    if (employeeUpdateError) throw employeeUpdateError;

    // trial_started_at/access_expires_at are left as whatever the signup
    // trigger set -- harmless leftovers, since an employee-role profile's
    // access is never routed through computeAccess()/those fields at all.
    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ role: 'employee', owner_user_id: owner.id, employee_id: employeeId })
      .eq('id', newUserId);
    if (profileUpdateError) throw profileUpdateError;

    res.status(200).json({ invited: true });
  } catch (err) {
    console.error('invite-employee failed', err);
    res.status(500).json({ error: err.message || 'Could not invite this employee.' });
  }
};
