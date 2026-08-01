import { supabase } from './auth.js';

// Admin-only cross-tenant login log (see migrate_session_logs.sql). RLS
// scopes what select() actually returns -- a non-admin session simply
// gets zero rows back, so there's no separate client-side admin check
// needed here beyond the nav button itself being hidden for them.

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
  if (row.location_status === 'granted' && row.latitude != null && row.longitude != null) {
    return `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}`;
  }
  return row.location_status === 'denied' ? 'Denied' : 'Unavailable';
}

function renderTable() {
  const search = searchInput.value.trim().toLowerCase();
  const rows = logsCache.filter(row =>
    !search ||
    (row.email || '').toLowerCase().includes(search) ||
    (row.business_name || '').toLowerCase().includes(search)
  );

  emptyState.hidden = rows.length > 0;

  tableBody.innerHTML = rows.map(row => `
    <tr>
      <td>${fmtWhen(row.created_at)}</td>
      <td>${row.business_name || '—'}</td>
      <td>${row.email || '—'}${row.employee_name ? ` <small>(${row.employee_name})</small>` : ''}</td>
      <td>${row.role === 'employee' ? 'Employee' : 'Owner'}</td>
      <td title="${(row.user_agent || '').replace(/"/g, '&quot;')}">${fmtDevice(row.user_agent)}</td>
      <td>${fmtLocation(row)}</td>
    </tr>
  `).join('');
}

async function loadSessionLogs({ force = false } = {}) {
  if (logsLoaded && !force) return;
  errorEl.hidden = true;
  refreshBtn.disabled = true;
  try {
    const { data, error } = await supabase
      .from('session_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    logsCache = data || [];
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
