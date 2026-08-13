// Screen + print watermarking -- a deterrent, not a block. No web page
// can actually prevent a screenshot, a phone camera pointed at the
// screen, or screen recording; nothing here claims to. What this DOES
// do: stamp the signed-in user's email and a timestamp across the
// screen and every printed/PDF'd report, so a leaked screenshot or
// printout is traceable back to who had it open. That's the realistic
// version of "stop people leaking this" available to a web app.

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let watermarkEmail = '';

function watermarkLabel() {
  const now = new Date();
  const stamp = now.toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${watermarkEmail} · ${stamp}`;
}

// ---------------------------------------------------------------------
// On-screen overlay -- covers the app shell whenever a verified session
// is showing actual business data (never on the login/OTP/blocked
// screens, which have nothing sensitive to protect). Built and owned
// entirely by this module so nothing else needs to touch index.html for
// it.
// ---------------------------------------------------------------------

const screenOverlay = document.createElement('div');
screenOverlay.id = 'appWatermarkOverlay';
screenOverlay.setAttribute('aria-hidden', 'true');
screenOverlay.style.display = 'none';
document.body.appendChild(screenOverlay);

const SCREEN_GRID_COLS = 4;
const SCREEN_GRID_ROWS = 8;

function renderScreenOverlay() {
  const label = escapeHtml(watermarkLabel());
  let html = '';
  for (let r = 0; r < SCREEN_GRID_ROWS; r += 1) {
    for (let c = 0; c < SCREEN_GRID_COLS; c += 1) {
      const top = (r / SCREEN_GRID_ROWS) * 100 + 4;
      const left = (c / SCREEN_GRID_COLS) * 100 + 2;
      html += `<div class="screen-watermark" style="top:${top}%;left:${left}%">${label}</div>`;
    }
  }
  screenOverlay.innerHTML = html;
}

export function showScreenWatermark(email) {
  watermarkEmail = email || '';
  renderScreenOverlay();
  screenOverlay.style.display = 'block';
}

export function hideScreenWatermark() {
  screenOverlay.style.display = 'none';
  screenOverlay.innerHTML = '';
}

// Keeps the stamped timestamp roughly current for a long-open tab,
// without needing to re-render on every tick.
setInterval(() => {
  if (screenOverlay.style.display === 'block') renderScreenOverlay();
}, 60000);

// ---------------------------------------------------------------------
// Print watermark -- foreground text, deliberately NOT a CSS
// background-image. Most browsers don't print background images/colors
// unless the user has "Background graphics" checked in the print
// dialog (off by default), so a background-based watermark would
// silently vanish from the actual printed/PDF output. Foreground text
// color always prints regardless of that setting.
// ---------------------------------------------------------------------

const PRINT_WATERMARK_POSITIONS = [
  { top: '10%', left: '8%' },
  { top: '45%', left: '35%' },
  { top: '80%', left: '12%' }
];

function printWatermarkHtml() {
  const label = escapeHtml(watermarkLabel());
  return PRINT_WATERMARK_POSITIONS.map(p =>
    `<div class="print-watermark" style="top:${p.top};left:${p.left}">${label}</div>`
  ).join('');
}

// Call after setting a print wrap's innerHTML (or on the wrap itself for
// a single-page template like the payslip). Appends the watermark to
// every .muster-page-classed page container found within root, so a
// multi-page report (a long muster roll) gets it on each printed page,
// not just the first.
export function applyPrintWatermark(root, email) {
  watermarkEmail = email || watermarkEmail;
  const pages = root.querySelectorAll('.muster-page');
  const targets = pages.length ? [...pages] : [root];
  targets.forEach(page => {
    page.insertAdjacentHTML('beforeend', printWatermarkHtml());
  });
}
