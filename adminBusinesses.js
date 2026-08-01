import { supabase, TRIAL_DAYS, EXTENDED_TRIAL_EMAILS } from './auth.js';

// Admin-only cross-tenant business/user management (see
// migrate_admin_business_controls.sql). Every read/write here goes
// through an admin-gated RPC, not a direct table query -- a non-admin
// session just gets an empty result / a rejected RPC call, same
// RLS-style "no special client-side check needed" shape as the session
// logs page.

const errorEl = document.getElementById('businessesError');
const emptyState = document.getElementById('businessesEmptyState');
const searchInput = document.getElementById('businessesSearch');
const refreshBtn = document.getElementById('businessesRefreshBtn');
const tableBody = document.getElementById('businessesTableBody');

const confirmOverlay = document.getElementById('businessesConfirmOverlay');
const confirmTitle = document.getElementById('businessesConfirmTitle');
const confirmMessage = document.getElementById('businessesConfirmMessage');
const confirmError = document.getElementById('businessesConfirmError');
const confirmActionBtn = document.getElementById('businessesConfirmActionBtn');
const confirmCancelBtn = document.getElementById('businessesConfirmCancelBtn');
const confirmCloseBtn = document.getElementById('businessesConfirmCloseBtn');

let businessesCache = [];
let businessesLoaded = false;
let expandedUserId = null;
let expandedEmployees = [];
let pendingConfirmAction = null;

function closeConfirm() {
  confirmOverlay.hidden = true;
  confirmError.hidden = true;
  pendingConfirmAction = null;
}

function openConfirm({ title, message, actionLabel, onConfirm }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmActionBtn.textContent = actionLabel;
  confirmError.hidden = true;
  pendingConfirmAction = onConfirm;
  confirmOverlay.hidden = false;
}

confirmCancelBtn.addEventListener('click', closeConfirm);
confirmCloseBtn.addEventListener('click', closeConfirm);
confirmOverlay.addEventListener('click', event => { if (event.target === confirmOverlay) closeConfirm(); });

confirmActionBtn.addEventListener('click', async () => {
  if (!pendingConfirmAction) return;
  confirmActionBtn.disabled = true;
  try {
    await pendingConfirmAction();
    closeConfirm();
  } catch (err) {
    confirmError.textContent = err.message || 'Could not complete this action.';
    confirmError.hidden = false;
  } finally {
    confirmActionBtn.disabled = false;
  }
});

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function statusBadge(row) {
  if (row.is_blocked) return '<span class="status-pill status-terminated">Blocked</span>';
  if (row.is_admin) return '<span class="status-pill status-active">Admin</span>';
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const trialDays = EXTENDED_TRIAL_EMAILS[row.email] ?? TRIAL_DAYS;
  const trialEndsAt = new Date(row.trial_started_at).getTime() + trialDays * dayMs;
  const paidUntil = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
  if (now < paidUntil) return '<span class="status-pill status-active">Paid</span>';
  if (now < trialEndsAt) return '<span class="status-pill status-active">Trial</span>';
  return '<span class="status-pill status-terminated">Expired</span>';
}

async function loadBusinesses({ force = false } = {}) {
  if (businessesLoaded && !force) return;
  errorEl.hidden = true;
  refreshBtn.disabled = true;
  try {
    const { data, error } = await supabase.rpc('admin_list_businesses');
    if (error) throw error;
    businessesCache = data || [];
    businessesLoaded = true;
    renderTable();
  } catch (err) {
    errorEl.textContent = err.message || 'Could not load businesses.';
    errorEl.hidden = false;
  } finally {
    refreshBtn.disabled = false;
  }
}

function employeeRowHtml(e) {
  const statusLabel = e.status === 'terminated' ? 'Terminated' : 'Active';
  const statusClass = e.status === 'terminated' ? 'terminated' : 'active';
  const portalLabel = !e.auth_user_id ? 'No portal access' : (e.portal_blocked ? 'Blocked' : 'Active');
  const portalActionBtn = e.auth_user_id
    ? `<button type="button" class="ghost-button employee-block-btn" data-id="${e.id}" data-blocked="${e.portal_blocked}">${e.portal_blocked ? 'Unblock portal' : 'Block portal'}</button>`
    : '';
  return `
    <tr>
      <td>${e.employee_number || '—'}</td>
      <td>${e.first_name} ${e.last_name}</td>
      <td>${e.email || '—'}</td>
      <td><span class="status-pill status-${statusClass}">${statusLabel}</span></td>
      <td>${portalLabel}</td>
      <td>${portalActionBtn}</td>
    </tr>
  `;
}

