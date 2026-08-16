const { firestoreAdmin, getAuthenticatedUser } = require('../_firebaseAdmin');

// Mirrors record_approval_decision() from the old schema. A Firestore
// transaction replaces the implicit row-locking a single Postgres
// UPDATE gave -- reads (this action's doc, then its siblings) happen
// before any writes, since Firestore transactions require every read to
// complete before the first write is staged.
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
  if (user.role !== 'employee' || !user.ownerUserId || !user.employeeId) {
    res.status(401).json({ error: 'Not authorized' });
    return;
  }

  const { actionId, decision, comment } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) {
    res.status(400).json({ error: 'Invalid decision' });
    return;
  }

  const ownerUid = user.ownerUserId;
  const actionsCollection = firestoreAdmin.collection('businesses').doc(ownerUid).collection('approvalActions');
  const actionRef = actionsCollection.doc(actionId);

  try {
    await firestoreAdmin.runTransaction(async tx => {
      const actionSnap = await tx.get(actionRef);
      if (!actionSnap.exists || actionSnap.data().employeeId !== user.employeeId) {
        throw new Error('Approval action not found or not yours');
      }
      const action = actionSnap.data();
      if (action.decision !== 'pending') {
        throw new Error('This approval has already been decided');
      }

      const recordCollection = action.actionType === 'payroll_run' ? 'payrollRuns' : 'leaveApplications';
      const recordRef = firestoreAdmin.collection('businesses').doc(ownerUid).collection(recordCollection).doc(action.recordId);

      // All reads before any writes -- Firestore transactions require it.
      let allApproved = false;
      if (decision === 'approved') {
        const siblingsSnap = await tx.get(
          actionsCollection.where('actionType', '==', action.actionType).where('recordId', '==', action.recordId)
        );
        allApproved = siblingsSnap.docs.every(d => (d.id === actionId ? decision : d.data().decision) === 'approved');
      }

      const now = new Date().toISOString();
      tx.update(actionRef, { decision, comment: comment || null, decidedAt: now });

      if (decision === 'rejected') {
        if (action.actionType === 'leave_application') {
          tx.update(recordRef, { status: 'rejected', decisionComment: comment || null, decidedAt: now });
        }
        return;
      }

      if (allApproved) {
        if (action.actionType === 'leave_application') {
          tx.update(recordRef, { status: 'approved', decidedAt: now });
        } else if (action.actionType === 'payroll_run') {
          tx.update(recordRef, { status: 'approved', approvedAt: now });
        }
      }
    });

    res.status(200).json({ recorded: true });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not record your decision.' });
  }
};
