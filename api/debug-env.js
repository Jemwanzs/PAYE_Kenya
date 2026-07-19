// TEMPORARY diagnostic endpoint — reports env var presence/shape without
// exposing secret values. Delete this file once checkout is confirmed working.
module.exports = async function handler(req, res) {
  const url = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const paystackKey = process.env.PAYSTACK_SECRET_KEY || '';

  res.status(200).json({
    supabaseUrl: url || null,
    supabaseUrlLength: url.length,
    hasServiceRoleKey: serviceKey.length > 0,
    serviceRoleKeyLength: serviceKey.length,
    serviceRoleKeyPrefix: serviceKey.slice(0, 6),
    hasPaystackKey: paystackKey.length > 0,
    paystackKeyPrefix: paystackKey.slice(0, 7),
    appUrl: process.env.APP_URL || null,
    vercelUrl: process.env.VERCEL_URL || null,
    nodeVersion: process.version
  });
};
