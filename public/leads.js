const storageKey = 'mvegas_leads_admin_password';

const loginPanel = document.getElementById('loginPanel');
const tablePanel = document.getElementById('tablePanel');
const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const loginStatus = document.getElementById('loginStatus');
const tableStatus = document.getElementById('tableStatus');
const leadRows = document.getElementById('leadRows');
const leadCount = document.getElementById('leadCount');
const lastUpdated = document.getElementById('lastUpdated');
const refreshButton = document.getElementById('refreshButton');
const logoutButton = document.getElementById('logoutButton');

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuala_Lumpur'
  }).format(new Date(value));
}

function text(value) {
  return value || '-';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function renderRows(leads) {
  leadRows.innerHTML = leads.map((lead) => `
    <tr>
      <td>${formatDate(lead.submitted_at || lead.created_at)}</td>
      <td>${escapeHtml(text(lead.full_name))}</td>
      <td>${escapeHtml(text(lead.phone))}</td>
      <td>${escapeHtml(text(lead.loan_amount))}</td>
      <td>${escapeHtml(text(lead.state))}</td>
      <td>${escapeHtml(text(lead.meta_status))}</td>
      <td>${escapeHtml(text(lead.email_status))}</td>
      <td>${safeUrl(lead.source_url) ? `<a href="${escapeHtml(safeUrl(lead.source_url))}" target="_blank" rel="noreferrer">Open</a>` : '-'}</td>
    </tr>
  `).join('');
}

async function loadLeads(password) {
  tableStatus.textContent = 'Loading leads...';
  const response = await fetch('/api/leads?limit=200', {
    headers: { Authorization: `Bearer ${password}` }
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.ok) {
    throw new Error(result.message || 'Unable to load leads.');
  }

  renderRows(result.leads || []);
  leadCount.textContent = `${result.leads?.length || 0} leads`;
  lastUpdated.textContent = `Updated ${formatDate(new Date().toISOString())}`;
  tableStatus.textContent = '';
}

async function unlock(password) {
  try {
    loginStatus.textContent = 'Checking password...';
    await loadLeads(password);
    sessionStorage.setItem(storageKey, password);
    loginPanel.classList.add('is-hidden');
    tablePanel.classList.remove('is-hidden');
    loginStatus.textContent = '';
  } catch (error) {
    sessionStorage.removeItem(storageKey);
    loginStatus.textContent = error.message;
    tableStatus.textContent = '';
  }
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  unlock(passwordInput.value.trim());
});

refreshButton.addEventListener('click', () => {
  const password = sessionStorage.getItem(storageKey);
  if (password) loadLeads(password).catch((error) => {
    tableStatus.textContent = error.message;
  });
});

logoutButton.addEventListener('click', () => {
  sessionStorage.removeItem(storageKey);
  passwordInput.value = '';
  tablePanel.classList.add('is-hidden');
  loginPanel.classList.remove('is-hidden');
});

const savedPassword = sessionStorage.getItem(storageKey);
if (savedPassword) unlock(savedPassword);