function expandedRowHtml(row) {
  const rows = expandedEmployees.length
    ? expandedEmployees.map(employeeRowHtml).join('')
    : '<tr><td colspan="6" class="hint">No employees for this business yet.</td></tr>';
  return `
    <tr class="business-expand-row">
      <td colspan="6">
        <div class="employee-table-wrap">
          <table class="compact-table employee-table">
            <thead>
              <tr><th>No.</th><th>Name</th><th>Email</th><th>Status</th><th>Portal</th><th></th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </td>
    </tr>
  `;
}

function renderTable() {
  const search = searchInput.value.trim().toLowerCase();
  const rows = businessesCache.filter(row =>
    !search ||
    (row.email || '').toLowerCase().includes(search) ||
    (row.business_name || '').toLowerCase().includes(search)
  );

  emptyState.hidden = rows.length > 0;

  tableBody.innerHTML = rows.map(row => {
    const mainRow = `
      <tr class="business-row" data-user-id="${row.user_id}">
        <td>${row.business_name || '(no business name set)'}</td>
        <td>${row.email || '—'}</td>
        <td>${statusBadge(row)}</td>
        <td>${row.employee_count}</td>
        <td>${fmtDate(row.created_at)}</td>
        <td>
          <button type="button" class="ghost-button business-expand-btn" data-user-id="${row.user_id}">${expandedUserId === row.user_id ? 'Hide employees' : 'View employees'}</button>
          ${row.is_admin ? '' : `<button type="button" class="ghost-button business-block-btn" data-user-id="${row.user_id}" data-email="${row.email || ''}" data-blocked="${row.is_blocked}">${row.is_blocked ? 'Unblock' : 'Block'}</button>`}
        </td>
      </tr>
    `;
    return expandedUserId === row.user_id ? mainRow + expandedRowHtml(row) : mainRow;
  }).join('');
}

async function toggleExpand(userId) {
  if (expandedUserId === userId) {
    expandedUserId = null;
    expandedEmployees = [];
    renderTable();
    return;
  }
  expandedUserId = userId;
  expandedEmployees = [];
  renderTable();
  const { data, error } = await supabase.rpc('admin_list_employees', { p_owner_user_id: userId });
  if (!error) expandedEmployees = data || [];
  renderTable();
}

async function setEmployeeBlocked(employeeId, blocked) {
  const { error } = await supabase.rpc('admin_set_employee_blocked', { p_employee_id: employeeId, p_blocked: blocked });
  if (error) throw error;
  const { data } = await supabase.rpc('admin_list_employees', { p_owner_user_id: expandedUserId });
  expandedEmployees = data || [];
  renderTable();
}

function setBusinessBlocked(userId, blocked) {
  return async () => {
    const { error } = await supabase.rpc('admin_set_business_blocked', { p_user_id: userId, p_blocked: blocked });
    if (error) throw error;
    await loadBusinesses({ force: true });
  };
}

tableBody.addEventListener('click', event => {
  const expandBtn = event.target.closest('.business-expand-btn');
  if (expandBtn) {
    toggleExpand(expandBtn.dataset.userId);
    return;
  }

  const businessBlockBtn = event.target.closest('.business-block-btn');
  if (businessBlockBtn) {
    const blocked = businessBlockBtn.dataset.blocked === 'true';
    const userId = businessBlockBtn.dataset.userId;
    const email = businessBlockBtn.dataset.email;
    if (blocked) {
      setBusinessBlocked(userId, false)().catch(err => { errorEl.textContent = err.message; errorEl.hidden = false; });
      return;
    }
    openConfirm({
      title: 'Block this business?',
      message: `${email || 'This business'}'s owner login will be suspended immediately, and every one of its employees will lose portal access too (on their next login or page load). This can be undone at any time.`,
      actionLabel: 'Block business',
      onConfirm: setBusinessBlocked(userId, true)
    });
    return;
  }

  const employeeBlockBtn = event.target.closest('.employee-block-btn');
  if (employeeBlockBtn) {
    const blocked = employeeBlockBtn.dataset.blocked === 'true';
    const employeeId = employeeBlockBtn.dataset.id;
    if (blocked) {
      setEmployeeBlocked(employeeId, false).catch(err => { errorEl.textContent = err.message; errorEl.hidden = false; });
      return;
    }
    openConfirm({
      title: 'Block this employee\'s portal access?',
      message: 'They will lose access to their self-service portal on their next login or page load. This can be undone at any time.',
      actionLabel: 'Block portal',
      onConfirm: () => setEmployeeBlocked(employeeId, true)
    });
  }
});

refreshBtn.addEventListener('click', () => loadBusinesses({ force: true }));
searchInput.addEventListener('input', renderTable);

document.addEventListener('app:page', event => {
  if (event.detail.page === 'businesses') loadBusinesses();
});
