import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, sendPasswordResetEmail, confirmPasswordReset
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, collection
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { showScreenWatermark, hideScreenWatermark } from './watermark.js';

// Public by design -- same as the Supabase URL/anon key were: Firestore
// Security Rules (firestore.rules) and Storage rules (storage.rules) are
// what actually restrict access, not secrecy of a client config object.
// Fill these in from Firebase console -> Project settings -> General ->
// Your apps -> SDK setup and configuration.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBT2JqlR2fzsSuCsi3jqrmUgkJHataOo6Y",
  authDomain: "softhr-23bea.firebaseapp.com",
  projectId: "softhr-23bea",
  storageBucket: "softhr-23bea.firebasestorage.app",
  messagingSenderId: "970112321647",
  appId: "1:970112321647:web:4bf2eaa28a8b9d5030659a",
  measurementId: "G-YVZSN1J3T9"
};

if (Object.values(FIREBASE_CONFIG).some(v => v.startsWith('YOUR_'))) {
  const authScreen = document.getElementById('authScreen');
  authScreen.hidden = false;
  authScreen.querySelector('h1').textContent = 'Setup required';
  authScreen.querySelector('.hero-copy').textContent =
    'Add your Firebase project config to auth.js (see README) before this app can be used.';
  authScreen.querySelector('.auth-form').hidden = true;
  throw new Error('auth.js: FIREBASE_CONFIG not configured');
}

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Shared with every other client file so they reuse this exact
// app/auth/db instance instead of each initializing their own.
export { auth, db, callFunction, TRIAL_DAYS, EXTENDED_TRIAL_EMAILS, getGeolocation };

const TRIAL_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

// Developer/support account(s) get a longer trial so day-to-day QA and
// support work isn't gated behind buying day-passes. Keyed by email
// (not isAdmin) so it's a time-boxed trial extension, not permanent
// unlimited access -- once the listed number of days has elapsed since
// trialStartedAt, it behaves like anyone else's expired trial and needs
// a day-pass same as normal.
const EXTENDED_TRIAL_EMAILS = { 'jamosammy@gmail.com': 60 };

// Platform operator account(s) -- granted the isAdmin custom claim (and
// mirrored Firestore field) automatically on next login via
// api/_handlers/bootstrap-admin.js, which independently checks this same
// list server-side (keep both in sync). Lets the person who owns this
// deployment monitor every tenant and their employees (adminBusinesses.js,
// adminSessionLogs.js) without a manual Firestore Console edit -- there's
// no admin UI for setting custom claims, so this is the bootstrap path.
const SUPER_ADMIN_EMAILS = ['jamosammy@gmail.com'];

// Keep in sync with the authoritative price list in api/_dayPackages.js.
const DAY_PACKAGES = [
  { days: 1, amount: 200 },
  { days: 2, amount: 400 },
  { days: 3, amount: 500 },
  { days: 4, amount: 600 },
  { days: 5, amount: 700 },
  { days: 15, amount: 1500 },
  { days: 30, amount: 2800 },
  { days: 90, amount: 8000 },
  { days: 180, amount: 15000 },
  { days: 365, amount: 28000 }
];

