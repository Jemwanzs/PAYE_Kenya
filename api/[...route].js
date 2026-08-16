// Vercel's Hobby plan caps a deployment at 12 Serverless Functions. This
// app grew well past that once every old SECURITY DEFINER RPC became its
// own /api/*.js endpoint during the Firebase migration (see git history --
// each handler used to be its own top-level file, deployed as its own
// function). Rather than trade away the one-endpoint-per-concern
// structure, every handler's actual logic moved into api/_handlers/
// (underscore-prefixed, so Vercel doesn't deploy it as a function) and
// this single catch-all route dispatches to the right one by path --
// client code is completely unaffected, since /api/admin-list-businesses
// etc. still resolve exactly as before, just through this one function
// instead of their own. api/paystack-webhook.js stays a separate,
// top-level function since it needs its own `bodyParser: false` config
// for signature verification, which can't be set per-route within a
// shared function.
const routes = {
  'admin-list-businesses': require('./_handlers/admin-list-businesses'),
  'admin-list-employees': require('./_handlers/admin-list-employees'),
  'admin-set-business-blocked': require('./_handlers/admin-set-business-blocked'),
  'admin-set-employee-blocked': require('./_handlers/admin-set-employee-blocked'),
  'check-login-security': require('./_handlers/check-login-security'),
  'complete-signup': require('./_handlers/complete-signup'),
  'create-leave-application': require('./_handlers/create-leave-application'),
  'email-report': require('./_handlers/email-report'),
  'fetch-logo': require('./_handlers/fetch-logo'),
  'get-approval-items': require('./_handlers/get-approval-items'),
  'get-leave-data': require('./_handlers/get-leave-data'),
  'init-checkout': require('./_handlers/init-checkout'),
  'invite-employee': require('./_handlers/invite-employee'),
  'is-my-owner-blocked': require('./_handlers/is-my-owner-blocked'),
  'next-employee-number': require('./_handlers/next-employee-number'),
  'record-approval-decision': require('./_handlers/record-approval-decision'),
  'send-login-otp': require('./_handlers/send-login-otp'),
  'submit-for-approval': require('./_handlers/submit-for-approval'),
  'verify-login-otp': require('./_handlers/verify-login-otp')
};

module.exports = async function handler(req, res) {
  const segments = req.query.route;
  const key = Array.isArray(segments) ? segments.join('/') : segments;
  const route = routes[key];

  if (!route) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  return route(req, res);
};
