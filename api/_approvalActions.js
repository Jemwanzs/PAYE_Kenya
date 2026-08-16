const { firestoreAdmin } = require('./_firebaseAdmin');

// Mirrors _create_approval_actions() from the old schema: if an active
// workflow exists for this business+actionType, creates one
// approvalActions doc (pending) per appointed approver, plus one
// notification doc each. No-ops if no active workflow exists, or if
// approval actions already exist for this record (idempotent, same as
// the original's "if exists ... return"). Only ever called from
// api/submit-for-approval.js / api/create-leave-application.js -- never
// exposed as its own endpoint, same "internal helper, never directly
// reachable" reasoning the old _create_approval_actions() had (see
// migrate_revoke_public_execute.sql for why that mattered there).
async function createApprovalActions(ownerUid, actionType, recordId) {
  const workflowRef = firestoreAdmin.collection('businesses').doc(ownerUid).collection('approvalWorkflows').doc(actionType);
  const workflowSnap = await workflowRef.get();
  if (!workflowSnap.exists || !workflowSnap.data().isActive) return;

  const actionsRef = firestoreAdmin.collection('businesses').doc(ownerUid).collection('approvalActions');
  const existing = await actionsRef.where('actionType', '==', actionType).where('recordId', '==', recordId).limit(1).get();
  if (!existing.empty) return;

  const approversSnap = await workflowRef.collection('approvers').get();
  if (approversSnap.empty) return;

  const notificationsRef = firestoreAdmin.collection('businesses').doc(ownerUid).collection('notifications');
  const now = new Date().toISOString();
  const batch = firestoreAdmin.batch();

  approversSnap.docs.forEach(approverDoc => {
    const employeeId = approverDoc.id;
    batch.set(actionsRef.doc(), {
      actionType,
      recordId,
      employeeId,
      decision: 'pending',
      comment: null,
      decidedAt: null,
      createdAt: now
    });
    batch.set(notificationsRef.doc(), {
      recipientEmployeeId: employeeId,
      title: actionType === 'payroll_run' ? 'Payroll run awaiting your approval' : 'Leave application awaiting your approval',
      body: null,
      linkType: actionType,
      linkId: recordId,
      isRead: false,
      createdAt: now
    });
  });

  await batch.commit();
}

module.exports = { createApprovalActions };
