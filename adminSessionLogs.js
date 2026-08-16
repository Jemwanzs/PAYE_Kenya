import { db } from './auth.js';
import { collection, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Admin-only cross-tenant login log (see firestore.rules). Rules scope
// what getDocs() actually returns -- a non-admin session simply gets a
// permission-denied error (caught below, same as an empty result), so
// there's no separate client-side admin check needed here beyond the
// nav button itself being hidden for them.

const tableBody = document.getElementById('sessionLogsTableBody');
const emptyState = document.getElementById('sessionLogsEmptyState');
const errorEl = document.getElementById('sessionLogsError');
const searchInput = document.getElementById('sessionLogsSearch');
const refreshBtn = document.getElementById('sessionLogsRefreshBtn');

let logsCache = [];
let logsLoaded = false;

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDevice(userAgent) {
  if (!userAgent) return '—';
  return userAgent.length > 60 ? `${userAgent.slice(0, 60)}…` : userAgent;
}

function fmtLocation(row) {
  if (row.locationStatus === 'granted' && row.latitude != null && row.longitude != null) {
    return `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}`;
  }
  return row.locationStatus === 'denied' ? 'Denied' : 'Unavailable';
}

function renderTable() {
  const search = searchInput.value.trim().toLowerCase();
  const rows = logsCache.filter(row =>
    !search ||
    (row.email || '').toLowerCase().includes(search) ||
    (row.businessName || '').toLowerCase().includes(search)
  );

  emptyState.hidden = rows.length > 0;

  tableBody.innerHTML = rows.map(row => `
    <tr>
      <td>${fmtWhen(row.createdAt)}</td>
      <td>${row.businessName || '—'}</td>
      <td>${row.email || '—'}${row.employeeName ? ` <small>(${row.employeeName})</small>` : ''}</td>
      <td>${row.role === 'employee' ? 'Employee' : 'Owner'}</td>
      <td title="${(row.userAgent || '').replace(/"/g, '&quot;')}">${fmtDevice(row.userAgent)}</td>
      <td>${fmtLocation(row)}</td>
    </tr>
  `).join('');
}

async function loadSessionLogs({ force = false } = {}) {
  if (logsLoaded && !force) return;
  errorEl.hidden = true;
  refreshBtn.disabled = true;
  try {
    const q = query(collection(db, 'sessionLogs'), orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    logsCache = snap.docs.map(d => d.data());
    logsLoaded = true;
    renderTable();
  } catch (err) {
    errorEl.textContent = err.message || 'Could not load session logs.';
    errorEl.hidden = false;
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener('click', () => loadSessionLogs({ force: true }));
searchInput.addEventListener('input', renderTable);

document.addEventListener('app:page', event => {
  if (event.detail.page === 'sessionLogs') loadSessionLogs();
});
