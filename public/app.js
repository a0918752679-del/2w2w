const state = {
  type: '告發',
  cases: [],
  stats: null,
  schema: null,
  selected: new Set(),
  passcode: localStorage.getItem('EEMS_PASSCODE') || ''
};

const $ = (id) => document.getElementById(id);

function headers() {
  return state.passcode ? { 'x-app-passcode': state.passcode } : {};
}

async function api(path, options = {}) {
  const opts = {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...headers()
    }
  };
  if (opts.body && !(opts.body instanceof FormData) && !opts.headers['Content-Type']) {
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[ch]));
}

function badge(status) {
  const map = {
    '待初核': 'badge-pending',
    '待長官審核': 'badge-pending',
    '長官核可': 'badge-ok',
    '行政處理中': 'badge-admin',
    '退回修正': 'badge-reject',
    '已結案': 'badge-closed'
  };
  return `<span class="badge ${map[status] || 'badge-pending'}">${escapeHtml(status || '未分類')}</span>`;
}

function firstNonEmpty(...values) {
  return values.find((v) => String(v ?? '').trim()) || '';
}

function caseDate(item) {
  const s = item.source || {};
  return [s['量測日期'], s['稽查時間']].filter(Boolean).join(' ');
}

function caseLocation(item) {
  const s = item.source || {};
  return firstNonEmpty(s['量測位置地點'], `${s['便於複製(行政區)'] || ''}${s['便於複製(路段)'] || ''}`);
}

function dbText(item) {
  const s = item.source || {};
  const db = s['背景修正後分貝'] || '';
  const std = s['管制標準'] || '';
  return [db, std].filter(Boolean).join(' / ');
}

function progressText(item) {
  if (item.type === '通檢') {
    return firstNonEmpty(item.admin?.inspectionStatus, item.admin?.stage, '未啟動');
  }
  return firstNonEmpty(item.admin?.penaltyProgress, item.admin?.stage, '未裁處');
}

function updateKpi(stats) {
  $('kpiTotal').textContent = stats?.total ?? 0;
  $('kpiPending').textContent = stats?.pendingReview ?? 0;
  $('kpiApproved').textContent = stats?.approved ?? 0;
  $('kpiAdmin').textContent = stats?.adminProcessing ?? 0;
  $('kpiClosed').textContent = stats?.closed ?? 0;
}

function renderStatusFilter() {
  const select = $('statusFilter');
  const current = select.value || '全部';
  select.innerHTML = '<option value="全部">全部狀態</option>';
  (state.schema?.statusOptions || []).forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    select.appendChild(opt);
  });
  select.value = current;
}

function renderRows() {
  const tbody = $('caseTbody');
  if (!state.cases.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="empty">目前沒有${escapeHtml(state.type)}案件。可先匯入 Excel，或從 Google Sheet 同步。</td></tr>`;
    return;
  }

  tbody.innerHTML = state.cases.map((item) => {
    const s = item.source || {};
    const checked = state.selected.has(item.id) ? 'checked' : '';
    const approved = item.review?.chiefApproved ? 'checked' : '';
    const isClosed = item.status === '已結案';
    return `
      <tr>
        <td><input type="checkbox" class="row-select" data-id="${escapeHtml(item.id)}" ${checked}></td>
        <td>${badge(item.status)}<div class="case-meta">${escapeHtml(item.admin?.stage || '')}</div></td>
        <td>
          <label class="check-approve">
            <input type="checkbox" class="chief-check" data-id="${escapeHtml(item.id)}" ${approved} ${isClosed ? 'disabled' : ''}>
            核可
          </label>
          <div class="case-meta">${escapeHtml(item.review?.chiefReviewer || '')} ${escapeHtml(item.review?.chiefReviewedAt || '')}</div>
        </td>
        <td><strong>${escapeHtml(item.id)}</strong><div class="case-meta">${escapeHtml(s['稽查編號'] || s['告發單號'] || '')}</div></td>
        <td><strong>${escapeHtml(s['車號'] || '')}</strong></td>
        <td>${escapeHtml(item.type)}<div class="case-meta">${escapeHtml(s['車種'] || '')}</div></td>
        <td>${escapeHtml(caseDate(item))}</td>
        <td>${escapeHtml(caseLocation(item))}</td>
        <td><strong>${escapeHtml(dbText(item))}</strong></td>
        <td>${escapeHtml(item.admin?.officialDocumentNo || '')}</td>
        <td>
          <strong>${escapeHtml(progressText(item))}</strong>
          <div class="case-meta">${escapeHtml(item.admin?.deliveryStatus || '')} ${escapeHtml(item.admin?.paymentStatus || '')}</div>
        </td>
        <td>
          <div class="row-actions">
            <button class="secondary-btn small-btn admin-btn" data-id="${escapeHtml(item.id)}">行政追蹤</button>
            <button class="danger-btn small-btn reject-btn" data-id="${escapeHtml(item.id)}">退回</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('.row-select').forEach((el) => {
    el.addEventListener('change', (event) => {
      const id = event.currentTarget.dataset.id;
      if (event.currentTarget.checked) state.selected.add(id);
      else state.selected.delete(id);
    });
  });

  document.querySelectorAll('.chief-check').forEach((el) => {
    el.addEventListener('change', async (event) => {
      const id = event.currentTarget.dataset.id;
      if (event.currentTarget.checked) await reviewOne(id, true);
      else await reviewOne(id, false, '取消核可或退回補正');
    });
  });

  document.querySelectorAll('.admin-btn').forEach((el) => {
    el.addEventListener('click', () => openAdmin(el.dataset.id));
  });

  document.querySelectorAll('.reject-btn').forEach((el) => {
    el.addEventListener('click', async () => {
      const reason = prompt('請輸入退回修正原因：') || '資料需補正';
      await reviewOne(el.dataset.id, false, reason);
    });
  });
}

async function loadSchema() {
  state.schema = await api('/api/schema');
  renderStatusFilter();
  fillSelect('stageInput', state.schema.adminStages);
  fillSelect('penaltyProgressInput', state.schema.penaltyProgressOptions);
  fillSelect('deliveryStatusInput', state.schema.deliveryStatusOptions);
  fillSelect('paymentStatusInput', state.schema.paymentStatusOptions);
  fillSelect('inspectionStatusInput', state.schema.inspectionStatusOptions);
}

async function loadCases() {
  const params = new URLSearchParams();
  params.set('type', state.type);
  const status = $('statusFilter').value;
  const q = $('searchInput').value.trim();
  if (status && status !== '全部') params.set('status', status);
  if (q) params.set('q', q);
  const data = await api(`/api/cases?${params.toString()}`);
  state.cases = data.items || [];
  state.stats = data.stats;
  updateKpi(data.stats);
  $('currentTypeLabel').textContent = state.type;
  renderRows();
}

function fillSelect(id, options) {
  const el = $(id);
  el.innerHTML = '';
  (options || []).forEach((value) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  });
}

