const { firestoreAdmin, getAuthenticatedUser } = require('./_firebaseAdmin');

// Replaces the approver_assigned_*_ids()/approver_visible_*_ids()
// SECURITY DEFINER functions from the old schema, plus the client-side
// join logic that used to live in employeePortal.js's
// buildApprovalItemsHtml() (fetching payroll_runs/leave_applications/
// employees/leave_types/payslips separately and joining in JS). An
// approver can read their OWN approvalActions rows directly (see
// firestore.rules), but not the referenced records for OTHER people
// directly -- this endpoint does that join server-side via the Admin
// SDK, same "narrow function does the whole join, bypassing RLS/rules
// throughout" reasoning the old functions had.
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
    res.status(200).json({ items: [] });
    return;
  }

  const { actionType, pendingOnly } = req.body || {};
  if (!['payroll_run', 'leave_application'].includes(actionType)) {
    res.status(400).json({ error: 'Invalid action type.' });
    return;
  }

  const ownerUid = user.ownerUserId;
  const businessRef = firestoreAdmin.collection('businesses').doc(ownerUid);

  try {
    let query = businessRef.collection('approvalActions')
      .where('actionType', '==', actionType)
      .where('employeeId', '==', user.employeeId);
    if (pendingOnly) query = query.where('decision', '==', 'pending');

    const actionsSnap = await query.orderBy('createdAt', 'asc').get();
    const actions = actionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!actions.length) {
      res.status(200).json({ items: [] });
      return;
    }

    if (actionType === 'payroll_run') {
      const runIds = [...new Set(actions.map(a => a.recordId))];
      const runSnaps = await Promise.all(runIds.map(id => businessRef.collection('payrollRuns').doc(id).get()));
      const runById = new Map(runSnaps.filter(s => s.exists).map(s => [s.id, s.data()]));

      const payslipsByRunId = new Map();
      await Promise.all(runIds.map(async runId => {
        const snap = await businessRef.collection('payslips').where('payrollRunId', '==', runId).get();
        payslipsByRunId.set(runId, snap.docs.map(d => d.data()));
      }));

      res.status(200).json({
        items: actions.map(a => ({
          action: a,
          run: runById.get(a.recordId) || null,
          payslips: payslipsByRunId.get(a.recordId) || []
        }))
      });
      return;
    }

    const appIds = [...new Set(actions.map(a => a.recordId))];
    const appSnaps = await Promise.all(appIds.map(id => businessRef.collection('leaveApplications').doc(id).get()));
    const appById = new Map(appSnaps.filter(s => s.exists).map(s => [s.id, s.data()]));

    const employeeIds = [...new Set([...appById.values()].map(a => a.employeeId))];
    const leaveTypeIds = [...new Set([...appById.values()].map(a => a.leaveTypeId))];
    const [employeeSnaps, typeSnaps] = await Promise.all([
      Promise.all(employeeIds.map(id => businessRef.collection('employees').doc(id).get())),
      Promise.all(leaveTypeIds.map(id => businessRef.collection('leaveTypes').doc(id).get()))
    ]);
    const employeeById = new Map(employeeSnaps.filter(s => s.exists).map(s => [s.id, s.data()]));
    const typeById = new Map(typeSnaps.filter(s => s.exists).map(s => [s.id, s.data()]));

    res.status(200).json({
      items: actions.map(a => {
        const app = appById.get(a.recordId) || null;
        return {
          action: a,
          application: app,
          employee: app ? employeeById.get(app.employeeId) || null : null,
          leaveType: app ? typeById.get(app.leaveTypeId) || null : null
        };
      })
    });
  } catch (err) {
    console.error('get-approval-items failed', err);
    res.status(500).json({ error: err.message || 'Could not load approvals.' });
  }
};
