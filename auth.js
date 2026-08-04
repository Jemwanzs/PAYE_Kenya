import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public by design — Row Level Security on the `profiles` table is what
// actually restricts access, not secrecy of these values.
const SUPABASE_URL = 'https://puxsrbukdsywxuaxeeom.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_40HuQHNxiEA06Aw26di1BQ_C1oK6RU1';

if (SUPABASE_URL.startsWith('YOUR_') || SUPABASE_ANON_KEY.startsWith('YOUR_')) {
  const authScreen = document.getElementById('authScreen');
  authScreen.hidden = false;
  authScreen.querySelector('h1').textContent = 'Setup required';
  authScreen.querySelector('.hero-copy').textContent =
    'Add your Supabase project URL and anon key to auth.js (see README) before this app can be used.';
  authScreen.querySelector('.auth-form').hidden = true;
  throw new Error('auth.js: SUPABASE_URL / SUPABASE_ANON_KEY not configured');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Shared with employees.js so it reuses this exact client/session instead
// of creating a second GoTrue client (which would fight over session storage).
export { supabase, callFunction, TRIAL_DAYS, EXTENDED_TRIAL_EMAILS, getGeolocation };

const TRIAL_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

// Developer/support account(s) get a longer trial so day-to-day QA and
// support work isn't gated behind buying day-passes. Keyed by email
// (not is_admin) so it's a time-boxed trial extension, not permanent
// unlimited access — once the listed number of days has elapsed since
// trial_started_at, it behaves like anyone else's expired trial and
// needs a day-pass same as normal.
const EXTENDED_TRIAL_EMAILS = { 'jamosammy@gmail.com': 60 };

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

// Detected synchronously from the URL so recovery mode is set before
// Supabase's async client init has a chance to race renderForSession() and
// flash the calculator screen instead of the "set new password" form.
// An invite link lands here the same way a password-recovery link does
// (Supabase puts type=invite in the redirect hash) and needs the exact
// same "set a password" step, so it's folded into the same flag/screen.
let inRecovery = location.hash.includes('type=recovery') || location.hash.includes('type=invite');
if (inRecovery) showScreen('recovery');

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

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  if (!hasActiveSession) return;
  idleTimer = setTimeout(async () => {
    hasActiveSession = false;
    await supabase.auth.signOut();
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
// migrate_session_logs.sql). Best-effort and fire-and-forget: a logging
// failure, a slow/declined geolocation prompt, or an offline browser
// must never block or delay someone's actual login. Geolocation is
// requested (never something a browser lets a site force) -- a denial
// or an unsupported browser is just logged as such and login proceeds
// exactly the same either way.
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

// cachedGeo lets logSessionOnce reuse the geolocation result the login
// security gate below already fetched, instead of prompting/requesting
// it a second time in the same login.
async function logSessionOnce(profile, cachedGeo) {
  if (sessionLoggedThisPageLoad) return;
  sessionLoggedThisPageLoad = true;
  try {
    const [{ data: identityRows }, geo] = await Promise.all([
      supabase.rpc('session_log_identity'),
      cachedGeo ? Promise.resolve(cachedGeo) : getGeolocation()
    ]);
    const identity = (identityRows && identityRows[0]) || {};
    await supabase.from('session_logs').insert({
      user_id: profile.id,
      email: profile.email || null,
      role: identity.role || profile.role || 'owner',
      business_name: identity.business_name || null,
      employee_name: identity.employee_name || null,
      user_agent: navigator.userAgent,
      location_status: geo.status,
      latitude: geo.latitude,
      longitude: geo.longitude
    });
  } catch {
    // Best-effort only.
  }
}

// ---------------------------------------------------------------------
// Employee-only login time-window/geofence enforcement (see
// migrate_login_security.sql). Runs before the OTP code is even sent --
// no point emailing a code to someone who's about to be blocked anyway.
// Never blocks the business owner's own login (enforced server-side in
// check_login_security() -- see that migration for why: self-lockout
// risk, since only the owner can reach Settings to turn this off).
// Checked once per (user id, tab session), same lifecycle as the OTP
// challenge below, not on every renderForSession() re-render.
// ---------------------------------------------------------------------
let securityCheckedUserId = null;
let loginBlockedReason = null;
let cachedLoginGeo = null;

// Returns true if login should stop here (blocked screen now showing).
async function runLoginSecurityGate(user) {
  if (securityCheckedUserId !== user.id) {
    securityCheckedUserId = user.id;
    loginBlockedReason = null;
    cachedLoginGeo = await getGeolocation();
    try {
      const { data } = await supabase.rpc('check_login_security', {
        p_latitude: cachedLoginGeo.latitude,
        p_longitude: cachedLoginGeo.longitude,
        p_location_status: cachedLoginGeo.status
      });
      const result = (data && data[0]) || { allowed: true, reason: null };
      if (!result.allowed) loginBlockedReason = result.reason || 'Login is not allowed right now.';
    } catch {
      // Fails open -- an RPC error here must never lock everyone out.
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
  await supabase.auth.signOut();
  renderForSession();
});

// ---------------------------------------------------------------------
// 5-digit email verification code, required after every password
// sign-in/sign-up (see api/send-login-otp.js / api/verify-login-otp.js
// and migrate_login_otp.sql). Tracked per browser tab via
// sessionStorage keyed by user id, not anything in the persisted
// Supabase session -- closing the tab before verifying and reopening
// starts the challenge over (sessionStorage doesn't survive that), but
// an ordinary same-tab refresh after verifying doesn't re-prompt. A
// token refresh re-fires the same onAuthStateChange path as a real
// sign-in, but never re-triggers this, since it's keyed on user id,
// which a refresh doesn't change.
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
// unverified session (e.g. a TOKEN_REFRESHED event), and that must not
// spam a new email/reset the 60s resend cooldown each time.
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
  if (otpChallengeUserId === user.id) return;
  otpChallengeUserId = user.id;
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
  // Checked ahead of is_admin -- a blocked account stays blocked even
  // if it also happens to carry the admin flag (defense in depth; the
  // admin_set_business_blocked() RPC itself already refuses to let an
  // admin block their own account, but this keeps the client-side
  // logic correct regardless of how is_blocked ends up true).
  if (profile.is_blocked) {
    return { hasAccess: false, isAdmin: false, isBlocked: true, inTrial: false, hasPaidAccess: false, trialDaysLeft: 0, paidDaysLeft: 0 };
  }
  if (profile.is_admin) {
    return { hasAccess: true, isAdmin: true, isBlocked: false, inTrial: false, hasPaidAccess: false, trialDaysLeft: 0, paidDaysLeft: 0 };
  }

  const trialDays = EXTENDED_TRIAL_EMAILS[profile.email] ?? TRIAL_DAYS;
  const now = Date.now();
  const trialEndsAt = new Date(profile.trial_started_at).getTime() + trialDays * DAY_MS;
  const paidUntil = profile.access_expires_at ? new Date(profile.access_expires_at).getTime() : 0;
  const inTrial = now < trialEndsAt;
  const hasPaidAccess = now < paidUntil;
  const trialDaysLeft = Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS));
  const paidDaysLeft = Math.max(0, Math.ceil((paidUntil - now) / DAY_MS));
  return { hasAccess: inTrial || hasPaidAccess, isAdmin: false, isBlocked: false, inTrial, hasPaidAccess, trialDaysLeft, paidDaysLeft };
}

async function fetchProfile() {
  const { data, error } = await supabase.from('profiles').select('*').single();
  if (error) throw error;
  return data;
}

async function callFunction(path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
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
    const access = computeAccess(profile);
    if (access.hasAccess) return { profile, access };
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
// trial-or-paid gate at all -- viewing your own payslip and applying for
// leave is basic HR self-service, not the paid product, so it stays
// available even if the business owner's own subscription has lapsed.
// The only gate an employee is subject to is the RLS "status <>
// terminated" check baked into every employee-scoped policy: if their own
// employees row is no longer visible, fetching it here comes back empty
// and they're shown the revoked message below.
async function renderEmployeePortal(profile) {
  ownerAppShell.hidden = true;
  employeePortalShell.hidden = false;
  employeePortalRevoked.hidden = true;
  employeePortalBody.hidden = true;
  setPurchaseOverlay(false);

  // Explicitly scoped to this session's own auth_user_id rather than an
  // unfiltered select -- an approver's own portal session can also see
  // its assigned applicants' employee rows (approver_read_applicant_employee_records
  // in migrate_approver_visibility_fix.sql), so an unfiltered select+maybeSingle()
  // here would throw "multiple rows returned" for any employee who
  // approves for someone else, surfacing this exact screen as a false
  // "access revoked" for an account that was never actually revoked.
  const { data: employee } = await supabase.from('employees').select('*').eq('auth_user_id', profile.id).maybeSingle();
  if (!employee) {
    employeePortalRevoked.hidden = false;
    return;
  }

  // Two independent block switches, both platform-admin-only (see
  // migrate_admin_business_controls.sql): this specific employee's own
  // portal access, or their entire business having been blocked (which
  // an employee session has no RLS visibility into directly, hence the
  // RPC). Either one shows the exact same "revoked" message -- the
  // employee doesn't need to know which case it is, only their employer.
  if (employee.portal_blocked) {
    employeePortalRevoked.hidden = false;
    return;
  }
  const { data: ownerBlocked } = await supabase.rpc('is_my_owner_blocked');
  if (ownerBlocked) {
    employeePortalRevoked.hidden = false;
    return;
  }

  employeePortalGreeting.textContent = `Welcome, ${employee.first_name}`;
  employeePortalBody.hidden = false;
  showEmployeePortalScreen(activeEmployeePortalPage);
  document.dispatchEvent(new CustomEvent('employee-portal:ready', { detail: { employee, profile } }));
}

async function renderForSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (inRecovery) return;

  if (!session) {
    hasActiveSession = false;
    resetIdleTimer();
    otpChallengeUserId = null;
    securityCheckedUserId = null;
    clearOtpVerified();
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

  // Gate ahead of everything else -- an unverified session sees only the
  // code-entry screen, never the app shell, regardless of role. Tracked
  // in sessionStorage rather than anything server-side, so this is a
  // UX/velocity control layered on top of the real password auth, not a
  // hard security boundary in its own right (consistent with this app's
  // other client-side gates -- report passcode, idle logout).
  if (!isOtpVerifiedForSession(session.user.id)) {
    if (await runLoginSecurityGate(session.user)) return;
    await startOtpChallenge(session.user);
    return;
  }

  const profile = await fetchProfile();
  logSessionOnce(profile, cachedLoginGeo);

  if (profile.role === 'employee') {
    employeePortalLogoutBtn.hidden = false;
    await renderEmployeePortal(profile);
    return;
  }

  ownerAppShell.hidden = false;
  employeePortalShell.hidden = true;
  logoutBtn.hidden = false;

  // A non-admin who directly types/bookmarks /session-logs or
  // /businesses shouldn't land on that screen just because the URL
  // resolved to it -- same page it'd fall back to if the nav button
  // (already hidden for them) didn't exist at all.
  if ((activeAppPage === 'sessionLogs' || activeAppPage === 'businesses') && !profile.is_admin) activeAppPage = 'calculator';

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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${location.origin}${location.pathname}`
  });
  forgotPasswordBtn.disabled = false;

  if (error) {
    authError.textContent = error.message;
    authError.hidden = false;
    return;
  }

  authInfo.textContent = 'Check your email for a password reset link.';
  authInfo.hidden = false;
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

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    recoveryError.textContent = error.message;
    recoveryError.hidden = false;
    return;
  }

  inRecovery = false;
  recoveryForm.reset();
  renderForSession();
});

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  authError.hidden = true;
  authInfo.hidden = true;

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const isSignup = authSubmitBtn.dataset.mode === 'signup';

  const { error } = isSignup
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    authError.textContent = error.message;
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
    const { data: { user } } = await supabase.auth.getUser();
    markOtpVerified(user.id);
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
  await supabase.auth.signOut();
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
  await supabase.auth.signOut();
  renderForSession();
});

employeePortalLogoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  renderForSession();
});

purchaseLogoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  renderForSession();
});

supabase.auth.onAuthStateChange(event => {
  if (event === 'PASSWORD_RECOVERY') {
    inRecovery = true;
    showScreen('recovery');
    return;
  }
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