async function healthCheck() {
  const box = $('healthBox');
  box.textContent = '連線測試中...';
  try {
    const data = await api('/api/health');
    box.innerHTML = `
      <strong>${escapeHtml(data.service)}</strong><br>
      系統狀態：正常<br>
      Google Sheet：${data.googleSheets.connected ? '連線成功' : '未連線'}<br>
      <span class="muted">${escapeHtml(data.googleSheets.message || '')}</span>
    `;
  } catch (err) {
    box.textContent = `連線失敗：${err.message}`;
  }
}

async function reviewOne(id, approved, reason = '') {
  const reviewer = prompt(approved ? '請輸入核可長官姓名：' : '請輸入退回人員姓名：', approved ? '局內長官' : '局內長官') || '局內長官';
  await api(`/api/cases/${encodeURIComponent(id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ approved, reviewer, rejectedReason: reason })
  });
  await loadCases();
}

async function bulkReview(approved) {
  const ids = Array.from(state.selected);
  if (!ids.length) {
    alert('請先勾選案件。');
    return;
  }
  const reviewer = prompt(approved ? '請輸入核可長官姓名：' : '請輸入退回人員姓名：', '局內長官') || '局內長官';
  const reason = approved ? '' : (prompt('請輸入退回修正原因：') || '資料需補正');
  await api('/api/cases/bulk-review', {
    method: 'POST',
    body: JSON.stringify({ ids, approved, reviewer, rejectedReason: reason })
  });
  state.selected.clear();
  $('selectAll').checked = false;
  await loadCases();
}

async function importExcel(file) {
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  const data = await api(`/api/import/${encodeURIComponent(state.type)}`, {
    method: 'POST',
    body: form
  });
  alert(`匯入完成：新增 ${data.inserted} 筆、更新 ${data.updated} 筆。`);
  $('fileInput').value = '';
  await loadCases();
}

function downloadExport(type) {
  const url = `/api/export/${encodeURIComponent(type)}${state.passcode ? `?passcode=${encodeURIComponent(state.passcode)}` : ''}`;
  window.location.href = url;
}

async function openAdmin(id) {
  const item = await api(`/api/cases/${encodeURIComponent(id)}`);
  $('modalCaseId').value = item.id;
  $('modalTitle').textContent = `行政流程追蹤｜${item.id}｜${item.source?.['車號'] || ''}`;

  $('stageInput').value = item.admin?.stage || '尚未啟動';
  $('officialDocumentNoInput').value = item.admin?.officialDocumentNo || '';
  $('officialDocumentDateInput').value = normalizeDate(item.admin?.officialDocumentDate);
  $('dispositionNoInput').value = item.admin?.dispositionNo || '';
  $('penaltyAmountInput').value = item.admin?.penaltyAmount || item.source?.['金額'] || '';
  $('penaltyProgressInput').value = item.admin?.penaltyProgress || '未裁處';
  $('deliveryStatusInput').value = item.admin?.deliveryStatus || '未送達';
  $('paymentStatusInput').value = item.admin?.paymentStatus || '未開立';
  $('inspectionDueDateInput').value = normalizeDate(item.admin?.inspectionDueDate);
  $('inspectionStatusInput').value = item.admin?.inspectionStatus || (item.type === '通檢' ? '通知待發文' : '未啟動');
  $('closeDateInput').value = normalizeDate(item.admin?.closeDate);
  $('operatorInput').value = localStorage.getItem('EEMS_OPERATOR') || '承辦人員';
  $('notesInput').value = item.admin?.notes || '';

  const logs = item.logs || [];
  $('logList').innerHTML = logs.length ? logs.map((log) => `
    <div class="log-item">
      <span>${escapeHtml(log.at || '')}</span>
      <strong>${escapeHtml(log.action || '')}</strong>
      <span>${escapeHtml(log.by || '')}｜${escapeHtml(log.note || '')}</span>
    </div>
  `).join('') : '<div class="muted">尚無更新紀錄</div>';

  $('adminDialog').showModal();
}

function normalizeDate(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  const m = v.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return '';
}

async function saveAdmin(event) {
  event.preventDefault();
  const id = $('modalCaseId').value;
  const operator = $('operatorInput').value.trim() || '承辦人員';
  localStorage.setItem('EEMS_OPERATOR', operator);
  await api(`/api/cases/${encodeURIComponent(id)}/admin`, {
    method: 'PATCH',
    body: JSON.stringify({
      stage: $('stageInput').value,
      officialDocumentNo: $('officialDocumentNoInput').value,
      officialDocumentDate: $('officialDocumentDateInput').value,
      dispositionNo: $('dispositionNoInput').value,
      penaltyAmount: $('penaltyAmountInput').value,
      penaltyProgress: $('penaltyProgressInput').value,
      deliveryStatus: $('deliveryStatusInput').value,
      paymentStatus: $('paymentStatusInput').value,
      inspectionDueDate: $('inspectionDueDateInput').value,
      inspectionStatus: $('inspectionStatusInput').value,
      closeDate: $('closeDateInput').value,
      notes: $('notesInput').value,
      operator
    })
  });
  $('adminDialog').close();
  await loadCases();
}

async function syncPull() {
  if (!confirm('確認要從 Google Sheet 同步資料到系統？同案件編號會更新。')) return;
  const data = await api('/api/sync/pull', { method: 'POST' });
  alert(`同步完成：拉回 ${data.pulled} 筆，新增 ${data.inserted} 筆，更新 ${data.updated} 筆。`);
  await loadCases();
}

async function syncPush() {
  if (!confirm('確認要將目前系統資料推送到 Google Sheet？會覆蓋「告發」「通檢」「案件追蹤紀錄」分頁內容。')) return;
  const data = await api('/api/sync/push', { method: 'POST' });
  alert(`推送完成：${data.pushed} 筆案件已寫入 Google Sheet。`);
}

function bindEvents() {
  $('passcodeInput').value = state.passcode;
  $('savePasscodeBtn').addEventListener('click', async () => {
    state.passcode = $('passcodeInput').value;
    localStorage.setItem('EEMS_PASSCODE', state.passcode);
    await healthCheck();
    await loadCases();
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      tab.classList.add('active');
      state.type = tab.dataset.type;
      state.selected.clear();
      $('selectAll').checked = false;
      await loadCases();
    });
  });

  $('statusFilter').addEventListener('change', loadCases);
  $('searchInput').addEventListener('input', debounce(loadCases, 250));
  $('healthBtn').addEventListener('click', healthCheck);
  $('pullBtn').addEventListener('click', syncPull);
  $('pushBtn').addEventListener('click', syncPush);
  $('fileInput').addEventListener('change', (event) => importExcel(event.target.files[0]));
  $('templateLink').addEventListener('click', (event) => {
    event.preventDefault();
    const url = `/api/template${state.passcode ? `?passcode=${encodeURIComponent(state.passcode)}` : ''}`;
    window.location.href = url;
  });
  $('exportBtn').addEventListener('click', () => downloadExport(state.type));
  $('bulkApproveBtn').addEventListener('click', () => bulkReview(true));
  $('bulkRejectBtn').addEventListener('click', () => bulkReview(false));
  $('saveAdminBtn').addEventListener('click', saveAdmin);
  $('selectAll').addEventListener('change', (event) => {
    if (event.currentTarget.checked) state.cases.forEach((c) => state.selected.add(c.id));
    else state.selected.clear();
    renderRows();
  });
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

async function init() {
  bindEvents();
  try {
    await loadSchema();
    await loadCases();
    await healthCheck();
  } catch (err) {
    $('caseTbody').innerHTML = `<tr><td colspan="12" class="empty">載入失敗：${escapeHtml(err.message)}</td></tr>`;
    $('healthBox').textContent = `系統載入失敗：${err.message}`;
  }
}

init();
