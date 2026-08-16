import { auth, db } from './auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ---------------------------------------------------------------------
// Optional per-business passcode gate in front of report downloads
// (payslip print, muster roll print, leave-balance print). Opt-in: a
// business with no passcode configured (reportPasscodeHash is null)
// never sees the modal at all -- requireReportPasscode() resolves true
// immediately. Only ever hashed client-side (SHA-256, salted with the
// owner's own user_id) -- the plaintext passcode never touches the
// database. This is a walk-up-and-look deterrent for a shared device,
// not a defense against the account owner themselves, so a client-side
// hash is an appropriate amount of protection for the threat model.
// ---------------------------------------------------------------------

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashReportPasscode(passcode, userId) {
  return sha256Hex(`${userId}:${passcode}`);
}

// Cached per signed-in user for the duration of the session so every
// report click doesn't re-fetch the settings doc. Invalidated explicitly
// by employees.js right after the passcode is changed/cleared in
// Settings, so a gated download later in the same session never checks
// against a stale hash.
let cachedHash;
let cachedUserId = null;

export function invalidateReportPasscodeCache() {
  cachedHash = undefined;
}

async function loadPasscodeHash() {
  const user = auth.currentUser;
  if (!user) return null;
  if (cachedHash !== undefined && cachedUserId === user.uid) return cachedHash;
  const snap = await getDoc(doc(db, 'businesses', user.uid, 'settings', 'main'));
  cachedHash = snap.exists() ? (snap.data().reportPasscodeHash || null) : null;
  cachedUserId = user.uid;
  return cachedHash;
}

const overlay = document.getElementById('reportPasscodeOverlay');
const form = document.getElementById('reportPasscodeForm');
const input = document.getElementById('reportPasscodeInput');
const error = document.getElementById('reportPasscodeError');
const closeBtn = document.getElementById('reportPasscodeCloseBtn');
const cancelBtn = document.getElementById('reportPasscodeCancelBtn');

let pendingResolve = null;

function closeModal(result) {
  overlay.hidden = true;
  input.value = '';
  error.hidden = true;
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve(result);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const user = auth.currentUser;
  const attempt = await hashReportPasscode(input.value, user.uid);
  if (attempt === cachedHash) {
    closeModal(true);
    return;
  }
  error.textContent = 'Incorrect passcode.';
  error.hidden = false;
  input.value = '';
  input.focus();
});

closeBtn.addEventListener('click', () => closeModal(false));
cancelBtn.addEventListener('click', () => closeModal(false));
overlay.addEventListener('click', event => { if (event.target === overlay) closeModal(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) closeModal(false); });

// The single entry point any report/print action should await before
// proceeding, e.g.:
//   if (!(await requireReportPasscode())) return;
export async function requireReportPasscode() {
  const hash = await loadPasscodeHash();
  if (!hash) return true;

  return new Promise(resolve => {
    pendingResolve = resolve;
    error.hidden = true;
    input.value = '';
    overlay.hidden = false;
    input.focus();
  });
}
