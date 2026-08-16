const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');
const { createApprovalActions } = require('./_approvalActions');

// Leave applications are "submitted" the instant they're created,
// regardless of whether the owner's or the employee portal's UI created
// them -- the old schema handled this with a single Postgres trigger
// covering both insert paths (on_leave_application_created). Firestore
// has no synchronous equivalent this app can rely on (a Cloud Functions
// Firestore trigger is async/eventually-consistent, which would leave a
// window where the UI queries for approval status before the
// approvalActions rows actually exist), so both creation paths are
// routed through this one callable endpoint instead -- it creates the
// application doc AND calls createApprovalActions() in the same
// request/response cycle, guaranteeing they exist by the time the
// caller's request completes. firestore.rules denies direct client
// writes to leaveApplications for exactly this reason.
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

  const body = req.body || {};
  const isEmployee = user.role === 'employee';
  const ownerUid = isEmployee ? user.ownerUserId : user.uid;
  if (!ownerUid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  // An employee can only ever create a pending application for
  // themselves -- mirrors employee_apply_for_own_leave exactly. The
  // owner can create on behalf of any employee in their own business.
  const employeeId = isEmployee ? user.employeeId : body.employeeId;
  if (!employeeId || !body.leaveTypeId || !body.startDate || !body.endDate || body.daysRequested == null) {
    res.status(400).json({ error: 'Leave type, dates, and employee are required.' });
    return;
  }

  const now = new Date().toISOString();
  const applicationData = {
    employeeId,
    leaveTypeId: body.leaveTypeId,
    startDate: body.startDate,
    endDate: body.endDate,
    isPartialDay: !!body.isPartialDay,
    partialHours: body.partialHours ?? null,
    partialStartTime: body.partialStartTime ?? null,
    partialEndTime: body.partialEndTime ?? null,
    daysRequested: body.daysRequested,
    reason: body.reason || null,
    documentationNote: body.documentationNote || null,
    status: 'pending',
    decisionComment: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now
  };

  try {
    const docRef = await firestoreAdmin.collection('businesses').doc(ownerUid).collection('leaveApplications').add(applicationData);
    await createApprovalActions(ownerUid, 'leave_application', docRef.id);
    res.status(200).json({ id: docRef.id });
  } catch (err) {
    console.error('create-leave-application failed', err);
    res.status(500).json({ error: err.message || 'Could not submit this application.' });
  }
};