function packageLabel(days) {
  if (days === 180) return '6 months';
  if (days === 365) return '12 months';
  return `${days} day${days === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------
// Client-side (History API) routing -- pure URL-bar/deep-linking layer
// on top of the existing screen-switching logic below, which stays the
// single source of truth for what's actually rendered. This never
// fetches a new page; it only keeps location.pathname in sync with
// whichever screen is already being shown, and reads it back on load
// and on browser back/forward to decide where to start. vercel.json has
// a matching catch-all rewrite so a fresh visit/refresh to e.g.
// /payroll still loads this same index.html instead of 404ing.
// ---------------------------------------------------------------------
const APP_PAGE_PATHS = {
  calculator: '/calculator',
  employees: '/employees',
  payroll: '/payroll',
  leave: '/leave',
  settings: '/settings',
  businesses: '/businesses',
  sessionLogs: '/session-logs'
};
const PATH_TO_APP_PAGE = Object.fromEntries(Object.entries(APP_PAGE_PATHS).map(([page, path]) => [path, page]));
// The bare domain root has no canonical page of its own -- it resolves
// to the calculator for reading purposes, but navigating within the app
// always writes the explicit /calculator path (see APP_PAGE_PATHS), so
// the URL bar never silently reverts back to "/".
PATH_TO_APP_PAGE['/'] = 'calculator';

function navigateTo(path) {
  // Guards against a falsy/undefined path -- appNavButtons (below) is
  // queried unscoped and also picks up the employee portal's own nav
  // buttons (data-portal-page, not data-page), so activeAppPage can
  // legitimately end up undefined from a portal click; this must never
  // reach history.pushState with anything but a real path string.
  if (!path || location.pathname === path) return;
  history.pushState(null, '', path);
}

function authModeFromCurrentPath() {
  if (location.pathname === '/login') return 'login';
  if (location.pathname === '/signup') return 'signup';
  return null;
}

const screens = {
  auth: document.getElementById('authScreen'),
  recovery: document.getElementById('recoveryScreen'),
  otp: document.getElementById('otpScreen'),
  loginBlocked: document.getElementById('loginBlockedScreen'),
  finalizing: document.getElementById('finalizingScreen'),
  calculator: document.getElementById('calculatorGate'),
  employees: document.getElementById('employeesPage'),
  payroll: document.getElementById('payrollPage'),
  leave: document.getElementById('leavePage'),
  settings: document.getElementById('settingsPage'),
  businesses: document.getElementById('businessesPage'),
  sessionLogs: document.getElementById('sessionLogsPage')
};
const businessesNavBtn = document.getElementById('businessesNavBtn');
const sessionLogsNavBtn = document.getElementById('sessionLogsNavBtn');
const accessBanner = document.getElementById('accessBanner');
const appNav = document.getElementById('appNav');
const appNavButtons = [...document.querySelectorAll('.app-nav-btn')];
let activeAppPage = PATH_TO_APP_PAGE[location.pathname] || 'calculator';

const ownerAppShell = document.getElementById('ownerAppShell');
const employeePortalShell = document.getElementById('employeePortalShell');
const employeePortalGreeting = document.getElementById('employeePortalGreeting');
const employeePortalLogoutBtn = document.getElementById('employeePortalLogoutBtn');
const employeePortalRevoked = document.getElementById('employeePortalRevoked');
const employeePortalBody = document.getElementById('employeePortalBody');
const employeePortalNavButtons = [...document.querySelectorAll('#employeePortalNav .app-nav-btn')];
const employeePortalScreens = {
  payslips: document.getElementById('employeePortalPayslipsView'),
  details: document.getElementById('employeePortalDetailsView'),
  leave: document.getElementById('employeePortalLeaveView'),
  'leave-approvals': document.getElementById('employeePortalLeaveApprovalsView'),
  approvals: document.getElementById('employeePortalApprovalsView')
};
let activeEmployeePortalPage = 'payslips';
const buyMoreBtn = document.getElementById('buyMoreBtn');
const logoutBtn = document.getElementById('logoutBtn');
const resetBtn = document.getElementById('resetBtn');
const printBtn = document.getElementById('printBtn');
const authForm = document.getElementById('authForm');
const authToggleBtn = document.getElementById('authToggleBtn');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const authInfo = document.getElementById('authInfo');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const recoveryForm = document.getElementById('recoveryForm');
const recoveryError = document.getElementById('recoveryError');
const otpForm = document.getElementById('otpForm');
const otpCodeInput = document.getElementById('otpCodeInput');
const otpEmailDisplay = document.getElementById('otpEmailDisplay');
const otpError = document.getElementById('otpError');
const otpInfo = document.getElementById('otpInfo');
const otpVerifyBtn = document.getElementById('otpVerifyBtn');
const otpResendBtn = document.getElementById('otpResendBtn');
const otpBackBtn = document.getElementById('otpBackBtn');
const loginBlockedReasonEl = document.getElementById('loginBlockedReason');
const loginBlockedRetryBtn = document.getElementById('loginBlockedRetryBtn');
const loginBlockedLogoutBtn = document.getElementById('loginBlockedLogoutBtn');
const calculatorGate = document.getElementById('calculatorGate');
const purchaseOverlay = document.getElementById('purchaseOverlay');
const purchaseCloseBtn = document.getElementById('purchaseCloseBtn');
const purchaseTitle = document.getElementById('purchaseTitle');
const purchaseSubtitle = document.getElementById('purchaseSubtitle');
const purchaseError = document.getElementById('purchaseError');
const purchaseLogoutBtn = document.getElementById('purchaseLogoutBtn');
const packageGrid = document.getElementById('packageGrid');
const purchaseEyebrow = document.getElementById('purchaseEyebrow');
const purchaseWhyBuy = document.getElementById('purchaseWhyBuy');
const adminPreviewDropdown = document.getElementById('adminPreviewDropdown');
const adminPreviewBtn = document.getElementById('adminPreviewBtn');
const adminPreviewMenu = document.getElementById('adminPreviewMenu');

// Firebase's password-reset flow is fundamentally different from
// Supabase's: sendPasswordResetEmail() sends a link back to THIS app
// (via the `url` option below) carrying ?mode=resetPassword&oobCode=...
// in the query string -- never a signed-in session the way Supabase's
// recovery link was. confirmPasswordReset(auth, oobCode, newPassword)
// sets the password directly, with no sign-in step at all, which also
// means it works identically for a brand-new admin-created employee
// account with no password yet (see api/invite-employee.js) -- one
// unified flow now covers both "forgot password" and "accept invite",
// where Supabase needed to distinguish type=recovery from type=invite.
const recoveryParams = new URLSearchParams(location.search);
let inRecovery = recoveryParams.get('mode') === 'resetPassword' && !!recoveryParams.get('oobCode');
const recoveryOobCode = recoveryParams.get('oobCode');
if (inRecovery) {
  showScreen('recovery');
  history.replaceState(null, '', location.pathname);
}

// ---------------------------------------------------------------------
// Idle auto-logout -- signs out any signed-in session (owner or
// employee) after 10 minutes with no mouse/keyboard/touch activity, so
// an unattended, still-logged-in device doesn't leave payroll/personal
// data open indefinitely. hasActiveSession is kept in sync from
// renderForSession() (the single place that already knows whether a
// session exists), not re-derived here, so this never has to guess.
// ---------------------------------------------------------------------
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
let idleTimer = null;
let hasActiveSession = false;
let profileRecoveryAttempted = false;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!hasActiveSession) return;
  idleTimer = setTimeout(async () => {
    hasActiveSession = false;
    await signOut(auth);
    authInfo.textContent = 'You were signed out after 10 minutes of inactivity.';
    authInfo.hidden = false;
    renderForSession();
  }, IDLE_TIMEOUT_MS);
}

['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, resetIdleTimer, { passive: true });
});

// ---------------------------------------------------------------------
// Cross-tenant login log, readable only by the platform admin (see
// firestore.rules). Best-effort and fire-and-forget: a logging failure,
// a slow/declined geolocation prompt, or an offline browser must never
// block or delay someone's actual login. Geolocation is requested
// (never something a browser lets a site force) -- a denial or an
// unsupported browser is just logged as such and login proceeds exactly
// the same either way.
// ---------------------------------------------------------------------
let sessionLoggedThisPageLoad = false;

function getGeolocation() {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) {
      resolve({ status: 'unavailable', latitude: null, longitude: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ status: 'granted', latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve({ status: 'denied', latitude: null, longitude: null }),
      { timeout: 8000 }
    );
  });
}

// Role/ownerUserId/employeeId all come straight off the ID token's
// custom claims (set at signup/invite time by api/complete-signup.js /
// api/invite-employee.js) -- no server round-trip needed to resolve
// "who is this," unlike the old session_log_identity() RPC, which
// existed only because an employee session had no RLS access to their
// owner's profiles/payroll_settings row. Firestore Security Rules grant
// an employee direct read access to their own business's settings doc
// (see firestore.rules), so business_name is just a normal read here.
async function logSessionOnce(profile, claims, cachedGeo) {
  if (sessionLoggedThisPageLoad) return;
  sessionLoggedThisPageLoad = true;
  try {
    const role = claims.role || 'owner';
    const ownerUserId = claims.ownerUserId || profile.id;
    const [settingsSnap, employeeSnap, geo] = await Promise.all([
      getDoc(doc(db, 'businesses', ownerUserId, 'settings', 'main')),
      role === 'employee' && claims.employeeId
        ? getDoc(doc(db, 'businesses', ownerUserId, 'employees', claims.employeeId))
        : Promise.resolve(null),
      cachedGeo ? Promise.resolve(cachedGeo) : getGeolocation()
    ]);
    const businessName = settingsSnap.exists() ? (settingsSnap.data().businessName || null) : null;
    const employeeData = employeeSnap && employeeSnap.exists() ? employeeSnap.data() : null;
    const employeeName = employeeData ? `${employeeData.firstName} ${employeeData.lastName}` : null;

    await addDoc(collection(db, 'sessionLogs'), {
      userId: profile.id,
      email: profile.email || null,
      role,
      businessName,
      employeeName,
      userAgent: navigator.userAgent,
      locationStatus: geo.status,
      latitude: geo.latitude,
      longitude: geo.longitude,
      createdAt: new Date().toISOString()
    });
  } catch {
    // Best-effort only.
  }
}

// ---------------------------------------------------------------------
// Employee-only login time-window/geofence enforcement (see
// api/check-login-security.js). Runs before the OTP code is even sent
// -- no point emailing a code to someone who's about to be blocked
// anyway. Never blocks the business owner's own login (enforced
// server-side -- see that endpoint for why: self-lockout risk, since
// only the owner can reach Settings to turn this off). Checked once per
// (user id, tab session), same lifecycle as the OTP challenge below,
// not on every renderForSession() re-render. Kept as a server call
// (not a direct Firestore read) specifically for the time-window check,
// which has to run against a clock the client can't spoof by changing
// its system time.
// ---------------------------------------------------------------------
let securityCheckedUserId = null;
let loginBlockedReason = null;
let cachedLoginGeo = null;

// Returns true if login should stop here (blocked screen now showing).
async function runLoginSecurityGate(user) {
  if (securityCheckedUserId !== user.uid) {
    securityCheckedUserId = user.uid;
    loginBlockedReason = null;
    cachedLoginGeo = await getGeolocation();
    try {
      const result = await callFunction('/api/check-login-security', {
        latitude: cachedLoginGeo.latitude,
        longitude: cachedLoginGeo.longitude,
        locationStatus: cachedLoginGeo.status
      });
      if (!result.allowed) loginBlockedReason = result.reason || 'Login is not allowed right now.';
    } catch {
      // Fails open -- a server error here must never lock everyone out.
      loginBlockedReason = null;
    }
  }

  if (loginBlockedReason) {
    ownerAppShell.hidden = false;
    employeePortalShell.hidden = true;
    loginBlockedReasonEl.textContent = loginBlockedReason;
    showScreen('loginBlocked');
    return true;
  }
  return false;
}

loginBlockedRetryBtn.addEventListener('click', () => {
  securityCheckedUserId = null;
  renderForSession();
});

loginBlockedLogoutBtn.addEventListener('click', async () => {
  securityCheckedUserId = null;
  otpChallengeUserId = null;
  clearOtpVerified();
  await signOut(auth);
  renderForSession();
});

// ---------------------------------------------------------------------
// 5-digit email verification code, required after every password
// sign-in/sign-up (see api/send-login-otp.js / api/verify-login-otp.js).
// Tracked per browser tab via sessionStorage keyed by user id, not
// anything in the persisted Firebase session -- closing the tab before
// verifying and reopening starts the challenge over (sessionStorage
// doesn't survive that), but an ordinary same-tab refresh after
// verifying doesn't re-prompt. A token refresh re-fires the same
// onAuthStateChanged path as a real sign-in, but never re-triggers
// this, since it's keyed on user id, which a refresh doesn't change.
// ---------------------------------------------------------------------
function isOtpVerifiedForSession(userId) {
  return sessionStorage.getItem('otpVerifiedUserId') === userId;
}
function markOtpVerified(userId) {
  sessionStorage.setItem('otpVerifiedUserId', userId);
}
function clearOtpVerified() {
  sessionStorage.removeItem('otpVerifiedUserId');
}

let otpChallengeUserId = null;

async function sendOtpCode() {
  otpError.hidden = true;
  otpInfo.hidden = true;
  otpVerifyBtn.disabled = true;
  otpResendBtn.disabled = true;
  try {
    await callFunction('/api/send-login-otp');
    otpInfo.textContent = 'Code sent — check your email.';
    otpInfo.hidden = false;
  } catch (err) {
    otpError.textContent = err.message || 'Could not send the verification code.';
    otpError.hidden = false;
  } finally {
    otpVerifyBtn.disabled = false;
    otpResendBtn.disabled = false;
  }
}

// Only actually sends a fresh code the first time this user id is
// challenged -- renderForSession() can re-run for the same still-
// unverified session (e.g. a token refresh), and that must not spam a
// new email/reset the 60s resend cooldown each time.
async function startOtpChallenge(user) {
  // otpScreen is a sibling of authScreen/recoveryScreen inside
  // ownerAppShell (role isn't known yet at this point in the flow, so
  // there's no "employee portal" version of this screen) -- the shell
  // itself must stay visible; showScreen('otp') hides the actual app
  // content sections (calculator, employees, ...) within it.
  ownerAppShell.hidden = false;
  employeePortalShell.hidden = true;
  otpEmailDisplay.textContent = user.email || 'your email';
  showScreen('otp');
  if (otpChallengeUserId === user.uid) return;
  otpChallengeUserId = user.uid;
  otpCodeInput.value = '';
  await sendOtpCode();
}

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
}

function showEmployeePortalScreen(name) {
  Object.entries(employeePortalScreens).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
}

function computeAccess(profile) {
  // Checked ahead of isAdmin -- a blocked account stays blocked even if
  // it also happens to carry the admin flag (defense in depth; the
  // admin-set-business-blocked endpoint itself already refuses to let
  // an admin block their own account, but this keeps the client-side
  // logic correct regardless of how isBlocked ends up true).
  if (profile.isBlocked) {
    return { hasAccess: false, isAdmin: false, isBlocked: true, inTrial: false, hasPaidAccess: false, trialDaysLeft: 0, paidDaysLeft: 0 };
  }
  if (profile.isAdmin) {
    return { hasAccess: true, isAdmin: true, isBlocked: false, inTrial: false, hasPaidAccess: false, trialDaysLeft: 0, paidDaysLeft: 0 };
  }

  const trialDays = EXTENDED_TRIAL_EMAILS[profile.email] ?? TRIAL_DAYS;
  const now = Date.now();
  const trialEndsAt = new Date(profile.trialStartedAt).getTime() + trialDays * DAY_MS;
  const paidUntil = profile.accessExpiresAt ? new Date(profile.accessExpiresAt).getTime() : 0;
  const inTrial = now < trialEndsAt;
  const hasPaidAccess = now < paidUntil;
  const trialDaysLeft = Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS));
  const paidDaysLeft = Math.max(0, Math.ceil((paidUntil - now) / DAY_MS));
  return { hasAccess: inTrial || hasPaidAccess, isAdmin: false, isBlocked: false, inTrial, hasPaidAccess, trialDaysLeft, paidDaysLeft };
}

// profiles/{uid} mirrors the old `profiles` table 1:1 (camelCase
// fields). Created by api/complete-signup.js right after signup, or by
// api/invite-employee.js for an employee -- if neither has run yet
// (e.g. a network drop between signUp() succeeding and the follow-up
// call), this legitimately won't exist yet; callers handle a null
// return rather than assuming it's always there.
async function fetchProfile() {
  const user = auth.currentUser;
  const snap = await getDoc(doc(db, 'profiles', user.uid));
  if (!snap.exists()) return null;
  return { id: user.uid, ...snap.data() };
}

// Mirrors the old callFunction() exactly, just swapping the Supabase
// access token for a Firebase ID token. getIdToken() transparently
// returns the cached token or refreshes it if it's close to expiring --
// no manual refresh bookkeeping needed here.
async function callFunction(path, body) {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

async function pollForAccess(attempts = 5, delayMs = 1500) {
  for (let i = 0; i < attempts; i += 1) {
    const profile = await fetchProfile();
    if (profile) {
      const access = computeAccess(profile);
      if (access.hasAccess) return { profile, access };
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

function setPurchaseOverlay(show, { forced = false, blocked = false } = {}) {
  purchaseOverlay.hidden = !show;
  purchaseCloseBtn.hidden = forced || blocked;
  // A blocked account isn't a "buy more time" situation -- paying
  // wouldn't fix it -- so this reuses the same modal chrome but hides
  // everything about purchasing and swaps in a plain "contact support"
  // message instead.
  packageGrid.hidden = blocked;
  purchaseWhyBuy.hidden = blocked;
  purchaseEyebrow.hidden = blocked;
  purchaseLogoutBtn.textContent = blocked ? 'Log out' : 'Not ready to pay? Log out';
  if (show) {
    purchaseError.hidden = true;
    if (blocked) {
      purchaseTitle.textContent = 'Account suspended';
      purchaseSubtitle.textContent = 'This account has been suspended by the platform admin. Contact support if you believe this is a mistake.';
    } else {
      purchaseTitle.textContent = forced ? 'Your access has ended' : 'Buy more time';
      purchaseSubtitle.textContent = forced
        ? 'Buy a day-pass to keep using the calculator — billed in KES via Paystack (card or M-Pesa).'
        : 'Top up before your current access runs out — billed in KES via Paystack (card or M-Pesa).';
    }
  }
}

function renderAccess(access) {
  resetBtn.hidden = !access.hasAccess;
  printBtn.hidden = !access.hasAccess;
  buyMoreBtn.hidden = access.isAdmin || access.isBlocked;
  adminPreviewDropdown.hidden = !access.isAdmin;
  businessesNavBtn.hidden = !access.isAdmin;
  sessionLogsNavBtn.hidden = !access.isAdmin;
  appNav.hidden = !access.hasAccess;

  if (access.isBlocked) {
    accessBanner.hidden = false;
    accessBanner.textContent = 'Account suspended';
  } else if (access.isAdmin) {
    accessBanner.hidden = false;
    accessBanner.textContent = 'Admin access';
  } else if (access.inTrial) {
    accessBanner.hidden = false;
    accessBanner.textContent = `Trial: ${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? '' : 's'} left`;
  } else if (access.hasPaidAccess) {
    accessBanner.hidden = false;
    accessBanner.textContent = `Access active: ${access.paidDaysLeft} day${access.paidDaysLeft === 1 ? '' : 's'} left`;
  } else {
    accessBanner.hidden = true;
  }

  showScreen(activeAppPage);
  appNavButtons.forEach(b => { if (b.dataset.page) b.setAttribute('aria-selected', String(b.dataset.page === activeAppPage)); });
  navigateTo(APP_PAGE_PATHS[activeAppPage]);
  // Every page module's first data load is triggered by this same event,
  // but it's otherwise only ever dispatched from a nav-button click or
  // popstate (below) -- neither fires on the very first render of a
  // session, so landing directly on a deep-linked page (a bookmark, a
  // refresh, or just re-opening the tab on /employees) showed an empty
  // shell that never actually loaded, even with real data in Firestore.
  // Each listener already guards its own re-fetch (e.g. employees.js's
  // `if (!employeesLoaded)`), so firing this on every render here is
  // harmless -- it's a no-op past the first successful load.
  if (access.hasAccess) document.dispatchEvent(new CustomEvent('app:page', { detail: { page: activeAppPage } }));
  calculatorGate.classList.toggle('blurred', !access.hasAccess);
  screens.employees.classList.toggle('blurred', !access.hasAccess);
  screens.payroll.classList.toggle('blurred', !access.hasAccess);
  screens.leave.classList.toggle('blurred', !access.hasAccess);
  screens.settings.classList.toggle('blurred', !access.hasAccess);
  screens.businesses.classList.toggle('blurred', !access.hasAccess);
  screens.sessionLogs.classList.toggle('blurred', !access.hasAccess);
  setPurchaseOverlay(!access.hasAccess, { forced: !access.hasAccess, blocked: !!access.isBlocked });
}

// An employee-role profile never touches computeAccess()/the owner's
// trial-or-paid gate at all -- viewing your own payslip and applying
// for leave is basic HR self-service, not the paid product, so it stays
// available even if the business owner's own subscription has lapsed.
// The employee's own doc is read by DIRECT path (businesses/{owner}/
// employees/{employeeId}), both ids straight off the ID token's custom
// claims -- no query needed the way Supabase needed
// .eq('auth_user_id', profile.id), since Firestore doesn't have a
// server-side foreign-key lookup and the claims already encode exactly
// which document is "mine."
async function renderEmployeePortal(profile, claims) {
  ownerAppShell.hidden = true;
  employeePortalShell.hidden = false;
  employeePortalRevoked.hidden = true;
  employeePortalBody.hidden = true;
  setPurchaseOverlay(false);

  if (!claims.ownerUserId || !claims.employeeId) {
    employeePortalRevoked.hidden = false;
    return;
  }

  const employeeSnap = await getDoc(doc(db, 'businesses', claims.ownerUserId, 'employees', claims.employeeId));
  if (!employeeSnap.exists() || employeeSnap.data().status === 'terminated') {
    employeePortalRevoked.hidden = false;
    return;
  }
  const employee = { id: employeeSnap.id, ...employeeSnap.data() };

  // Two independent block switches, both platform-admin-only: this
  // specific employee's own portal access, or their entire business
  // having been blocked (which an employee session has no read access
  // to directly -- their own profiles doc isn't the owner's -- hence
  // the server call). Either one shows the exact same "revoked"
  // message -- the employee doesn't need to know which case it is,
  // only their employer.
  if (employee.portalBlocked) {
    employeePortalRevoked.hidden = false;
    return;
  }
  try {
    const { blocked } = await callFunction('/api/is-my-owner-blocked');
    if (blocked) {
      employeePortalRevoked.hidden = false;
      return;
    }
  } catch {
    // Best-effort -- a transient failure here shouldn't lock a
    // legitimate employee out of their own portal.
  }

  employeePortalGreeting.textContent = `Welcome, ${employee.firstName}`;
  employeePortalBody.hidden = false;
  showEmployeePortalScreen(activeEmployeePortalPage);
  document.dispatchEvent(new CustomEvent('employee-portal:ready', { detail: { employee, profile, claims } }));
}

async function renderForSession() {
  const user = auth.currentUser;
  if (inRecovery) return;

  if (!user) {
    hasActiveSession = false;
    resetIdleTimer();
    otpChallengeUserId = null;
    securityCheckedUserId = null;
    profileRecoveryAttempted = false;
    clearOtpVerified();
    hideScreenWatermark();
    ownerAppShell.hidden = false;
    employeePortalShell.hidden = true;
    logoutBtn.hidden = true;
    resetBtn.hidden = true;
    printBtn.hidden = true;
    buyMoreBtn.hidden = true;
    adminPreviewDropdown.hidden = true;
    businessesNavBtn.hidden = true;
    sessionLogsNavBtn.hidden = true;
    appNav.hidden = true;
    accessBanner.hidden = true;
    setPurchaseOverlay(false);
    const authMode = authModeFromCurrentPath();
    if (authMode) setAuthMode(authMode);
    showScreen('auth');
    return;
  }

  hasActiveSession = true;
  resetIdleTimer();

  // Gate ahead of everything else -- an unverified session sees only
  // the code-entry screen, never the app shell, regardless of role.
  // Tracked in sessionStorage rather than anything server-side, so this
  // is a UX/velocity control layered on top of the real password auth,
  // not a hard security boundary in its own right (consistent with
  // this app's other client-side gates -- report passcode, idle
  // logout).
  if (!isOtpVerifiedForSession(user.uid)) {
    if (await runLoginSecurityGate(user)) return;
    await startOtpChallenge(user);
    return;
  }

  const profile = await fetchProfile();
  if (!profile) {
    // Signup succeeded on the Auth side but the follow-up profile-
    // creation call never completed (e.g. a dropped network request, or
    // the API routing issue this account first hit) -- an owner-signup
    // orphan is recoverable by just calling complete-signup again (it's
    // idempotent), but ONLY safe to auto-retry when this token has never
    // had ANY role claim set at all: an invited employee's profile and
    // claims are written together, atomically, by invite-employee.js's
    // single Admin SDK request -- if that ever ran, both exist together,
    // so a null profile with no role claim can only be an abandoned
    // owner signup, never a partially-invited employee (which would
    // wrongly get claimed as an owner here otherwise). Guarded to fire
    // at most once per browser session so a genuinely broken account
    // still lands on the error message below instead of looping.
    const tokenResult = await user.getIdTokenResult();
    if (!tokenResult.claims.role && !profileRecoveryAttempted) {
      profileRecoveryAttempted = true;
      try {
        await callFunction('/api/complete-signup');
        await user.getIdToken(true);
        renderForSession();
        return;
      } catch {
        // Falls through to the error message below.
      }
    }

    authError.textContent = 'Your account exists but setup didn\'t finish. Please try logging in again.';
    authError.hidden = false;
    await signOut(auth);
    renderForSession();
    return;
  }

  // One-time bootstrap: a listed operator email that hasn't been granted
  // isAdmin yet gets it now, then re-runs this function so everything
  // below sees the fresh profile/claims -- never fires again once
  // isAdmin is true. Best-effort: a failure here just leaves them as a
  // normal owner for this render, not stuck.
  if (!profile.isAdmin && SUPER_ADMIN_EMAILS.includes(profile.email)) {
    try {
      await callFunction('/api/bootstrap-admin');
      await user.getIdToken(true);
      renderForSession();
      return;
    } catch {
      // Falls through to normal rendering below.
    }
  }

  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult.claims;

  logSessionOnce(profile, claims, cachedLoginGeo);
  showScreenWatermark(profile.email);

  if (claims.role === 'employee') {
    employeePortalLogoutBtn.hidden = false;
    await renderEmployeePortal(profile, claims);
    return;
  }

  ownerAppShell.hidden = false;
  employeePortalShell.hidden = true;
  logoutBtn.hidden = false;

  // A non-admin who directly types/bookmarks /session-logs or
  // /businesses shouldn't land on that screen just because the URL
  // resolved to it -- same page it'd fall back to if the nav button
  // (already hidden for them) didn't exist at all.
  if ((activeAppPage === 'sessionLogs' || activeAppPage === 'businesses') && !profile.isAdmin) activeAppPage = 'calculator';

  const checkoutComplete = new URLSearchParams(location.search).get('checkout') === 'complete';
  if (checkoutComplete) {
    showScreen('finalizing');
    history.replaceState(null, '', location.pathname);
    const result = await pollForAccess();
    if (result) {
      renderAccess(result.access);
      return;
    }
  }

  renderAccess(computeAccess(profile));
}

packageGrid.innerHTML = DAY_PACKAGES.map(pack => `
  <button type="button" class="package-btn" data-days="${pack.days}">
    <span class="package-days">${packageLabel(pack.days)}</span>
    <span class="package-amount">KES ${pack.amount.toLocaleString('en-KE')}</span>
    <span class="package-rate">≈ KES ${Math.round(pack.amount / pack.days).toLocaleString('en-KE')}/day</span>
  </button>
`).join('');

packageGrid.addEventListener('click', async event => {
  const btn = event.target.closest('.package-btn');
  if (!btn) return;

  const days = Number(btn.dataset.days);
  purchaseError.hidden = true;
  const allButtons = [...packageGrid.querySelectorAll('button')];
  allButtons.forEach(b => { b.disabled = true; });

  try {
    const { url } = await callFunction('/api/init-checkout', { days });
    location.href = url;
  } catch (err) {
    purchaseError.textContent = err.message || 'Could not start checkout. Please try again.';
    purchaseError.hidden = false;
    allButtons.forEach(b => { b.disabled = false; });
  }
});

buyMoreBtn.addEventListener('click', () => setPurchaseOverlay(true, { forced: false }));
purchaseCloseBtn.addEventListener('click', () => setPurchaseOverlay(false));

function closeAdminPreviewMenu() {
  adminPreviewMenu.hidden = true;
  adminPreviewBtn.setAttribute('aria-expanded', 'false');
}

adminPreviewBtn.addEventListener('click', () => {
  const opening = adminPreviewMenu.hidden;
  adminPreviewMenu.hidden = !opening;
  adminPreviewBtn.setAttribute('aria-expanded', String(opening));
});

adminPreviewMenu.addEventListener('click', event => {
  const btn = event.target.closest('button[data-preview]');
  if (!btn) return;
  closeAdminPreviewMenu();

  const target = btn.dataset.preview;
  if (target === 'exit') {
    renderForSession();
    return;
  }
  if (target === 'purchase') {
    setPurchaseOverlay(true, { forced: false });
    return;
  }
  showScreen(target);
});

document.addEventListener('click', event => {
  if (!adminPreviewDropdown.hidden && !adminPreviewDropdown.contains(event.target)) closeAdminPreviewMenu();
});

appNavButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (!btn.dataset.page) return;
    activeAppPage = btn.dataset.page;
    appNavButtons.forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    showScreen(activeAppPage);
    document.dispatchEvent(new CustomEvent('app:page', { detail: { page: activeAppPage } }));
    navigateTo(APP_PAGE_PATHS[activeAppPage]);
  });
});

employeePortalNavButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    activeEmployeePortalPage = btn.dataset.portalPage;
    employeePortalNavButtons.forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    showEmployeePortalScreen(activeEmployeePortalPage);
    document.dispatchEvent(new CustomEvent('employee-portal:page', { detail: { page: activeEmployeePortalPage } }));
  });
});

document.querySelectorAll('.password-toggle').forEach(btn => {
  const input = document.getElementById(btn.dataset.toggleFor);
  btn.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    btn.classList.toggle('is-visible', !showing);
  });
});

forgotPasswordBtn.addEventListener('click', async () => {
  authError.hidden = true;
  authInfo.hidden = true;

  const email = document.getElementById('authEmail').value.trim();
  if (!email) {
    authError.textContent = 'Enter your email above first, then click "Forgot password?".';
    authError.hidden = false;
    return;
  }

  forgotPasswordBtn.disabled = true;
  try {
    await sendPasswordResetEmail(auth, email, { url: `${location.origin}${location.pathname}`, handleCodeInApp: true });
    authInfo.textContent = 'Check your email for a password reset link.';
    authInfo.hidden = false;
  } catch (err) {
    authError.textContent = err.message || 'Could not send the reset email.';
    authError.hidden = false;
  } finally {
    forgotPasswordBtn.disabled = false;
  }
});

recoveryForm.addEventListener('submit', async event => {
  event.preventDefault();
  recoveryError.hidden = true;

  const password = document.getElementById('recoveryPassword').value;
  const passwordConfirm = document.getElementById('recoveryPasswordConfirm').value;

  if (password !== passwordConfirm) {
    recoveryError.textContent = 'Passwords do not match.';
    recoveryError.hidden = false;
    return;
  }

  try {
    await confirmPasswordReset(auth, recoveryOobCode, password);
  } catch (err) {
    recoveryError.textContent = err.message || 'Could not update your password. The link may have expired -- request a new one.';
    recoveryError.hidden = false;
    return;
  }

  // confirmPasswordReset() never signs the user in (unlike Supabase's
  // recovery flow, which lands you in an active session) -- send them
  // to the ordinary login form with their new password.
  inRecovery = false;
  recoveryForm.reset();
  authInfo.textContent = 'Password updated. Log in with your new password.';
  authInfo.hidden = false;
  setAuthMode('login');
  navigateTo('/login');
  renderForSession();
});

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  authError.hidden = true;
  authInfo.hidden = true;

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const isSignup = authSubmitBtn.dataset.mode === 'signup';

  try {
    if (isSignup) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Creates the profiles doc + sets the initial custom claims
      // (role:'owner', isAdmin:false, trialStartedAt:now) -- mirrors
      // handle_new_user(), which ran automatically as a Postgres
      // trigger; Firestore has no equivalent synchronous trigger this
      // app can rely on (see api/complete-signup.js), so it's an
      // explicit follow-up call instead. Force a token refresh
      // afterward so the newly-set claims are actually on the token
      // renderForSession() reads next -- a freshly issued token never
      // carries claims set after it was minted.
      await callFunction('/api/complete-signup');
      await cred.user.getIdToken(true);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (err) {
    authError.textContent = err.message || 'Could not sign in.';
    authError.hidden = false;
    return;
  }

  renderForSession();
});

otpForm.addEventListener('submit', async event => {
  event.preventDefault();
  otpError.hidden = true;
  otpVerifyBtn.disabled = true;
  try {
    await callFunction('/api/verify-login-otp', { code: otpCodeInput.value.trim() });
    markOtpVerified(auth.currentUser.uid);
    otpChallengeUserId = null;
    renderForSession();
  } catch (err) {
    otpError.textContent = err.message || 'Could not verify this code.';
    otpError.hidden = false;
    otpCodeInput.value = '';
    otpCodeInput.focus();
  } finally {
    otpVerifyBtn.disabled = false;
  }
});

otpResendBtn.addEventListener('click', sendOtpCode);

otpBackBtn.addEventListener('click', async () => {
  otpChallengeUserId = null;
  clearOtpVerified();
  await signOut(auth);
  renderForSession();
});

function setAuthMode(mode) {
  const isLogin = mode === 'login';
  authSubmitBtn.dataset.mode = isLogin ? 'login' : 'signup';
  authSubmitBtn.textContent = isLogin ? 'Log in' : 'Sign up';
  authToggleBtn.textContent = isLogin ? 'New here? Sign up' : 'Have an account? Log in';
}

authToggleBtn.addEventListener('click', () => {
  const switchingToLogin = authSubmitBtn.dataset.mode === 'signup';
  setAuthMode(switchingToLogin ? 'login' : 'signup');
  navigateTo(switchingToLogin ? '/login' : '/signup');
});

logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
  renderForSession();
});

employeePortalLogoutBtn.addEventListener('click', async () => {
  await signOut(auth);
  renderForSession();
});

purchaseLogoutBtn.addEventListener('click', async () => {
  await signOut(auth);
  renderForSession();
});

// Firebase's onAuthStateChanged has no distinct event-type discrimination
// the way Supabase's onAuthStateChange did (SIGNED_IN/SIGNED_OUT/
// PASSWORD_RECOVERY/TOKEN_REFRESHED as a string) -- it just calls back
// with the current user (or null) any time auth state changes,
// including a token refresh. renderForSession() itself already
// tolerates being re-run for the same still-valid session (every gate
// inside it is idempotent/keyed by user id), so no event-type branching
// is needed here the way the old PASSWORD_RECOVERY case required.
onAuthStateChanged(auth, () => {
  if (inRecovery) return;
  renderForSession();
});

// Browser back/forward -- re-derives which screen to show from the URL
// that's now current, rather than reloading the page. Owner-app pages
// and the login/signup toggle only; the employee portal's own tabs
// don't participate in URL routing.
window.addEventListener('popstate', () => {
  if (inRecovery) return;
  if (!hasActiveSession) {
    const mode = authModeFromCurrentPath();
    if (mode) setAuthMode(mode);
    return;
  }
  const page = PATH_TO_APP_PAGE[location.pathname];
  if (page && page !== activeAppPage) {
    activeAppPage = page;
    showScreen(activeAppPage);
    appNavButtons.forEach(b => { if (b.dataset.page) b.setAttribute('aria-selected', String(b.dataset.page === activeAppPage)); });
    document.dispatchEvent(new CustomEvent('app:page', { detail: { page: activeAppPage } }));
  }
});

renderForSession();
