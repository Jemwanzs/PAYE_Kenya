const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');
const { createApprovalActions } = require('../_approvalActions');

// Owner-triggered: mirrors submit_for_approval() from the old schema.
// Leave applications don't need this -- they're already "submitted" the
// instant they're created (see api/create-leave-application.js, which
// calls createApprovalActions() itself); this is specifically the
// payroll "Submit for approval" button's action type, kept generic in
// case leave ever needs an explicit submit step too.
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

  const { actionType, recordId } = req.body || {};
  if (!['payroll_run', 'leave_application'].includes(actionType) || !recordId) {
    res.status(400).json({ error: 'Invalid request.' });
    return;
  }

  const collectionName = actionType === 'payroll_run' ? 'payrollRuns' : 'leaveApplications';
  const recordRef = firestoreAdmin.collection('businesses').doc(user.uid).collection(collectionName).doc(recordId);
  const snap = await recordRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: 'Record not found.' });
    return;
  }
  if (actionType === 'payroll_run' && snap.data().status !== 'draft') {
    res.status(400).json({ error: 'Not authorized to submit this record for approval.' });
    return;
  }

  try {
    await createApprovalActions(user.uid, actionType, recordId);
    res.status(200).json({ submitted: true });
  } catch (err) {
    console.error('submit-for-approval failed', err);
    res.status(500).json({ error: err.message || 'Could not submit for approval.' });
  }
};
