const admin = require('firebase-admin');

// FIREBASE_SERVICE_ACCOUNT holds the full service-account JSON (Firebase
// console -> Project settings -> Service accounts -> Generate new
// private key), stored as a single-line JSON string in a Vercel env var
// -- same role SUPABASE_SERVICE_ROLE_KEY played before: full admin
// access, server-only, never sent to the client. admin.apps.length guard
// avoids re-initializing on every warm serverless invocation.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const firestoreAdmin = admin.firestore();
const authAdmin = admin.auth();

// Mirrors _supabaseAdmin.js's getAuthenticatedUser() -- verifies the
// caller's Firebase ID token (sent as a Bearer token, exactly like the
// Supabase access token was) and returns the decoded token, which
// carries uid/email plus any custom claims (role, ownerUserId,
// employeeId, isAdmin) set on this user -- the Firebase equivalent of
// the profiles-row lookups the old SECURITY DEFINER functions did.
async function getAuthenticatedUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    return await authAdmin.verifyIdToken(token);
  } catch {
    return null;
  }
}

module.exports = { admin, firestoreAdmin, authAdmin, getAuthenticatedUser };
