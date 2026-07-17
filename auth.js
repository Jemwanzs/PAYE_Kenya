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
const PAID_STATUSES = ['active', 'non-renewing', 'attention'];
const DAY_MS = 24 * 60 * 60 * 1000;

const screens = {
  auth: document.getElementById('authScreen'),
  finalizing: document.getElementById('finalizingScreen'),
  paywall: document.getElementById('paywallScreen'),
  calculator: document.getElementById('calculatorGate')
};
const trialBanner = document.getElementById('trialBanner');
const manageBillingBtn = document.getElementById('manageBillingBtn');
const logoutBtn = document.getElementById('logoutBtn');
const resetBtn = document.getElementById('resetBtn');
const printBtn = document.getElementById('printBtn');
const subscribeBtn = document.getElementById('subscribeBtn');
const authForm = document.getElementById('authForm');
const authToggleBtn = document.getElementById('authToggleBtn');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authError = document.getElementById('authError');

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.hidden = key !== name;
  });
}

function computeAccess(profile) {
  const hasPaidAccess = PAID_STATUSES.includes(profile.subscription_status);
  const trialEndsAt = new Date(profile.trial_started_at).getTime() + TRIAL_DAYS * DAY_MS;
  const inTrial = profile.subscription_status === 'none' && Date.now() < trialEndsAt;
  const daysLeft = Math.max(0, Math.ceil((trialEndsAt - Date.now()) / DAY_MS));
  return { hasAccess: hasPaidAccess || inTrial, hasPaidAccess, inTrial, daysLeft };
}

async function fetchProfile() {
  const { data, error } = await supabase.from('profiles').select('*').single();
  if (error) throw error;
  return data;
}

async function callFunction(path) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
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

function renderAccess(access) {
  manageBillingBtn.hidden = !access.hasPaidAccess;
  resetBtn.hidden = !access.hasAccess;
  printBtn.hidden = !access.hasAccess;

  if (!access.hasAccess) {
    trialBanner.hidden = true;
    showScreen('paywall');
    return;
  }

  if (access.inTrial) {
    trialBanner.hidden = false;
    trialBanner.textContent = `Trial: ${access.daysLeft} day${access.daysLeft === 1 ? '' : 's'} left`;
  } else {
    trialBanner.hidden = true;
  }

  showScreen('calculator');
}

async function renderForSession() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    logoutBtn.hidden = true;
    manageBillingBtn.hidden = true;
    resetBtn.hidden = true;
    printBtn.hidden = true;
    trialBanner.hidden = true;
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

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  authError.hidden = true;

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

subscribeBtn.addEventListener('click', async () => {
  subscribeBtn.disabled = true;
  try {
    const { url } = await callFunction('/api/init-subscription');
    location.href = url;
  } catch {
    alert('Could not start checkout. Please try again.');
    subscribeBtn.disabled = false;
  }
});

manageBillingBtn.addEventListener('click', async () => {
  manageBillingBtn.disabled = true;
  try {
    const result = await callFunction('/api/manage-subscription');
    if (result.url) {
      location.href = result.url;
    } else if (result.cancelled) {
      alert('Your subscription has been cancelled.');
      renderForSession();
    }
  } catch {
    alert('Could not open billing management. Please try again.');
  } finally {
    manageBillingBtn.disabled = false;
  }
});

supabase.auth.onAuthStateChange(() => renderForSession());

renderForSession();
