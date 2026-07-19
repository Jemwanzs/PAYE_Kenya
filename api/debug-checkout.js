// TEMPORARY diagnostic endpoint — exercises the same code path as
// init-checkout.js but catches everything (including require() failures)
// instead of crashing, to pinpoint exactly where it dies. Delete once
// checkout is confirmed working.
module.exports = async function handler(req, res) {
  const steps = [];
  try {
    steps.push('requiring _supabaseAdmin');
    const { getAuthenticatedUser } = require('./_supabaseAdmin');

    steps.push('requiring _dayPackages');
    const { amountForDays } = require('./_dayPackages');

    steps.push('calling getAuthenticatedUser');
    const user = await getAuthenticatedUser(req);

    steps.push('computing amount');
    const days = Number(req.body?.days) || 30;
    const amount = amountForDays(days);

    res.status(200).json({
      ok: true,
      steps,
      hasUser: !!user,
      userEmail: user?.email || null,
      amount
    });
  } catch (err) {
    res.status(200).json({
      ok: false,
      failedAfterStep: steps[steps.length - 1] || 'nothing (crashed before first step)',
      errorName: err.name,
      errorMessage: err.message,
      stack: err.stack
    });
  }
};
