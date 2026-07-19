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

const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

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

const screens = {
  auth: document.getElementById('authScreen'),
  recovery: document.getElementById('recoveryScreen'),
  finalizing: document.getElementById('finalizingScreen'),
  calculator: document.getElementById('calculatorGate')
};
const accessBanner = document.getElementById('accessBanner');
const buyMoreBtn = document.getElementById('buyMoreBtn');
const logoutBtn = document.getElementById('logoutBtn');
const resetBtn = document.getElementById('resetBtn');
const printBtn = document.getElementById('printBtn');
const mobileStickySummary = document.getElementById('mobileStickySummary');
const authForm = document.getElementById('authForm');
const authToggleBtn = document.getElementById('authToggleBtn');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');
const authInfo = document.getElementById('authInfo');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const recoveryForm = document.getElementById('recoveryForm');
const recoveryError = document.getElementById('recoveryError');
const calculatorGate = document.getElementById('calculatorGate');
const purchaseOverlay = document.getElementById('purchaseOverlay');
const purchaseCloseBtn = document.getElementById('purchaseCloseBtn');
const purchaseTitle = document.getElementById('purchaseTitle');
const purchaseSubtitle = document.getElementById('purchaseSubtitle');
const purchaseError = document.getElementById('purchaseError');
const packageGrid = document.getElementById('packageGrid');

// Detected synchronously from the URL so recovery mode is set before
// Supabase's async client init has a chance to race renderForSession() and
// flash the calculator screen instead of the "set new password" form.
let inRecovery = location.hash.includes('type=recovery');
if (inRecovery) showScreen('recovery');

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
}

function computeAccess(profile) {
  if (profile.is_admin) {
    return { hasAccess: true, isAdmin: true, inTrial: false, hasPaidAccess: false, trialDaysLeft: 0, paidDaysLeft: 0 };
  }

  const now = Date.now();
  const trialEndsAt = new Date(profile.trial_started_at).getTime() + TRIAL_DAYS * DAY_MS;
  const paidUntil = profile.access_expires_at ? new Date(profile.access_expires_at).getTime() : 0;
  const inTrial = now < trialEndsAt;
  const hasPaidAccess = now < paidUntil;
  const trialDaysLeft = Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS));
  const paidDaysLeft = Math.max(0, Math.ceil((paidUntil - now) / DAY_MS));
  return { hasAccess: inTrial || hasPaidAccess, isAdmin: false, inTrial, hasPaidAccess, trialDaysLeft, paidDaysLeft };
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
  if (!res.ok) throw new Error('Request failed');
  return res.json();
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

function setPurchaseOverlay(show, { forced = false } = {}) {
  purchaseOverlay.hidden = !show;
  purchaseCloseBtn.hidden = forced;
  if (show) {
    purchaseError.hidden = true;
    purchaseTitle.textContent = forced ? 'Your access has ended' : 'Buy more time';
    purchaseSubtitle.textContent = forced
      ? 'Buy a day-pass to keep using the calculator — billed in KES via Paystack (card or M-Pesa).'
      : 'Top up before your current access runs out — billed in KES via Paystack (card or M-Pesa).';
  }
}

function renderAccess(access) {
  resetBtn.hidden = !access.hasAccess;
  printBtn.hidden = !access.hasAccess;
  mobileStickySummary.hidden = !access.hasAccess;
  buyMoreBtn.hidden = access.isAdmin;

  if (access.isAdmin) {
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

  showScreen('calculator');
  calculatorGate.classList.toggle('blurred', !access.hasAccess);
  setPurchaseOverlay(!access.hasAccess, { forced: !access.hasAccess });
}

async function renderForSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (inRecovery) return;

  if (!session) {
    logoutBtn.hidden = true;
    resetBtn.hidden = true;
    printBtn.hidden = true;
    mobileStickySummary.hidden = true;
    buyMoreBtn.hidden = true;
    accessBanner.hidden = true;
    setPurchaseOverlay(false);
    showScreen('auth');
    return;
  }

  logoutBtn.hidden = false;

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

  const profile = await fetchProfile();
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
  } catch {
    purchaseError.textContent = 'Could not start checkout. Please try again.';
    purchaseError.hidden = false;
    allButtons.forEach(b => { b.disabled = false; });
  }
});

buyMoreBtn.addEventListener('click', () => setPurchaseOverlay(true, { forced: false }));
purchaseCloseBtn.addEventListener('click', () => setPurchaseOverlay(false));

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

authToggleBtn.addEventListener('click', () => {
  const switchingToLogin = authSubmitBtn.dataset.mode === 'signup';
  authSubmitBtn.dataset.mode = switchingToLogin ? 'login' : 'signup';
  authSubmitBtn.textContent = switchingToLogin ? 'Log in' : 'Sign up';
  authToggleBtn.textContent = switchingToLogin ? 'New here? Sign up' : 'Have an account? Log in';
});

logoutBtn.addEventListener('click', async () => {
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

renderForSession();
