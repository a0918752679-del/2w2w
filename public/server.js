'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const APP_VERSION = '73.3.0';
const SERVICE_NAME = 'newtaipei-noise-control-system-v73-zeabur-direct-upload';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads', 'field-photos');
const PUBLIC_DIR = path.join(ROOT, 'public');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const PHOTO_RECORDS_PATH = path.join(DATA_DIR, 'field_photo_records.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const env = (k, fallback = '') => process.env[k] || fallback;
const PORT = Number(env('PORT', '8080')) || 8080;
const PUBLIC_BASE_URL = env('PUBLIC_BASE_URL', 'https://newtaipeinoise.zeabur.app').replace(/\/$/, '');
const DASHBOARD_URL = env('DASHBOARD_URL', 'https://noise115.zeabur.app').replace(/\/$/, '');
const FIELD_REPORT_URL = env('FIELD_REPORT_URL', 'https://out115.zeabur.app').replace(/\/$/, '');
const HOTSPOT_URL = env('HOTSPOT_URL', 'https://ntpcnoisely.zeabur.app/login');
const CASE_TRACKING_URL = env('CASE_TRACKING_URL', 'https://ntpclynoise.zeabur.app/').replace(/\/$/, '');
const RESULTS_GOOGLE_SHEET_ID = env('RESULTS_GOOGLE_SHEET_ID', '1EfP7GoI87RRl1AUGegwPhqNvFN9xG-YXm9NoMSqm_O0');
const RESULTS_GOOGLE_SHEET_GID = env('RESULTS_GOOGLE_SHEET_GID', '617607580');
const RESULTS_GOOGLE_SHEET_URL = env('RESULTS_GOOGLE_SHEET_URL', `https://docs.google.com/spreadsheets/d/${RESULTS_GOOGLE_SHEET_ID}/edit?gid=${RESULTS_GOOGLE_SHEET_GID}`);
const EQUIPMENT_GOOGLE_SHEET_ID = env('EQUIPMENT_GOOGLE_SHEET_ID', '1HY32HW5lq9K-ibpz9dHsjZJxBmSF6anplH9kpw1w4IQ');
const EQUIPMENT_GOOGLE_SHEET_GID = env('EQUIPMENT_GOOGLE_SHEET_GID', '0');
const EQUIPMENT_GOOGLE_SHEET_URL = env('EQUIPMENT_GOOGLE_SHEET_URL', `https://docs.google.com/spreadsheets/d/${EQUIPMENT_GOOGLE_SHEET_ID}/edit?gid=${EQUIPMENT_GOOGLE_SHEET_GID}`);
const FIELD_GOOGLE_SHEET_GID = env('FIELD_GOOGLE_SHEET_GID', '1228277001');
const FIELD_GOOGLE_SHEET_URL = env('FIELD_GOOGLE_SHEET_URL', `https://docs.google.com/spreadsheets/d/${env('FIELD_GOOGLE_SHEET_ID', '1BVZ4kEoKndO5OMAZmk8OLwplrzBL_Drt4xEmpzgejb8')}/edit?gid=${FIELD_GOOGLE_SHEET_GID}`);
const COMPLAINT_GOOGLE_SHEET_ID = env('COMPLAINT_GOOGLE_SHEET_ID', '1SNyJuAgUK896NViI9KaIccK59JBw5a6WsXnPecW31Hk');
const COMPLAINT_GOOGLE_SHEET_GID = env('COMPLAINT_GOOGLE_SHEET_GID', '0');
const COMPLAINT_GOOGLE_SHEET_URL = env('COMPLAINT_GOOGLE_SHEET_URL', `https://docs.google.com/spreadsheets/d/${COMPLAINT_GOOGLE_SHEET_ID}/edit?gid=${COMPLAINT_GOOGLE_SHEET_GID}`);
const COMPLAINT_SEED_PATH = path.join(DATA_DIR, 'complaint_trends_seed.json');
const PHOTO_MAX_SIZE_MB = Number(env('PHOTO_MAX_SIZE_MB', '12')) || 12;
const PHOTO_MAX_FILES = Number(env('PHOTO_MAX_FILES', '20')) || 20;
const REQUIRED_PHOTO_TYPES = env('FIELD_PHOTO_REQUIRED_TYPES', 'overview,device,device_no,sign,sign_context,road_forward,road_backward,power,calibration,environment').split(',').map(s => s.trim()).filter(Boolean);
const LINE_RICHMENU_ALIAS_MAIN = env('LINE_RICHMENU_ALIAS_MAIN', 'ntpc-main');
const LINE_RICHMENU_ALIAS_INFO = env('LINE_RICHMENU_ALIAS_INFO', 'ntpc-info');
const SHEET_LINK_PASSWORD = env('SHEET_LINK_PASSWORD', '69677323');
const SHEET_LINK_SESSION_MINUTES = Number(env('SHEET_LINK_SESSION_MINUTES', '10')) || 10;
const pendingSheetLinkAuth = new Map(); // token -> {sourceKey, createdAt}
const pendingSheetLinkBySource = new Map(); // sourceKey -> token
const ADMIN_PASSWORD = env('ADMIN_PASSWORD', SHEET_LINK_PASSWORD || '69677323');
const ADMIN_SESSION_MINUTES = Number(env('ADMIN_SESSION_MINUTES', '60')) || 60;
const ADMIN_HIDDEN_TAP_TOKEN = '__NTPC_ADMIN_HIDDEN_TAP__';
const ADMIN_COOKIE_NAME = 'ntpc_admin_session';
const pendingAdminHiddenTap = new Map(); // sourceKey -> {count, updatedAt}



const PHOTO_TYPES = [
  ['overview', '現場架設全景'],
  ['device', '設備近照'],
  ['device_no', '機台編號／設備標示'],
  ['sign', '告示牌近照'],
  ['sign_context', '告示牌與路段環境'],
  ['road_forward', '稽查方向視角'],
  ['road_backward', '反向／周邊視角'],
  ['power', '電力／線路／固定'],
  ['calibration', '校正／操作佐證'],
  ['environment', '環境條件佐證'],
  ['extra', '補充照片']
];

function taipeiTime(d = new Date()) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(d));
}
function nowIso() { return new Date().toISOString(); }
function safeJsonRead(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}
function safeJsonWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function getStore() {
  const d = safeJsonRead(STORE_PATH, {});
  if (!d.summary) d.summary = {};
  if (!d.annualGoal) d.annualGoal = 490;
  if (!d.months) d.months = {};
  if (!d.districts) d.districts = {};
  if (!d.monthDistricts) d.monthDistricts = {};
  if (!d.hotspots) d.hotspots = [];
  if (!d.equipment) d.equipment = [];
  if (!d.equipmentLive) d.equipmentLive = [];
  if (!Array.isArray(d.complaints) || !d.complaints.length) d.complaints = seedComplaintRows();
  if (!d.plates) d.plates = {};
  if (!d.news) d.news = { updatedAt: nowIso(), items: [] };
  return d;
}
function getPhotoRecords() { return safeJsonRead(PHOTO_RECORDS_PATH, []); }
function savePhotoRecords(records) { safeJsonWrite(PHOTO_RECORDS_PATH, records); }
function num(v, fallback = 0) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(String(v).replace(/[,，]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}
function fmt(n, digits = 0) {
  const value = Number(n) || 0;
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function json(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
function html(res, body) { text(res, 200, body, 'text/html; charset=utf-8'); }
function redirect(res, location) { res.writeHead(302, { location }); res.end(); }
function notFound(res) { text(res, 404, 'Not Found'); }
function readBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', c => {
      total += c.length;
      if (total > limitBytes) {
        reject(new Error('BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function parseJsonBody(buf) {
  if (!buf || !buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}
function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', quote = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '"') {
      if (quote && n === '"') { cur += '"'; i++; }
      else quote = !quote;
    } else if (c === ',' && !quote) { row.push(cur); cur = ''; }
    else if ((c === '\n' || c === '\r') && !quote) {
      if (c === '\r' && n === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => String(v).trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some(v => String(v).trim() !== '')) rows.push(row);
  return rows;
}
function csvToObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h || `col${i}`] = String(r[i] ?? '').trim(); });
    return obj;
  });
}
function cleanDate(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '-';
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    const parts = raw.slice(0, 10).split('-').map(x => x.padStart(2, '0'));
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(raw)) return raw.replace(/\b(\d)\b/g, '0$1').slice(0, 10);
  const monthMap = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
  const m = raw.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-/](\d{2})$/i);
  if (m) { const yy = Number(m[2]); return `${yy >= 70 ? 1900 + yy : 2000 + yy}/${monthMap[m[1].slice(0,1).toUpperCase()+m[1].slice(1,3).toLowerCase()] || m[1]}`; }
  return raw.replace(' 00:00:00', '');
}
function normalizeLight(v, item) {
  const raw = String(v || '').trim();
  if (raw) return raw;
  const dates = [item.bitestDue, item.soundMeterDue, item.windMeterDue].filter(x => x && x !== '-');
  if (!dates.length) return '⚪未填';
  const today = new Date();
  let minDays = 99999;
  for (const d of dates) {
    const parsed = new Date(String(d).replace(/\//g, '-'));
    if (!Number.isNaN(parsed.getTime())) minDays = Math.min(minDays, Math.ceil((parsed - today) / 86400000));
  }
  if (minDays < 0) return '🔴逾期';
  if (minDays <= 30) return '🔴即將到期';
  if (minDays <= 90) return '🟡注意';
  return '🟢正常';
}
function equipmentFromRows(rows) {
  return (rows || []).map((r, idx) => {
    const item = {
      id: r['機台編號'] || r['設備編號'] || r['id'] || r['ID'] || `ZB${String(idx + 1).padStart(3, '0')}`,
      name: r['設備名稱'] || '聲音照相設備',
      unit: r['保管單位'] || '',
      status: r['使用狀態'] || '',
      bitestDate: cleanDate(r['中央比測日期'] || r['比測日期']),
      bitestDue: cleanDate(r['中央比測到期日'] || r['比測到期日'] || r['中央比測']),
      soundMeterDue: cleanDate(r['噪音計到期日'] || r['噪音計']),
      windMeterDue: cleanDate(r['風速計到期日'] || r['風速計']),
      postCalibrationValue: r['後校正值'] || r['後校正'] || r['後校正數值'] || '',
      postCalibrationDate: cleanDate(r['後校正日'] || r['後校正日期'] || r['後校正時間'] || ''),
      light: String(r['燈號'] || '').trim(),
      suggestion: r['建議處理'] || '',
      updatedAt: cleanDate(r['資料更新時間'] || r['更新時間'])
    };
    item.light = normalizeLight(item.light, item);
    return item;
  }).filter(e => e.id && !/^col\d+$/.test(e.id));
}
function equipmentCsv(rows) {
  const header = ['機台編號','設備名稱','保管單位','使用狀態','中央比測到期日','噪音計到期日','風速計到期日','後校正值','後校正日','燈號','建議處理','資料更新時間'];
  const data = [header, ...(rows || []).map(e => [e.id,e.name,e.unit,e.status,e.bitestDue,e.soundMeterDue,e.windMeterDue,e.postCalibrationValue,e.postCalibrationDate,e.light,e.suggestion,e.updatedAt])];
  return '\uFEFF' + data.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
}
function equipmentCardsHtml(list) {
  const eq = Array.isArray(list) ? list : [];
  if (!eq.length) return '<div class="loading-line">尚未同步設備資料，請點選「同步設備 Sheet」。</div>';
  return eq.map(e => `<div class="module-card ${String(e.light||'').includes('🔴') ? 'bad' : (String(e.light||'').includes('🟡') ? 'warn' : 'ok')}"><span class="icon">🛠️</span><b>${esc(e.id || '-')}</b><small>比測到期：${esc(e.bitestDue || '-')}<br>噪音計：${esc(e.soundMeterDue || '-')}<br>風速計：${esc(e.windMeterDue || '-')}<br>後校正日：${esc(e.postCalibrationDate || '-')}</small><span class="state">${esc(e.light || '⚪未填')}</span></div>`).join('');
}

function normalizeDeviceId(v) {
  const raw = String(v || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (!raw) return '';
  const m = raw.match(/(?:OE_?)?ZB_?0*(\d+)/);
  if (m) return `OE_ZB${String(Number(m[1])).padStart(3, '0')}`;
  return raw.replace(/^OE(?!_)/, 'OE_');
}
function displayDeviceId(v) { return normalizeDeviceId(v) || String(v || '').trim() || '-'; }
function parseRocDate(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{3})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) return new Date(Number(m[1]) + 1911, Number(m[2]) - 1, Number(m[3]));
  m = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function rocDateText(v) {
  const d = parseRocDate(v);
  if (!d) return cleanDate(v);
  const y = d.getFullYear() - 1911;
  return `${y}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function startOfTaipeiDay(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(x => [x.type, x.value]));
  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}
function dayAgeFromDate(dateObj) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return null;
  const basis = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  return Math.floor((startOfTaipeiDay().getTime() - basis.getTime()) / 86400000);
}
function firstNonEmpty(row, keys) {
  for (const k of keys) {
    const v = row && row[k];
    if (String(v || '').trim()) return v;
  }
  return '';
}
function liveFieldFromRows(rows) {
  const latest = new Map();
  const latestPost = new Map();
  for (const r of rows || []) {
    const status = String(r['狀態'] || '').trim();
    if (status && !/有效|使用|完成|已/.test(status)) continue;
    const id = normalizeDeviceId(r['機台編號'] || r['設備機號'] || r['機台'] || r['設備編號']);
    if (!id) continue;
    const dateRaw = firstNonEmpty(r, ['日期','架設日期','架設日','執勤日期','外勤回報場次日','場次日']);
    const submitRaw = firstNonEmpty(r, ['送出時間','回報時間','更新時間','時間戳記']);
    const postRaw = firstNonEmpty(r, ['後校正日','後校正日期','收設備後校正日','收設備日期','撤收日期']);
    const d1 = parseRocDate(dateRaw);
    const d2 = parseRocDate(submitRaw);
    const p1 = parseRocDate(postRaw);
    const ts = Math.max(d1 ? d1.getTime() : 0, d2 ? d2.getTime() : 0);
    const postTs = p1 ? p1.getTime() : 0;
    if (postTs) {
      const currentPost = latestPost.get(id);
      if (!currentPost || postTs >= currentPost.postCalibrationTs) {
        latestPost.set(id, {
          deviceId: id,
          postCalibrationDate: rocDateText(postRaw),
          postCalibrationAgeDays: dayAgeFromDate(p1),
          postCalibrationTs: postTs,
          source: 'field_report',
          sessionNo: r['執行場次'] || r['場次編號'] || r['場次'] || '-'
        });
      }
    }
    const item = {
      deviceId: id,
      state: '上線監測中',
      light: '🟢',
      sessionNo: r['執行場次'] || r['場次編號'] || r['場次'] || '-',
      onlineDate: rocDateText(dateRaw || submitRaw),
      onlineAgeDays: dayAgeFromDate(d1 || d2),
      onlineStartTs: d1 ? d1.getTime() : (d2 ? d2.getTime() : 0),
      latestSessionHasPostCalibration: !!postTs,
      latestSessionPostCalibrationDate: postTs ? rocDateText(postRaw) : '',
      latestSessionPostCalibrationTs: postTs,
      district: r['行政區'] || '-',
      location: r['執勤地點'] || r['架設地址'] || r['點位地址'] || '-',
      speedLimit: r['路段限速'] || '-',
      noiseStandard: r['噪音標準'] || '-',
      calibration: r['校正值'] || '-',
      signDistance: r['距離公尺'] || '-',
      reporter: r['回報人員'] || '-',
      reportTime: cleanDate(submitRaw),
      sortKey: ts || postTs || 0
    };
    const prev = latest.get(id);
    if (!prev || item.sortKey >= prev.sortKey) latest.set(id, item);
  }
  latest.latestPost = latestPost;
  return latest;
}
function knownEquipmentIds(store, latestMap) {
  const ids = new Set();
  (store.equipment || []).forEach(e => ids.add(normalizeDeviceId(e.id || e.deviceId || e['機台編號'])));
  latestMap.forEach((_, k) => ids.add(k));
  if (!ids.size) for (let i = 1; i <= 10; i++) ids.add(`OE_ZB${String(i).padStart(3,'0')}`);
  return [...ids].filter(Boolean).sort((a,b)=>a.localeCompare(b, 'en', { numeric:true }));
}

function equipmentPostCalibrationMap(store = getStore()) {
  const map = new Map();
  for (const e of store.equipment || []) {
    const id = normalizeDeviceId(e.id || e.deviceId || e['機台編號']);
    if (!id) continue;
    const rawDate = e.postCalibrationDate || e['後校正日'] || e['後校正日期'] || '';
    const date = parseRocDate(rawDate);
    const ts = date ? date.getTime() : 0;
    map.set(id, {
      deviceId: id,
      postCalibrationValue: e.postCalibrationValue || e['後校正值'] || '',
      postCalibrationDate: rawDate ? rocDateText(rawDate) : '',
      postCalibrationAgeDays: date ? dayAgeFromDate(date) : null,
      postCalibrationTs: ts,
      source: e
    });
  }
  return map;
}
function compareEquipmentLiveState(hit, post) {
  const hasInstall = !!(hit && hit.onlineStartTs);
  const hasPost = !!(post && post.postCalibrationTs);
  const latestSessionClosed = !!(hit && hit.latestSessionHasPostCalibration);

  // 設備生命週期判定：以「最新架設場次」為主。
  // 1) 最新架設場次未填後校正日：代表設備仍在該點監測，判定運作中。
  // 2) 最新架設場次已填後校正日：代表設備已收回，若沒有下一筆新場次，判定維護中。
  // 3) 若後校正日之後已有更新的架設場次：代表移動至下一點，重新判定運作中。
  if (!hasInstall) {
    return { state:'維護中', light:'⚫', stateLabel:'維護中', reason: hasPost ? '有後校正日，但尚無外勤回報新增場次' : '無架設回報、無後校正資料', maintenance:true };
  }

  if (latestSessionClosed) {
    return { state:'維護中', light:'⚫', stateLabel:'維護中', reason:'最新架設場次已填後校正日，表示設備已收回，尚未新增下一場', maintenance:true };
  }

  if (hasPost && post.postCalibrationTs > hit.onlineStartTs) {
    return { state:'維護中', light:'⚫', stateLabel:'維護中', reason:'後校正日晚於最新架設場次日，表示設備已收回，尚未新增下一場', maintenance:true };
  }

  return { state:'運作中', light:'🟢', stateLabel:'運作中', reason: hasPost ? '後校正後已有新增架設場次，且最新場次尚未填後校正日' : '最新架設場次未填後校正日', online:true };
}
function liveEquipmentFromRows(rows, store = getStore()) {
  const latestMap = liveFieldFromRows(rows || []);
  const fieldPostMap = latestMap.latestPost || new Map();
  const equipmentPostMap = equipmentPostCalibrationMap(store);
  const ids = knownEquipmentIds(store, latestMap);
  return ids.map(id => {
    const hit = latestMap.get(id) || null;
    const fieldPost = fieldPostMap.get(id) || null;
    const equipmentPost = equipmentPostMap.get(id) || null;
    const post = [fieldPost, equipmentPost].filter(Boolean).sort((a,b)=>(b.postCalibrationTs||0)-(a.postCalibrationTs||0))[0] || null;
    const judgement = compareEquipmentLiveState(hit, post);
    const base = hit || {
      deviceId:id,
      sessionNo:'-',
      onlineDate:'-',
      onlineAgeDays:null,
      onlineStartTs:0,
      district:'-',
      location: post ? '尚無新增外勤回報場次' : '尚無外勤回報場次',
      speedLimit:'-',
      noiseStandard:'-',
      calibration:'-',
      signDistance:'-',
      reporter:'-',
      reportTime:'-',
      sortKey:0
    };
    return {
      ...base,
      state: judgement.state,
      light: judgement.light,
      maintenanceReason: judgement.reason,
      postCalibrationDate: post?.postCalibrationDate || '-',
      postCalibrationValue: post?.postCalibrationValue || '-',
      postCalibrationAgeDays: typeof post?.postCalibrationAgeDays === 'number' ? post.postCalibrationAgeDays : null
    };
  });
}
function liveEquipmentCounts(list) {
  return (list || []).reduce((a, x) => {
    const st = String(x.state || '');
    if (st.includes('運作') || st.includes('上線')) a.online += 1;
    else a.maintenance += 1;
    return a;
  }, { online:0, waiting:0, maintenance:0 });
}
function liveEquipmentText() {
  const store = getStore();
  const items = Array.isArray(store.equipmentLive) ? store.equipmentLive : [];
  if (!items.length) return '【即時機況】\n尚未同步外勤回報場次，請由後台執行「同步外勤機況」。';
  const counts = liveEquipmentCounts(items);
  const header = `【即時機況】\n🟢運作中 ${counts.online}｜⚫維護中 ${counts.maintenance}`;
  const rows = items.slice(0, 12).map(x => {
    const st = String(x.state || '');
    if (st.includes('運作') || st.includes('上線')) {
      return `${x.light || '🟢'} ${x.deviceId}｜運作中\n架設：${x.onlineDate || '-'}｜場次：${x.sessionNo || '-'}\n行政區：${x.district || '-'}\n地點：${x.location || '-'}\n後校正：${x.postCalibrationDate || '-'}`;
    }
    return `⚫ ${x.deviceId}｜維護中\n最近架設：${x.onlineDate || '-'}\n後校正：${x.postCalibrationDate || '-'}\n說明：${x.maintenanceReason || '無架設回報、無後校正資料'}`;
  }).join('\n\n');
  const updated = store.lastLiveEquipmentSync?.atTaipei ? `\n\n更新時間：${store.lastLiveEquipmentSync.atTaipei}` : '';
  return `${header}\n\n${rows}${updated}`;
}
function liveEquipmentCardsHtml(list) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return '<div class="loading-line">尚未同步外勤機況，請點選「同步外勤機況」。</div>';
  return items.map(x => {
    const st = String(x.state||'');
    const online = st.includes('運作') || st.includes('上線');
    const cls = online ? 'ok' : 'bad';
    const stateText = online ? '運作中' : '維護中';
    const icon = online ? '🟢' : '⚫';
    const reason = x.maintenanceReason ? `<br>${esc(x.maintenanceReason)}` : '';
    const age = typeof x.onlineAgeDays === 'number' ? `｜架設${x.onlineAgeDays}天` : '';
    const post = x.postCalibrationDate && x.postCalibrationDate !== '-' ? `<br>後校正：${esc(x.postCalibrationDate)}` : '<br>後校正：-';
    return `<div class="module-card ${cls}"><span class="icon">${icon}</span><b>${esc(x.deviceId || '-')}</b><small>${esc(x.state || '-')}<br>架設：${esc(x.onlineDate || '-')}${esc(age)}｜場次：${esc(x.sessionNo || '-')}<br>${esc(x.district || '-')}｜${esc(x.location || '-')}${post}${reason}</small><span class="state">${stateText}</span></div>`;
  }).join('');
}
function liveEquipmentCsv(rows) {
  const header = ['機台編號','即時狀態','架設日期','架設日齡','後校正日','後校正日齡','最新場次','行政區','架設地址','路段限速','噪音標準','校正值','告示牌距離','回報人員','送出時間','狀態說明'];
  const data = [header, ...(rows || []).map(x => [x.deviceId,x.state,x.onlineDate,(typeof x.onlineAgeDays === 'number' ? x.onlineAgeDays : ''),x.postCalibrationDate,(typeof x.postCalibrationAgeDays === 'number' ? x.postCalibrationAgeDays : ''),x.sessionNo,x.district,x.location,x.speedLimit,x.noiseStandard,x.calibration,x.signDistance,x.reporter,x.reportTime,x.maintenanceReason || ''])];
  return '\uFEFF' + data.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
}

function seedComplaintRows() {
  try {
    if (fs.existsSync(COMPLAINT_SEED_PATH)) {
      const rows = JSON.parse(fs.readFileSync(COMPLAINT_SEED_PATH, 'utf8'));
      return Array.isArray(rows) ? rows : [];
    }
  } catch (_) {}
  return [];
}
function normalizeComplaintYear(v, dateValue = '') {
  const raw = String(v || '').trim();
  const direct = raw.match(/(11[3-9]|12[0-9]|20\d{2})/);
  if (direct) {
    const y = Number(direct[1]);
    return String(y > 1911 ? y - 1911 : y);
  }
  const d = String(dateValue || '').match(/(\d{2,4})[\/\-.年](\d{1,2})/);
  if (d) {
    const y = Number(d[1]);
    return String(y > 1911 ? y - 1911 : y);
  }
  return '';
}
function normalizeComplaintMonth(v, dateValue = '') {
  const raw = String(v || '').trim();
  const cn = chineseMonthNumber(raw);
  if (cn) return String(cn);
  const alias = normalizeMonthAliasText(raw);
  const direct = alias.match(/(1[0-2]|0?[1-9])/);
  if (direct) return String(Number(direct[1]));
  const d = String(dateValue || '').match(/(?:\d{2,4})[\/\-.年](\d{1,2})/);
  return d ? String(Number(d[1])) : '';
}
function normalizeComplaintPeriod(v, content = '') {
  const raw = `${v || ''} ${content || ''}`;
  if (/夜間|晚上|夜晚|半夜|凌晨|深夜|睡覺/.test(raw)) return '夜間';
  if (/清晨|早上|上午|一早/.test(raw)) return '上午';
  if (/下午|傍晚|黃昏|下班/.test(raw)) return '下午';
  if (/假日|周末|週末/.test(raw)) return '假日';
  if (/全天|全日|整天|不分晝夜|日夜/.test(raw)) return '全天';
  return String(v || '').trim() || '未註明';
}
function normalizeComplaintLocation(v, district = '', content = '') {
  const raw = String(v || '').trim();
  if (raw && raw !== district) return raw.slice(0, 80);
  const text = String(content || '').replace(/[\r\n]+/g, ' ');
  const roads = [];
  const re = /([\u4e00-\u9fa5A-Za-z0-9一二三四五六七八九十]+(?:路|街|大道|公路|橋|線|巷|段|交流道))/g;
  let m;
  while ((m = re.exec(text)) && roads.length < 2) {
    const r = String(m[1] || '').replace(/[，。、；：:,.()（）]/g, '').trim();
    if (r && !roads.includes(r)) roads.push(r);
  }
  if (roads.length) return `${district ? district + ' ' : ''}${roads.join(' / ')}`.slice(0, 80);
  return `${district ? district + ' ' : ''}${text.slice(0, 32)}`.trim() || '-';
}
function complaintRowFromObject(r, idx = 0) {
  const content = r['陳情內容'] || r['內容'] || r['content'] || r['描述'] || '';
  const date = r['日期'] || r['陳情日期'] || r['date'] || '';
  const district = normalizeDistrict(r['行政區'] || r['地點'] || r['district'] || content || '');
  const year = normalizeComplaintYear(r['年份'] || r['year'] || r['年度'], date);
  const month = normalizeComplaintMonth(r['月份'] || r['month'] || r['月'], date);
  if (!year && !month && !district && !content) return null;
  return {
    year: year || '-',
    month: month || '-',
    date: String(date || '').trim(),
    district: district || '-',
    period: normalizeComplaintPeriod(r['時段'] || r['period'] || r['陳情時段'], content),
    location: normalizeComplaintLocation(r['陳情位置'] || r['熱門點位'] || r['點位'] || r['地址'] || r['location'], district, content),
    count: Math.max(1, num(r['陳情數'] || r['件數'] || r['count'] || r['數量'], 1)),
    caseNo: String(r['案號'] || r['caseNo'] || r['案件編號'] || '').trim(),
    content: String(content || '').trim(),
    source: String(r['資料來源'] || r['source'] || '市政信箱').trim()
  };
}
function complaintsFromRows(rows) {
  return (rows || []).map((r, idx) => complaintRowFromObject(r, idx)).filter(Boolean);
}
function complaintRows() {
  const store = getStore();
  const rows = Array.isArray(store.complaints) && store.complaints.length ? store.complaints : seedComplaintRows();
  return Array.isArray(rows) ? rows : [];
}
function extractComplaintYear(text) {
  const m = String(text || '').match(/(11[3-9]|12[0-9]|20\d{2})\s*年?/);
  if (!m) return '';
  const y = Number(m[1]);
  return String(y > 1911 ? y - 1911 : y);
}
function extractComplaintPeriod(text) {
  const raw = String(text || '');
  if (/夜間|晚上|夜晚|半夜|凌晨|深夜/.test(raw)) return '夜間';
  if (/上午|早上|清晨/.test(raw)) return '上午';
  if (/下午|傍晚|黃昏/.test(raw)) return '下午';
  if (/假日|週末|周末/.test(raw)) return '假日';
  if (/全天|全日|整天|不分晝夜/.test(raw)) return '全天';
  return '';
}
function extractComplaintKeyword(text) {
  let key = normalizeMonthAliasText(text)
    .replace(/陳情趨勢|陳情熱點|熱門陳情點位|熱門陳情|市政信箱|1999|陳情|投訴|民怨|趨勢|同期|比較|查詢|搜尋|查看|幫我|給我|看一下|看/g, '')
    .replace(/(11[3-9]|12[0-9]|20\d{2})年?/g, '')
    .replace(/(1[0-2]|0?[1-9])\s*月/g, '')
    .replace(DISTRICT_RE, '')
    .replace(/夜間|晚上|夜晚|半夜|凌晨|深夜|上午|早上|清晨|下午|傍晚|黃昏|假日|週末|周末|全天|全日|整天|不分晝夜/g, '')
    .trim();
  return key.length >= 2 ? key : '';
}
function complaintFilterFromMessage(msg) {
  return {
    year: extractComplaintYear(msg),
    month: extractMonthFromMessage(msg),
    district: extractDistrictFromMessage(msg),
    period: extractComplaintPeriod(msg),
    keyword: extractComplaintKeyword(msg)
  };
}
function matchComplaint(row, filter = {}) {
  const filterMonth = normalizeMonthKey(filter.month);
  if (filter.year && String(row.year) !== String(filter.year)) return false;
  if (filterMonth && String(row.month) !== filterMonth) return false;
  if (filter.district && String(row.district || '') !== String(filter.district)) return false;
  if (filter.period && String(row.period || '') !== String(filter.period)) return false;
  if (filter.keyword) {
    const bag = `${row.location || ''} ${row.content || ''} ${row.caseNo || ''}`.toLowerCase();
    if (!bag.includes(String(filter.keyword).toLowerCase())) return false;
  }
  return true;
}
function topComplaintMap(rows, key, limit = 10) {
  const map = new Map();
  for (const r of rows || []) {
    const k = String(typeof key === 'function' ? key(r) : r[key] || '-').trim() || '-';
    map.set(k, (map.get(k) || 0) + num(r.count, 1));
  }
  return [...map.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0], 'zh-Hant')).slice(0, limit).map(([name, count]) => ({ name, count }));
}
function aggregateComplaints(filter = {}) {
  const filterMonth = normalizeMonthKey(filter.month);
  const normalizedFilter = { ...filter, month: filterMonth };
  const all = complaintRows();
  const rows = all.filter(r => matchComplaint(r, normalizedFilter));
  const total = rows.reduce((a,r)=>a+num(r.count,1),0);
  const byYear = topComplaintMap(rows, 'year', 20).sort((a,b)=>num(a.name)-num(b.name));
  const byMonth = topComplaintMap(rows, 'month', 12).sort((a,b)=>num(a.name)-num(b.name));
  const byDistrict = topComplaintMap(rows, 'district', 10);
  const byPeriod = topComplaintMap(rows, 'period', 8);
  const hotspots = topComplaintMap(rows, r => r.location || r.district || '-', 10);
  const sameMonth = normalizedFilter.month ? topComplaintMap(all.filter(r => String(r.month) === normalizedFilter.month && (!normalizedFilter.district || String(r.district) === String(normalizedFilter.district)) && (!normalizedFilter.period || String(r.period) === String(normalizedFilter.period))), 'year', 20).sort((a,b)=>num(a.name)-num(b.name)) : [];
  const districtTrend = normalizedFilter.district ? topComplaintMap(all.filter(r => String(r.district) === String(normalizedFilter.district) && (!normalizedFilter.year || String(r.year) === String(normalizedFilter.year))), r => `${r.year}/${String(r.month).padStart(2,'0')}`, 40).sort((a,b)=>a.name.localeCompare(b.name)) : [];
  const scope = [normalizedFilter.year ? `${normalizedFilter.year}年` : '全部年份', normalizedFilter.month ? `${normalizedFilter.month}月` : '全部月份', normalizedFilter.district || '全市', normalizedFilter.period || '全部時段', normalizedFilter.keyword ? `關鍵字：${normalizedFilter.keyword}` : ''].filter(Boolean).join('｜');
  return { ok:true, scope, filter: normalizedFilter, total, rows: rows.length, byYear, byMonth, byDistrict, byPeriod, hotspots, sameMonth, districtTrend, updatedAt: getStore().lastComplaintSync?.atTaipei || taipeiTime(), sheetId: COMPLAINT_GOOGLE_SHEET_ID, gid: COMPLAINT_GOOGLE_SHEET_GID };
}
function complaintTrendText(msg = '') {
  const filter = complaintFilterFromMessage(msg);
  const a = aggregateComplaints(filter);
  if (!a.total) return `【陳情趨勢】\n查無符合條件的陳情資料。\n可改查：4月陳情、淡水區陳情、夜間陳情、熱門陳情點位。`;
  const same = a.sameMonth && a.sameMonth.length ? `\n\n同期比較：\n${a.sameMonth.map(x => `${x.name}年${filter.month}月：${fmt(x.count)}件`).join('｜')}` : '';
  const district = a.byDistrict.length ? `\n\n行政區 Top5：\n${a.byDistrict.slice(0,5).map((x,i)=>`${i+1}. ${x.name} ${fmt(x.count)}件`).join('\n')}` : '';
  const period = a.byPeriod.length ? `\n\n時段分布：${a.byPeriod.map(x=>`${x.name} ${fmt(x.count)}`).join('｜')}` : '';
  const hot = a.hotspots.length ? `\n\n熱門陳情點位：\n${a.hotspots.slice(0,5).map((x,i)=>`${i+1}. ${x.name}\n   ${fmt(x.count)}件`).join('\n')}` : '';
  const trend = a.districtTrend && a.districtTrend.length ? `\n\n${filter.district}趨勢：\n${a.districtTrend.slice(-8).map(x=>`${x.name} ${fmt(x.count)}件`).join('｜')}` : '';
  return `【陳情趨勢】\n我幫你彙整好了。\n範圍：${a.scope}\n陳情數：${fmt(a.total)}件\n更新：${a.updatedAt}${same}${district}${period}${hot}${trend}\n\n資料來源：1999市政信箱陳情案件 Google Sheet / 系統快取`;
}
function complaintTrendCardsHtml(a = aggregateComplaints({})) {
  const cards = [
    ['總陳情數', `${fmt(a.total)} 件`, a.scope || '全部資料', '📣'],
    ['行政區熱點', a.byDistrict?.[0] ? `${a.byDistrict[0].name}` : '-', a.byDistrict?.[0] ? `${fmt(a.byDistrict[0].count)} 件` : '尚無', '📍'],
    ['熱門點位', a.hotspots?.[0] ? `${a.hotspots[0].name}` : '-', a.hotspots?.[0] ? `${fmt(a.hotspots[0].count)} 件` : '尚無', '🔥'],
    ['資料更新', a.updatedAt || '-', `Sheet gid=${COMPLAINT_GOOGLE_SHEET_GID}`, '🔄']
  ];
  return cards.map(c => `<div class="module-card ok"><span class="icon">${c[3]}</span><b>${esc(c[0])}</b><small>${esc(c[1])}<br>${esc(c[2])}</small><span class="state">陳情趨勢</span></div>`).join('');
}
function complaintCsv(rows = complaintRows()) {
  const header = ['年份','月份','日期','行政區','時段','陳情位置','陳情數','案號','陳情內容','資料來源'];
  const data = [header, ...(rows || []).map(r => [r.year, r.month, r.date, r.district, r.period, r.location, r.count || 1, r.caseNo || '', r.content || '', r.source || ''])];
  return '\uFEFF' + data.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
}
async function fetchComplaintSheetCsv() {
  const id = COMPLAINT_GOOGLE_SHEET_ID;
  if (!id) return { ok:false, error:'missing COMPLAINT_GOOGLE_SHEET_ID' };
  const gid = COMPLAINT_GOOGLE_SHEET_GID || '0';
  const urls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(gid)}`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/pub?gid=${encodeURIComponent(gid)}&single=true&output=csv`
  ];
  let last = null;
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, { redirect:'follow' }, 9000);
      const txt = await r.text();
      if (r.ok && (txt.includes('年份') || txt.includes('year')) && (txt.includes('行政區') || txt.includes('district'))) return { ok:true, url, status:r.status, text:txt, rows:parseCsv(txt).length };
      last = { ok:false, status:r.status, error: txt ? txt.slice(0,160) : 'Google Sheet 目前無可匯入欄位' };
    } catch(e) { last = { ok:false, error:e.message }; }
  }
  return last || { ok:false, error:'無法讀取陳情趨勢 Sheet' };
}
async function syncComplaintsFromSheet() {
  const store = getStore();
  const fetched = await fetchComplaintSheetCsv();
  if (!fetched.ok) {
    const fallback = Array.isArray(store.complaints) && store.complaints.length ? store.complaints : seedComplaintRows();
    store.complaints = fallback;
    store.lastComplaintSync = { at: nowIso(), atTaipei: taipeiTime(), ok:false, cached:true, rows:fallback.length, error:fetched.error || `HTTP ${fetched.status || ''}`.trim(), sheetId: COMPLAINT_GOOGLE_SHEET_ID, gid: COMPLAINT_GOOGLE_SHEET_GID };
    safeJsonWrite(STORE_PATH, store);
    return { ok:false, cached:true, count:fallback.length, error:store.lastComplaintSync.error, trend:aggregateComplaints({}), sheetId:COMPLAINT_GOOGLE_SHEET_ID, gid:COMPLAINT_GOOGLE_SHEET_GID };
  }
  const rows = complaintsFromRows(csvToObjects(fetched.text));
  if (!rows.length) {
    store.lastComplaintSync = { at:nowIso(), atTaipei:taipeiTime(), ok:false, cached:true, rows:(store.complaints || []).length, error:'Sheet 無陳情資料列', sheetId: COMPLAINT_GOOGLE_SHEET_ID, gid: COMPLAINT_GOOGLE_SHEET_GID };
    safeJsonWrite(STORE_PATH, store);
    return { ok:false, cached:true, count:(store.complaints || []).length, error:'Sheet 無陳情資料列', trend:aggregateComplaints({}), sheetId:COMPLAINT_GOOGLE_SHEET_ID, gid:COMPLAINT_GOOGLE_SHEET_GID };
  }
  store.complaints = rows;
  store.lastComplaintSync = { at:nowIso(), atTaipei:taipeiTime(), ok:true, rows:rows.length, sheetId: COMPLAINT_GOOGLE_SHEET_ID, gid: COMPLAINT_GOOGLE_SHEET_GID };
  safeJsonWrite(STORE_PATH, store);
  return { ok:true, count:rows.length, checkedAt:store.lastComplaintSync.atTaipei, trend:aggregateComplaints({}), sheetId:COMPLAINT_GOOGLE_SHEET_ID, gid:COMPLAINT_GOOGLE_SHEET_GID };
}
function complaintStatusData(filter = {}) {
  const store = getStore();
  return { ok:true, sheetId:COMPLAINT_GOOGLE_SHEET_ID, gid:COMPLAINT_GOOGLE_SHEET_GID, sheetUrl:COMPLAINT_GOOGLE_SHEET_URL, lastSync:store.lastComplaintSync || null, trend:aggregateComplaints(filter), count:complaintRows().length };
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8'
  }[ext] || 'application/octet-stream';
}
function serveFile(res, filePath) {
  if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(path.join(ROOT, 'uploads'))) return notFound(res);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return notFound(res);
  res.writeHead(200, { 'content-type': mime(filePath), 'cache-control': 'public, max-age=3600' });
  fs.createReadStream(filePath).pipe(res);
}
function computeMetrics(raw, annualGoal, fallback = {}) {
  const sessions = num(raw?.sessions ?? raw?.場次 ?? fallback.sessions, 0);
  const traffic = num(raw?.traffic ?? raw?.辨識車流 ?? fallback.traffic, 0);
  const exceed = num(raw?.exceed ?? raw?.超標數 ?? fallback.exceed, 0);
  const fines = num(raw?.fines ?? raw?.告發件數 ?? fallback.fines, 0);
  const notices = num(raw?.notices ?? raw?.通知到檢件數 ?? fallback.notices, 0);
  const cases = num(raw?.cases ?? raw?.成案件數 ?? (fines + notices) ?? fallback.cases, 0);
  const pending = Math.max(annualGoal - sessions, 0);
  const rate = annualGoal ? sessions / annualGoal * 100 : 0;
  const exceedRate = traffic ? exceed / traffic * 100 : 0;
  const kpi = sessions ? cases / sessions : 0;
  return { sessions, traffic, exceed, fines, notices, cases, pending, rate, exceedRate, kpi };
}
function normalizeMonthKey(month) {
  const raw = String(month || '').trim();
  const cn = chineseMonthNumber(raw);
  if (cn) return String(cn);
  const alias = normalizeMonthAliasText(raw);
  const m = alias.match(/\d{1,2}/);
  if (!m) return '';
  const n = Number(m[0]);
  return n >= 1 && n <= 12 ? String(n) : '';
}
function summary() {
  const store = getStore();
  const s = store.summary || {};
  const annualGoal = num(env('ANNUAL_GOAL', store.annualGoal || 490), 490);
  const raw = {
    sessions: s.sessions ?? s.dashboardConsistent?.sessions ?? env('RESULTS_COMPLETED_SESSIONS', 301),
    traffic: s.traffic ?? s.dashboardConsistent?.traffic ?? 796510,
    exceed: s.exceed ?? s.dashboardConsistent?.exceed ?? 21511,
    fines: s.fines,
    notices: s.notices,
    cases: s.cases ?? s.dashboardConsistent?.cases ?? env('RESULTS_CASES', 95)
  };
  const metrics = computeMetrics(raw, annualGoal, { sessions: 301, traffic: 796510, exceed: 21511, cases: 95 });
  return { annualGoal, ...metrics, scope: env('RESULTS_SCOPE_LABEL', '全部月份｜全部行政區｜全部時段'), source: '監測成果 Google Sheet', updatedAt: store.lastResultsSync?.at ? taipeiTime(store.lastResultsSync.at) : (store.lastDataSync?.at ? taipeiTime(store.lastDataSync.at) : taipeiTime()), scopeType: 'annual', resultsSheetId: RESULTS_GOOGLE_SHEET_ID, resultsSheetGid: RESULTS_GOOGLE_SHEET_GID };
}
function scopedSummary({ month = '', district = '' } = {}) {
  const store = getStore();
  const annual = summary();
  const annualGoal = annual.annualGoal;
  const monthKey = normalizeMonthKey(month);
  const districtKey = district ? (String(district).endsWith('區') ? String(district) : `${district}區`) : '';
  let raw = null;
  let scope = '全部月份｜全部行政區';
  let scopeType = 'annual';
  let note = '';
  if (monthKey && districtKey && store.monthDistricts && store.monthDistricts[monthKey] && store.monthDistricts[monthKey][districtKey]) {
    raw = store.monthDistricts[monthKey][districtKey];
    scope = `${monthKey}月｜${districtKey}`;
    scopeType = 'monthDistrict';
  } else if (monthKey && store.months && store.months[monthKey]) {
    raw = store.months[monthKey];
    scope = `${monthKey}月｜${districtKey || '全市'}`;
    scopeType = 'month';
    if (districtKey) note = '指定月份內查無該行政區資料，已顯示該月份全市資料。';
  } else if (districtKey && store.districts && store.districts[districtKey]) {
    raw = store.districts[districtKey];
    scope = `全部月份｜${districtKey}`;
    scopeType = 'district';
  }
  if (!raw) {
    return { ...annual, scope, requestedMonth: monthKey, requestedDistrict: districtKey, scopeType, note: monthKey || districtKey ? '查無指定篩選資料，已暫以全年度資料呈現。' : '' };
  }
  const metrics = computeMetrics(raw, annualGoal, annual);
  return { annualGoal, ...metrics, scope, source: '監測成果 Google Sheet', updatedAt: store.lastResultsSync?.at ? taipeiTime(store.lastResultsSync.at) : (store.lastDataSync?.at ? taipeiTime(store.lastDataSync.at) : taipeiTime()), requestedMonth: monthKey, requestedDistrict: districtKey, scopeType, note, resultsSheetId: RESULTS_GOOGLE_SHEET_ID, resultsSheetGid: RESULTS_GOOGLE_SHEET_GID };
}

function progressText() {
  const s = summary();
  return `【計畫執行進度】

我幫你整理目前最新成果。
範圍：${s.scope}
更新：${s.updatedAt}

年度目標：${fmt(s.annualGoal)} 場
已完成：${fmt(s.sessions)} 場
待執行：${fmt(s.pending)} 場
達成率：${fmt(s.rate, 1)}%

車流辨識：${fmt(s.traffic)} 件
超標件數：${fmt(s.exceed)} 件
超標率：${fmt(s.exceedRate, 2)}%

成案件數：${fmt(s.cases)} 件
KPI 成效：${fmt(s.kpi, 2)}

口徑：成案件數 = 告發件數 + 通知到檢件數`;
}

function caseTrackingMessage() {
  return withQuick({ type: 'template', altText: '案件追蹤平台', template: { type: 'buttons', title: '案件追蹤平台', text: '開啟超標案件行政流程追蹤查詢，掌握案件處理狀態與流程進度。', actions: [
    { type: 'uri', label: '開啟案件追蹤', uri: CASE_TRACKING_URL }
  ] } }, ['進度','成果查詢','外勤回報','法規中心']);
}
function kpiText() {
  // 相容舊指令：原 KPI 報表已改為案件追蹤入口。
  return caseTrackingMessage();
}


function parseCookieHeader(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(part => {
    const idx = part.indexOf('=');
    if (idx < 0) return [part, ''];
    return [decodeURIComponent(part.slice(0, idx)), decodeURIComponent(part.slice(idx + 1))];
  }));
}
function adminSessionSecret() {
  return env('SESSION_SECRET', env('LINE_CHANNEL_SECRET', 'ntpc-admin-session-secret'));
}
function signAdminSession(payload) {
  return crypto.createHmac('sha256', adminSessionSecret()).update(payload).digest('hex');
}
function createAdminSessionValue() {
  const payload = JSON.stringify({ exp: Date.now() + ADMIN_SESSION_MINUTES * 60 * 1000, nonce: crypto.randomBytes(8).toString('hex') });
  const b64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${b64}.${signAdminSession(b64)}`;
}
function verifyAdminSessionValue(value) {
  const [b64, sig] = String(value || '').split('.');
  if (!b64 || !sig) return false;
  const expected = signAdminSession(b64);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch { return false; }
  try {
    const data = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    return Number(data.exp || 0) > Date.now();
  } catch { return false; }
}
function isAdminAuthed(req) {
  const cookies = parseCookieHeader(req);
  return verifyAdminSessionValue(cookies[ADMIN_COOKIE_NAME]);
}
function setAdminSessionCookie(res) {
  const val = createAdminSessionValue();
  const maxAge = ADMIN_SESSION_MINUTES * 60;
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=${encodeURIComponent(val)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`);
}
function clearAdminSessionCookie(res) {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}
function serverEscHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
}
function adminGatePage(error = '') {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>後端平台驗證</title><style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans TC','Microsoft JhengHei',sans-serif;background:linear-gradient(145deg,#eaf7ff,#f7fbff 55%,#dff4ff);color:#08305c}
    .card{width:min(520px,calc(100vw - 36px));background:rgba(255,255,255,.88);border:1px solid rgba(255,255,255,.95);border-radius:30px;box-shadow:0 28px 80px rgba(10,70,130,.18);padding:28px;backdrop-filter:blur(12px)}
    h1{margin:0 0 8px;font-size:30px}.sub{margin:0 0 22px;color:#58718b;line-height:1.6}.field{display:flex;gap:10px}.field input{flex:1;border:1px solid #bdd7ef;border-radius:18px;padding:15px 16px;font-size:22px;outline:none}.field button{border:0;border-radius:18px;padding:0 24px;background:#075bb6;color:#fff;font-size:18px;font-weight:800}
    .err{margin:12px 0 0;color:#b3261e;font-weight:800}.hint{margin-top:16px;font-size:14px;color:#6d8399}
  </style></head><body><main class="card"><h1>後端平台驗證</h1><p class="sub">請輸入管理密碼後進入系統後台。</p><form method="post" action="/admin-login" class="field"><input name="password" type="password" inputmode="numeric" placeholder="請輸入密碼" autofocus><button>進入</button></form>${error ? `<p class="err">${serverEscHtml(error)}</p>` : ''}<p class="hint">此入口由 Rich Menu 隱藏功能啟動。</p></main></body></html>`;
}
function adminGateUrl() {
  return `${PUBLIC_BASE_URL}/admin-gate.html`;
}
function handleAdminHiddenTap(source) {
  const key = lineSourceKey(source);
  const now = Date.now();
  const rec = pendingAdminHiddenTap.get(key) || { count: 0, updatedAt: 0 };
  const nextCount = now - rec.updatedAt > 12000 ? 1 : rec.count + 1;
  pendingAdminHiddenTap.set(key, { count: nextCount, updatedAt: now });
  if (nextCount >= 3) {
    pendingAdminHiddenTap.delete(key);
    return { type:'template', altText:'後端平台驗證入口', template:{ type:'buttons', title:'後端平台', text:'已啟動隱藏入口。請點選下方按鈕，輸入密碼後進入後端平台。', actions:[{ type:'uri', label:'開啟後端平台', uri: adminGateUrl() }] } };
  }
  return `已偵測隱藏操作 ${nextCount}/3。請在 12 秒內再點右下角 ${3-nextCount} 次。`;
}

function lineSourceKey(source) {
  if (!source) return 'anonymous';
  return source.userId || source.groupId || source.roomId || 'anonymous';
}
function isSheetLinkKeyword(text) {
  const q = String(text || '').replace(/\s+/g, '').toLowerCase();
  return /(googlesheet|google試算表|試算表連結|sheet連結|sheet網址|表單連結|資料表連結|開啟sheet|開啟試算表|開啟表單|google表單|google表格|google雲端表單|成果表單|外勤表單|設備表單|陳情表單)/i.test(q);
}
function sheetLinkRows() {
  return [
    ['成果統計 Sheet', RESULTS_GOOGLE_SHEET_URL],
    ['外勤回報 Sheet', FIELD_GOOGLE_SHEET_URL],
    ['設備管理 Sheet', EQUIPMENT_GOOGLE_SHEET_URL],
    ['陳情趨勢 Sheet', COMPLAINT_GOOGLE_SHEET_URL]
  ].filter(x => x[1]);
}
function sheetLinksText() {
  const rows = sheetLinkRows();
  const now = taipeiTime();
  return `【Google Sheet 連結】\n密碼驗證完成。\n時間：${now}\n\n${rows.map((r,i)=>`${i+1}. ${r[0]}\n${r[1]}`).join('\n\n')}\n\n提醒：此連結涉及作業資料，請勿轉傳給非授權人員。`;
}
function createSheetAuthToken(source) {
  const sourceKey = lineSourceKey(source);
  const existed = pendingSheetLinkBySource.get(sourceKey);
  if (existed && pendingSheetLinkAuth.has(existed)) {
    const rec = pendingSheetLinkAuth.get(existed);
    if (Date.now() - rec.createdAt <= SHEET_LINK_SESSION_MINUTES * 60 * 1000) return existed;
  }
  const token = crypto.randomBytes(18).toString('hex');
  pendingSheetLinkAuth.set(token, { sourceKey, createdAt: Date.now() });
  pendingSheetLinkBySource.set(sourceKey, token);
  return token;
}
function cleanupSheetAuthTokens() {
  const ttl = SHEET_LINK_SESSION_MINUTES * 60 * 1000;
  for (const [token, rec] of pendingSheetLinkAuth.entries()) {
    if (!rec || Date.now() - rec.createdAt > ttl) {
      pendingSheetLinkAuth.delete(token);
      if (rec?.sourceKey && pendingSheetLinkBySource.get(rec.sourceKey) === token) pendingSheetLinkBySource.delete(rec.sourceKey);
    }
  }
}
function sheetAuthUrl(token) {
  return `${PUBLIC_BASE_URL}/sheet-auth.html?token=${encodeURIComponent(token)}`;
}
function requestSheetLinkPassword(source) {
  cleanupSheetAuthTokens();
  const token = createSheetAuthToken(source);
  const url = sheetAuthUrl(token);
  return withQuick({ type:'template', altText:'Google Sheet 安全驗證', template:{ type:'buttons', title:'Google Sheet 安全驗證', text:`請點選下方按鈕，在驗證視窗輸入密碼。通過後才會顯示成果、外勤、設備與陳情 Sheet 連結。有效時間 ${SHEET_LINK_SESSION_MINUTES} 分鐘。`, actions:[{ type:'uri', label:'開啟驗證視窗', uri:url }] } }, ['指令說明','選單']);
}
function verifySheetLinkPassword(text, source) {
  const q = String(text || '').replace(/\s+/g, '');
  if (q !== SHEET_LINK_PASSWORD) return null;
  return '【Google Sheet 安全驗證】\n請勿直接在聊天室輸入密碼。\n請先輸入「Google Sheet 連結」，再點選「開啟驗證視窗」完成驗證。';
}
function validateSheetAuthToken(token) {
  cleanupSheetAuthTokens();
  const rec = pendingSheetLinkAuth.get(String(token || ''));
  if (!rec) return { ok:false, error:'驗證連結已失效，請回 LINE 重新輸入「Google Sheet 連結」。' };
  return { ok:true, token:String(token), rec };
}
function sheetAuthPage(urlObj) {
  const token = urlObj.searchParams.get('token') || '';
  const valid = validateSheetAuthToken(token);
  const safeToken = esc(token);
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Sheet 安全驗證</title><style>
    :root{--bg:#eff8ff;--blue:#0759b7;--cyan:#16bfe3;--text:#113154;--mut:#5c718a;--line:#c5e7f7;--card:#ffffff}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Arial,'Microsoft JhengHei','Noto Sans TC',sans-serif;color:var(--text);background:linear-gradient(160deg,#eefaff 0%,#dff4ff 52%,#f8fcff 100%)}
    body:before{content:'';position:fixed;inset:0;background:radial-gradient(circle at 20% 10%,rgba(22,191,227,.22),transparent 32%),radial-gradient(circle at 90% 0%,rgba(7,89,183,.18),transparent 36%);pointer-events:none}
    main{position:relative;max-width:860px;margin:0 auto;padding:28px}.hero{display:flex;gap:18px;align-items:center;padding:24px 24px;border-radius:28px;background:rgba(255,255,255,.82);border:1px solid rgba(255,255,255,.9);box-shadow:0 24px 60px rgba(20,90,140,.15);backdrop-filter:blur(12px)}
    .mark{width:68px;height:68px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(135deg,var(--blue),var(--cyan));color:#fff;font-size:34px;font-weight:900}.hero h1{margin:0;font-size:30px}.hero p{margin:6px 0 0;color:var(--mut);line-height:1.6}.card{margin-top:18px;padding:24px;border-radius:28px;background:rgba(255,255,255,.88);border:1px solid var(--line);box-shadow:0 18px 42px rgba(20,90,140,.12)}
    label{display:block;font-weight:900;margin-bottom:10px}input{width:100%;font-size:22px;padding:16px 18px;border:1px solid var(--line);border-radius:18px;outline:none;background:#fff;color:var(--text)}input:focus{border-color:var(--cyan);box-shadow:0 0 0 5px rgba(22,191,227,.16)}button{margin-top:14px;width:100%;border:0;border-radius:18px;padding:16px 18px;font-size:19px;font-weight:900;color:#fff;background:linear-gradient(135deg,var(--blue),var(--cyan));box-shadow:0 12px 28px rgba(7,89,183,.22)}.hint{color:var(--mut);line-height:1.7}.error{color:#b42318;background:#fff1f1;border:1px solid #ffd6d6;border-radius:16px;padding:12px;margin-top:12px}.links{display:grid;gap:12px;margin-top:16px}.links a{display:block;text-decoration:none;padding:17px 18px;border:1px solid var(--line);border-radius:18px;background:#fff;color:var(--blue);font-weight:900}.links span{display:block;color:var(--mut);font-size:13px;margin-top:4px}.locked{opacity:.68}.footer{margin-top:18px;text-align:center;color:var(--mut);font-size:13px}
  </style></head><body><main><section class="hero"><div class="mark">🔐</div><div><h1>Google Sheet 安全驗證</h1><p>此頁僅提供授權人員開啟作業試算表。密碼不會顯示在 LINE 對話中。</p></div></section><section class="card ${valid.ok?'':'locked'}"><p class="hint">狀態：${valid.ok?'等待密碼驗證':'驗證連結失效'}</p>${valid.ok?`<label for="pwd">請輸入存取密碼</label><input id="pwd" type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="請輸入密碼"><button id="btn">驗證並顯示連結</button><div id="msg"></div><div id="links" class="links"></div>`:`<div class="error">${esc(valid.error)}</div>`}</section><div class="footer">Sheet Secure Gateway｜有效時間 ${SHEET_LINK_SESSION_MINUTES} 分鐘</div></main><script>
  const token=${JSON.stringify(token)};
  const btn=document.getElementById('btn'), pwd=document.getElementById('pwd'), msg=document.getElementById('msg'), links=document.getElementById('links');
  async function verify(){
    if(!pwd||!pwd.value.trim()){ msg.innerHTML='<div class="error">請先輸入密碼。</div>'; return; }
    btn.disabled=true; btn.textContent='驗證中...';
    try{
      const r=await fetch('/api/sheet-auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,password:pwd.value.trim()})});
      const data=await r.json();
      if(!data.ok){ msg.innerHTML='<div class="error">'+(data.error||'驗證失敗')+'</div>'; btn.disabled=false; btn.textContent='驗證並顯示連結'; return; }
      msg.innerHTML='<p class="hint">驗證完成，請依作業目的開啟對應 Sheet。</p>';
      links.innerHTML=(data.links||[]).map(x=>'<a target="_blank" rel="noopener" href="'+x.url+'">'+x.name+'<span>'+x.url+'</span></a>').join('');
      btn.style.display='none'; pwd.style.display='none';
    }catch(e){ msg.innerHTML='<div class="error">系統連線異常，請稍後再試。</div>'; btn.disabled=false; btn.textContent='驗證並顯示連結'; }
  }
  if(btn){btn.addEventListener('click',verify);pwd.addEventListener('keydown',e=>{if(e.key==='Enter')verify();});}
</script></body></html>`;
}
function verifySheetAuthRequest(body = {}) {
  const token = String(body.token || '');
  const password = String(body.password || '').replace(/\s+/g, '');
  const valid = validateSheetAuthToken(token);
  if (!valid.ok) return valid;
  if (password !== SHEET_LINK_PASSWORD) return { ok:false, error:'密碼錯誤，請重新輸入。' };
  pendingSheetLinkAuth.delete(token);
  if (valid.rec?.sourceKey && pendingSheetLinkBySource.get(valid.rec.sourceKey) === token) pendingSheetLinkBySource.delete(valid.rec.sourceKey);
  return { ok:true, verifiedAt:taipeiTime(), links:sheetLinkRows().map(([name,url]) => ({ name, url })) };
}

function menuText() {
  return `【新北市噪音車管理系統】

Rich Menu 已改為可掀式兩頁：外勤/內勤、法規/資訊。你也可以直接用口語輸入。

我可以這樣查：
・看進度 / 目前成果
・4月成果 / 本月月報
・淡水區成效 / 板橋區月報
・今天機況 / 哪些機台在線
・設備到期 / 比測到期
・案件追蹤 / 超標案件進度
・陳情趨勢 / 4月陳情 / 淡水區陳情
・法規中心 / 罰則 / NIEA82B
・百大熱點 / 淡水區百大
・Google Sheet 連結（開啟安全驗證視窗）
・車牌 ABC-1234（功能保留，Rich Menu 不顯示）`;
}

function hotspotsText(msg) {
  const store = getStore();
  const items = Array.isArray(store.hotspots) ? store.hotspots : [];
  const rankMatch = msg.match(/(?:第|排名)\s*(\d+)\s*(?:名)?/);
  if (/計算|公式|評分/.test(msg)) return `【百大計算方式】\n\n綜合分數依檢舉量、市政信箱、超標車輛、歷年執行次數、夜間比例與布點缺口加權。\n分級：S 1–10、A 11–30、B 31–60、C 61–100。`;
  if (rankMatch) {
    const r = Number(rankMatch[1]);
    const h = items.find(x => Number(x.rank) === r);
    if (!h) return `查無百大第 ${r} 名資料。`;
    return `【百大點位詳細】\n排名：${h.rank}\n等級：${h.grade || '-'}\n行政區：${h.district || '-'}\n路段：${h.route || h.name || '-'}\n代表位置：${h.location || '-'}\n綜合分數：${h.score ?? '-'}\n檢舉量：${h.complaints ?? '-'}\n超標車輛：${h.exceedVehicles ?? '-'}\n歷年執行：${h.executions ?? '-'}\n夜間比例：${h.nightRatio != null ? fmt(Number(h.nightRatio)*100,1)+'%' : '-'}\n評分重點：${h.scoringFocus || '-'}`;
  }
  const district = (msg.match(/(板橋|三重|中和|新莊|土城|淡水|汐止|新店|樹林|蘆洲|五股|泰山|林口|八里|三峽|金山|萬里|三芝|石門)區?/) || [])[1];
  let list = items;
  let title = '全市百大 Top10';
  if (district) { list = items.filter(x => String(x.district || '').includes(district)); title = `${district}區百大點位`; }
  list = list.slice(0, 10);
  if (!list.length) return `查無${title}資料。`;
  return `【${title}】\n` + list.map(h => `${h.rank}. ${h.district || ''} ${h.route || h.name || ''}\n   ${h.location || ''}｜${h.grade || '-'}｜分數 ${h.score ?? '-'}`).join('\n');
}
function fieldText(msg) {
  return { type: 'template', altText: '外勤回報平台', template: { type: 'buttons', title: '外勤回報平台', text: '開啟外勤回報、現場照片、回報彙整與匯出。告示牌距離 100–300m 為建議區間，非區間僅提醒不阻擋。', actions: [
    { type: 'uri', label: '開啟外勤平台', uri: FIELD_REPORT_URL }
  ] } };
}
function photoSearchText(msg) {
  const records = getPhotoRecords();
  const key = msg.replace(/照片|架設照片|現場照|查詢|搜尋/g, '').trim();
  let list = records;
  if (key) {
    const norm = key.toUpperCase().replace('-', '_');
    list = records.filter(r => [r.sessionNo, r.deviceId, r.district, r.location].some(v => String(v || '').toUpperCase().replace('-', '_').includes(norm)));
  }
  list = list.slice(-5).reverse();
  const summaryText = list.length
    ? list.map(r => {
        const count = (r.photos || []).length;
        const completion = photoCompletion(r);
        return `${r.sessionNo || '-'}｜${r.district || '-'}｜${r.deviceId || '-'}\n地點：${r.location || '-'}\n照片：${count} 張｜完整度：${completion}%\n距離：${distanceReminder(r.signDistance)}`;
      }).join('\n\n')
    : '目前查無符合條件的照片紀錄。';
  return { type: 'template', altText: '外勤照片查詢', template: { type: 'buttons', title: '外勤照片查詢', text: summaryText.slice(0, 160), actions: [
    { type: 'uri', label: '開啟外勤照片', uri: `${FIELD_REPORT_URL}/field-photos.html` }
  ] } };
}
function reportText(msg) {
  const month = extractMonthFromMessage(msg);
  const districtFull = extractDistrictFromMessage(msg);
  const s = scopedSummary({ month, district: districtFull });
  const range = s.scope || `${month ? month + '月' : '本月'}｜${districtFull || '全市'}`;
  const note = s.note ? `\n備註：${s.note}` : '';
  return `【成果執行數據】\n範圍：${range}\n更新：${s.updatedAt}\n\n執行場次：${fmt(s.sessions)} 場\n車流辨識：${fmt(s.traffic)} 件\n超標件數：${fmt(s.exceed)} 件\n告發件數：${fmt(s.fines)} 件\n通知到檢：${fmt(s.notices)} 件\n成案件數：${fmt(s.cases)} 件\n超標率：${fmt(s.exceedRate, 2)}%\nKPI：${fmt(s.kpi, 2)}${note}\n\n口徑：成案件數 = 告發件數 + 通知到檢件數。`;
}


function consistencyText() {
  const records = getPhotoRecords();
  const store = getStore();
  const s = summary();
  return `【資料一致性檢查】\n\n成果摘要場次：${fmt(s.sessions)}\n成果成案件數：${fmt(s.cases)}\n百大點位筆數：${Array.isArray(store.hotspots) ? store.hotspots.length : 0}\n外勤照片紀錄：${records.length}\n最後同步：${store.lastDataSync?.at ? taipeiTime(store.lastDataSync.at) : '尚未同步'}\n\n狀態：系統可讀取本機快取；Google Sheet 若暫時無法存取，不會中斷 LINE 回覆。`;
}
function legalText(msg) {
  if (/新聞/.test(msg)) return newsText();
  if (/法條11/.test(msg)) return '【噪音管制法第11條】主管機關得視噪音源性質及管制需要，採取相關管制措施。';
  if (/法條13/.test(msg)) return '【噪音管制法第13條】交通工具噪音管制涉及檢驗、通知到檢及相關處理程序。';
  if (/法條26/.test(msg)) return '【噪音管制法第26條】違反噪音管制規定者，得依法裁罰並命限期改善。';
  if (/法條28/.test(msg)) return '【噪音管制法第28條】規避、妨礙或拒絕檢查者，得依法處分。';
  if (/82B|NIEA/.test(msg)) return '【NIEA P211.82B】聲音照相相關量測方法、比測與品管作業應依公告方法及設備檢校紀錄執行。';
  return `【法規中心】\n可查：法條11、法條13、法條26、法條28、聲音照相指引、NIEA P211.82B、新聞。`;
}
function newsText() {
  const news = getStore().news || {};
  const items = Array.isArray(news.items) ? news.items.slice(0, 5) : [];
  if (!items.length) return `【噪音車新聞】\n目前無新聞快取，請稍後再查詢。`;
  return `【噪音車新聞】\n更新時間：${news.updatedAtTaipei || taipeiTime(news.updatedAt || new Date())}\n\n` + items.map((n, i) => `■ ${i + 1}. ${n.title || '新聞標題未取得'}\n來源：${n.source || '-'}\n摘要：${n.summary || '請點選連結查看完整內容。'}\n連結：${n.url || 'https://news.google.com/search?q=噪音車%20聲音照相'}`).join('\n\n');
}
function equipmentText() {
  const store = getStore();
  const eq = Array.isArray(store.equipment) ? store.equipment : [];
  if (!eq.length) return '【設備到期提醒】\n目前尚未同步設備 Google Sheet，請由後台執行「同步設備 Sheet」。';
  const counts = eq.reduce((a, e) => {
    const l = String(e.light || '⚪未填');
    const key = l.includes('🔴') ? 'red' : (l.includes('🟡') ? 'yellow' : (l.includes('🟢') ? 'green' : 'gray'));
    a[key] = (a[key] || 0) + 1;
    return a;
  }, {});
  const header = `【設備到期提醒】\n🟢正常 ${counts.green || 0}｜🟡注意 ${counts.yellow || 0}｜🔴異常 ${counts.red || 0}｜⚪未填 ${counts.gray || 0}`;
  const rows = eq.slice(0, 12).map(e => `${e.id || '-'}｜${e.light || '⚪未填'}\n比測到期：${e.bitestDue || '-'}\n噪音計到期：${e.soundMeterDue || '-'}\n風速計到期：${e.windMeterDue || '-'}`).join('\n\n');
  const updated = store.lastEquipmentSync?.atTaipei ? `\n\n更新時間：${store.lastEquipmentSync.atTaipei}` : '';
  return `${header}\n\n${rows}${updated}`;
}
function plateText(msg) {
  const plate = (msg.match(/[A-Z]{2,4}[-_ ]?\d{3,4}/i) || [])[0];
  if (!plate) return '【車號追蹤】\n請輸入車牌，例如：ABC-1234。\n進階軌跡分析需匯入車牌、日期時間、行政區、點位、音量、處理結果。';
  const data = getStore().plates || {};
  const key = plate.toUpperCase().replace(/[-_ ]/g, '-');
  const hit = data[key] || data[key.replace('-', '')] || null;
  if (!hit) return `【車號追蹤】\n車牌：${plate.toUpperCase()}\n目前查無快取紀錄。`;
  return `【車號追蹤】\n車牌：${plate.toUpperCase()}\n累計出現：${hit.count || '-'} 次\n最高音量：${hit.maxDb || '-'} dB\n最近出現：${hit.lastSeen || '-'}\n常見行政區：${hit.districts || '-'}`;
}

function platformButtonMessage(kind = 'all') {
  const configs = {
    dashboard: { title: '成果查詢平台', text: '開啟監測成果、月份與行政區統計。', label: '開啟成果平台', uri: DASHBOARD_URL },
    field: { title: '外勤回報平台', text: '開啟外勤回報、照片上傳、回報彙整與匯出。', label: '開啟外勤平台', uri: FIELD_REPORT_URL },
    hotspot: { title: '百大熱點平台', text: '開啟百大熱點、建議布點與缺口分析。', label: '開啟百大熱點', uri: HOTSPOT_URL },
    case: { title: '案件追蹤平台', text: '開啟超標案件行政流程追蹤查詢。', label: '開啟案件追蹤', uri: CASE_TRACKING_URL }
  };
  if (configs[kind]) {
    const c = configs[kind];
    return withQuick({ type: 'template', altText: c.title, template: { type: 'buttons', title: c.title.slice(0, 40), text: c.text.slice(0, 60), actions: [{ type: 'uri', label: c.label.slice(0, 20), uri: c.uri }] } }, ['進度','案件追蹤','法規中心','設備管理']);
  }
  return withQuick({ type: 'template', altText: '平台快速入口', template: { type: 'buttons', title: '平台快速入口', text: '請直接點選要開啟的平台。', actions: [
    { type: 'uri', label: '成果查詢', uri: DASHBOARD_URL },
    { type: 'uri', label: '外勤回報', uri: FIELD_REPORT_URL },
    { type: 'uri', label: '百大熱點', uri: HOTSPOT_URL },
    { type: 'uri', label: '案件追蹤', uri: CASE_TRACKING_URL }
  ] } }, ['進度','案件追蹤','法規中心']);
}

const QUICK_MAIN = ['進度','4月成果','陳情趨勢','淡水區月報','即時機況','設備到期','案件追蹤','法規中心','百大點位'];
const QUICK_MONTHS = ['本月月報','上月月報','1月','2月','3月','4月','5月','6月','行政區選單'];
const QUICK_DISTRICTS = ['板橋區','三重區','新莊區','淡水區','汐止區','土城區','新店區','三峽區','百大點位'];
const QUICK_LEGAL = ['法條11','法條13','法條26','法條28','罰則','聲音照相指引','NIEA82B','新聞'];
const QUICK_FIELD = ['外勤回報','架設點位','架設照片','資料一致性檢查'];

function quickReply(labels) {
  const seen = new Set();
  const items = [];
  for (const raw of labels || []) {
    const label = String(raw || '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    items.push({ type: 'action', action: { type: 'message', label: label.slice(0, 20), text: label } });
    if (items.length >= 13) break;
  }
  return items.length ? { items } : undefined;
}
function textMessage(text, labels) {
  const m = { type: 'text', text: String(text || '').slice(0, 4900) };
  const qr = quickReply(labels);
  if (qr) m.quickReply = qr;
  return m;
}
function withQuick(reply, labels) {
  if (!labels || !labels.length) return reply;
  if (typeof reply === 'string') return textMessage(reply, labels);
  if (reply && typeof reply === 'object') {
    const qr = quickReply(labels);
    if (qr) reply.quickReply = qr;
  }
  return reply;
}
function monthMenuText(){ return '【月份查詢】\n請點選下方月份，或輸入例如「5月」、「本月月報」。'; }
function districtMenuText(){ return '【行政區查詢】\n請點選下方行政區，或輸入例如「淡水區」、「板橋區」。'; }
function lineMessagesFor(reply) {
  if (Array.isArray(reply)) return reply;
  if (reply && typeof reply === 'object' && reply.type) return [reply];
  return [textMessage(String(reply || ''), [])];
}
function previewReply(reply) {
  const msgs = lineMessagesFor(reply);
  return msgs.map(m => {
    const quick = (m.quickReply?.items || []).map(i => i.action?.label).filter(Boolean);
    const quickText = quick.length ? `\n\n快速選項：${quick.join('｜')}` : '';
    if (m.type === 'template') {
      const actions = ((m.template || {}).actions || []).map(a => `・${a.label}`).join('\n');
      return `${m.altText || 'LINE 按鈕'}\n${actions}${quickText}`;
    }
    return `${m.text || m.altText || 'LINE 訊息'}${quickText}`;
  }).join('\n\n');
}

const DISTRICT_RE = /(板橋|三重|中和|永和|新莊|土城|淡水|汐止|新店|樹林|蘆洲|五股|泰山|林口|八里|三峽|鶯歌|金山|萬里|三芝|石門|瑞芳|貢寮|雙溪|平溪|坪林|烏來|深坑|石碇)區?/;
function currentTaipeiMonth(offset = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'numeric' }).formatToParts(now);
  const y = Number(parts.find(x => x.type === 'year')?.value || now.getFullYear());
  const m = Number(parts.find(x => x.type === 'month')?.value || (now.getMonth()+1));
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.getUTCMonth() + 1;
}
const CN_MONTH_MAP = { '一':1, '二':2, '兩':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10, '十一':11, '十二':12 };
const CN_MONTH_RE = /(十一|十二|十|一|二|兩|三|四|五|六|七|八|九)\s*月(?:份)?/g;
function chineseMonthNumber(text) {
  const m = String(text || '').replace(/\s+/g, '').match(/(十一|十二|十|一|二|兩|三|四|五|六|七|八|九)月(?:份)?/);
  return m ? CN_MONTH_MAP[m[1]] : null;
}
function normalizeMonthAliasText(text) {
  return String(text || '')
    .replace(/月份/g, '月')
    .replace(CN_MONTH_RE, (_, cn) => `${CN_MONTH_MAP[cn]}月`);
}
function extractMonthFromMessage(text) {
  const raw = String(text || '');
  const m = normalizeMonthAliasText(raw);
  if (/上個月|上月|前一月/.test(raw)) return String(currentTaipeiMonth(-1));
  if (/這個月|這月|本月|當月|最近一個月/.test(raw)) return String(currentTaipeiMonth(0));
  const digit = (m.match(/(1[0-2]|0?[1-9])\s*月/) || [])[1];
  if (digit) return String(Number(digit));
  const cn = chineseMonthNumber(raw);
  return cn ? String(cn) : '';
}
function extractDistrictFromMessage(text) {
  const d = (String(text || '').match(DISTRICT_RE) || [])[1];
  return d ? `${d}區` : '';
}
function maybeDeviceId(text) {
  const m = String(text || '').match(/(?:OE[-_]?ZB|ZB)\s*0*([0-9]{1,3})/i);
  return m ? `OE_ZB${String(Number(m[1])).padStart(3,'0')}` : '';
}
function isHeavyLineQuery(text) {
  const q = normalizeMonthAliasText(text);
  return /(進度|統計|月報|成果|陳情|投訴|民怨|1999|市政信箱|行政區|\d{1,2}\s*月|[一二兩三四五六七八九十]{1,2}\s*月|本月|上月|設備|機況|上線|到期|百大|熱點|外勤|照片|法規|新聞|案件|車號|車牌|軌跡|查|看|給我|幫我)/.test(q);
}
function friendlyNotFoundText() {
  return `我沒有找到完全相符的查詢。你可以改用下方快速選項，或輸入：

・今天機況
・4月成果 / 四月成果
・淡水區月報
・四月陳情 / 4月陳情
・陳情趨勢
・設備到期
・法規中心
・案件追蹤`;
}
function lineReplyFor(msg, source = null) {
  const m = String(msg || '').trim();
  if (m === ADMIN_HIDDEN_TAP_TOKEN) return handleAdminHiddenTap(source);
  const compact = m.replace(/\s+/g, '').toLowerCase();
  const sheetPasswordResult = verifySheetLinkPassword(m, source);
  if (sheetPasswordResult) return withQuick(sheetPasswordResult, ['Google Sheet 連結','選單']);
  if (isSheetLinkKeyword(m)) return requestSheetLinkPassword(source);
  const month = extractMonthFromMessage(m);
  const districtFull = extractDistrictFromMessage(m);
  const deviceId = maybeDeviceId(m);
  const q = normalizeMonthAliasText(m);

  if (!m || /^(選單|menu|help|指令|指令說明|操作說明|怎麼用|可以查什麼)$/i.test(q)) return withQuick(menuText(), QUICK_MAIN);
  if (/^(月份選單|月份查詢|月份|選月份|查月份)$/i.test(m)) return textMessage(monthMenuText(), QUICK_MONTHS);
  if (/^(行政區選單|行政區查詢|行政區|選行政區|查行政區|區域查詢)$/i.test(m)) return textMessage(districtMenuText(), QUICK_DISTRICTS);

  if (/^(平台入口|平台|三平台|四平台|平台架構|平台導覽)$/i.test(m)) return platformButtonMessage('all');
  if (/^(成果查詢|成果平台|監測平台|開成果|成果系統)$/.test(m)) return platformButtonMessage('dashboard');
  if (/^(外勤回報|外勤平台|填寫回報|我要回報|填外勤|外勤表單)$/.test(m)) return platformButtonMessage('field');
  if (/^(百大點位|百大熱點|熱點平台|開百大)$/.test(m)) return platformButtonMessage('hotspot');
  if (/^(案件追蹤|超標案件|行政流程|案件流程|流程追蹤|案件進度|案件狀態|查案件|KPI報表|KPI|kpi)$/.test(m)) return platformButtonMessage('case');

  if (/陳情|投訴|民怨|1999|市政信箱|熱門陳情|陳情熱點|熱點陳情/.test(q)) return withQuick(complaintTrendText(m), ['陳情趨勢','4月陳情','淡水區陳情','夜間陳情','熱門陳情點位']);

  if (/即時機況|目前機況|今天機況|現場機況|機台機況|設備機況|機台狀態|設備狀態|設備即時|上線監測|在線|線上|哪台在線|哪些機台|機台在哪|設備在哪/.test(m)) return withQuick(liveEquipmentText(), ['設備管理','即時機況','外勤回報','進度']);
  if (/設備到期|到期提醒|快到期|過期|比測|噪音計|風速計|校正|檢定|設備管理|設備查詢|查.*設備|看.*設備/.test(m)) return withQuick(equipmentText(), ['即時機況','設備管理','進度','法規中心']);

  if (/百大|熱點|排名|第\d+名|前十|top10|Top10|布點建議|建議點位/.test(m)) return withQuick(hotspotsText(m), [...QUICK_DISTRICTS, '百大公式']);

  if (/^(進度|計畫進度|成果摘要|統計查詢|目前成果|今年成果|年度成果)$/.test(q) || /看.*(進度|成果|統計)|查.*(進度|成果|統計)|現在.*(進度|成果)/.test(q)) return withQuick(progressText(), [...QUICK_MONTHS, ...QUICK_DISTRICTS.slice(0,4), '案件追蹤']);
  if (month || /月報|本月摘要|成果月報|月成果|月統計|這個月|本月|上月/.test(q)) return withQuick(reportText(m), [...QUICK_MONTHS, ...QUICK_DISTRICTS.slice(0,4)]);
  if (districtFull || /行政區|哪一區|區域成果|區域成效/.test(m)) return withQuick(reportText(m), [...QUICK_DISTRICTS, '百大點位']);

  if (/照片|架設照|現場照|相片|圖檔|圖片|照片紀錄/.test(m)) return withQuick(photoSearchText(m), QUICK_FIELD);
  if (/外勤|架設點位|架設紀錄|回報紀錄|場次查詢|場次資料|^S\d+/i.test(m) || deviceId) return withQuick(fieldText(m), QUICK_FIELD);
  if (/一致性|同步檢查|資料檢查|資料有沒有同步|資料正常嗎|系統正常嗎/.test(m)) return withQuick(consistencyText(), ['進度','案件追蹤','架設照片','百大點位']);
  if (/法規|法條|指引|82B|NIEA|新聞|修法|聲音照相|法律|規定|罰則|罰多少|裁罰|依據/.test(m)) return withQuick(legalText(m), QUICK_LEGAL);
  if (/車號|車牌|軌跡|追車|查車|車輛|[A-Z]{2,4}[-_ ]?\d{3,4}/i.test(m)) return withQuick(plateText(m), ['車號追蹤','進度','案件追蹤']);

  return withQuick(friendlyNotFoundText(), ['進度','4月成果','淡水區月報','即時機況','設備到期','法規中心','案件追蹤']);
}

async function replyLine(replyToken, messageText) {
  const token = env('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!token || !replyToken) return false;
  const body = { replyToken, messages: lineMessagesFor(messageText).slice(0, 5) };
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body)
  });
  return r.ok;
}
async function startLineLoading(chatId, seconds = 5) {
  const token = env('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!token || !chatId || env('LINE_LOADING_INDICATOR', 'true') === 'false') return false;
  try {
    const r = await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ chatId, loadingSeconds: Math.max(5, Math.min(60, Number(seconds) || 5)) })
    });
    return r.ok;
  } catch { return false; }
}
async function pushLineText(to, text) {
  const token = env('LINE_CHANNEL_ACCESS_TOKEN', '');
  if (!token || !to) return false;
  try {
    const r = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type:'text', text: String(text || '').slice(0, 500) }] })
    });
    return r.ok;
  } catch { return false; }
}
async function showLineWaitingIfNeeded(ev, text) {
  const chatId = ev?.source?.userId || ev?.source?.groupId || ev?.source?.roomId;
  if (!chatId || !isHeavyLineQuery(text)) return;
  // V48: Do not push a temporary text message. LINE bot messages cannot be reliably retracted by API.
  // Use LINE's native loading animation only; it disappears automatically when the final reply is delivered or times out.
  const seconds = Math.max(5, Math.min(60, Number(env('LINE_LOADING_SECONDS', '10')) || 10));
  await startLineLoading(chatId, seconds);
}
function verifyLineSignature(req, bodyBuf) {
  const secret = env('LINE_CHANNEL_SECRET', '');
  if (!secret) return true;
  const signature = req.headers['x-line-signature'];
  if (!signature) return false;
  const h = crypto.createHmac('sha256', secret).update(bodyBuf).digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(h)); } catch { return false; }
}
function distanceReminder(v) {
  const d = num(v, NaN);
  if (!Number.isFinite(d)) return '未填距離';
  if (d >= 100 && d <= 300) return `${fmt(d)}m｜正常區間`;
  return `${fmt(d)}m｜提醒：非100–300m，仍可回報`;
}
function photoCompletion(record) {
  const types = new Set((record.photos || []).map(p => p.type));
  const have = REQUIRED_PHOTO_TYPES.filter(t => types.has(t)).length;
  return REQUIRED_PHOTO_TYPES.length ? Math.round(have / REQUIRED_PHOTO_TYPES.length * 100) : 0;
}
function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
}
function extFromMime(m) {
  if (/png/.test(m)) return '.png';
  if (/webp/.test(m)) return '.webp';
  if (/gif/.test(m)) return '.gif';
  return '.jpg';
}
function normName(s) { return String(s || '').trim().replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 80) || 'NA'; }
function photoUploadPage() {
  const sampleCards = PHOTO_TYPES.map(([key, name], i) => {
    const sample = `/assets/field-photo-samples/sample_${String(i + 1).padStart(2, '0')}.jpg`;
    return `<div class="card"><img src="${sample}" onerror="this.style.display='none'"><b>${esc(name)}</b><small>${esc(key)}</small><input type="file" accept="image/*" multiple data-type="${esc(key)}"></div>`;
  }).join('');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>外勤照片上傳</title><style>${css()}</style></head><body><main><div class="top"><h1>外勤現場照片上傳</h1><a href="/admin/field-photos.html">照片管理</a></div><section class="panel"><div class="grid2"><label>場次編號<input id="sessionNo" placeholder="S199"></label><label>日期<input id="date" type="date"></label><label>行政區<input id="district" placeholder="淡水區"></label><label>機台編號<input id="deviceId" placeholder="OE_ZB001"></label><label class="wide">執勤地點<input id="location" placeholder="淡水區新市一路一段周邊"></label><label>告示牌距離m<input id="signDistance" type="number" placeholder="150"></label><label>回報人員<input id="reporter" placeholder="姓名"></label><label class="wide">備註<input id="note" placeholder="異常狀況、風速、施工、遮蔽等"></label></div><p class="hint">告示牌距離 100–300m 為建議區間；非此區間只提醒，不阻擋上傳。</p></section><section><h2>照片類型與範例</h2><div class="cards">${sampleCards}</div></section><button id="submit">送出照片紀錄</button><pre id="result"></pre></main><script>${photoPageJs()}</script></body></html>`;
}
function photoAdminPage() {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>外勤照片管理</title><style>${css()}</style></head><body><main><div class="top"><h1>外勤照片管理</h1><a href="/field/photos.html">新增照片</a></div><section class="panel"><button onclick="load()">重新整理</button> <a class="btn" href="/api/admin/export/field-photos-csv">匯出CSV</a></section><div id="list"></div></main><script>${adminPhotoJs()}</script></body></html>`;
}

function equipmentLivePage() {
  const data = liveEquipmentStatusData();
  const rows = (data.equipmentLive || []).map(e => `
    <tr>
      <td>${serverEscHtml(e.deviceId || '-')}</td>
      <td>${serverEscHtml(e.stateLabel || e.state || '-')}</td>
      <td>${serverEscHtml(e.sessionNo || '-')}</td>
      <td>${serverEscHtml(e.onlineDate || '-')}</td>
      <td>${serverEscHtml(e.postCalibrationDate || '-')}</td>
      <td>${serverEscHtml(e.maintenanceReason || e.reason || '-')}</td>
    </tr>`).join('');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>即時機況</title><style>${css()}</style></head><body><main>
  <div class="top"><h1>即時機況巡檢</h1><a class="btn" href="/admin.html">返回後台</a></div>
  <section class="panel"><p class="eyebrow small">LIVE EQUIPMENT</p><h2>整體狀態：${serverEscHtml(data.summary?.overallState || data.overallState || '-')}</h2><p>更新時間：${serverEscHtml(data.updatedAtTaipei || data.updatedAt || taipeiTime())}</p>
  <div class="quick-tags"><span>運作中 ${serverEscHtml(data.summary?.online ?? 0)}</span><span>維護中 ${serverEscHtml(data.summary?.maintenance ?? 0)}</span></div></section>
  <section class="panel"><h2>設備明細</h2><table><thead><tr><th>設備</th><th>狀態</th><th>最近場次</th><th>最近架設</th><th>後校正日</th><th>說明</th></tr></thead><tbody>${rows || '<tr><td colspan="6">尚未同步外勤或設備資料。</td></tr>'}</tbody></table></section>
  </main></body></html>`;
}

function adminPage() {
  const s = summary();
  const store = getStore();
  const lastLine = store.lastLineUpdate?.atTaipei || '尚未更新';
  const updateState = store.lastLineUpdate?.status || {};
  const initialStatus = systemStatusSnapshot();
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新北市噪音車可視化主控台</title><style>${css()}${adminExtraCss()}</style></head><body><main>
  <nav class="topbar"><div class="brand"><img class="ntpc-mark" src="/assets/ntpc-emblem.png" alt="新北市徽章"><div><strong>NTPC Noise Command</strong><small>Visual Control Center</small></div></div><div class="top-actions"><a class="ghost" href="${esc(DASHBOARD_URL)}" target="_blank">成果平台</a><a class="ghost" href="${esc(FIELD_REPORT_URL)}" target="_blank">外勤平台</a><a class="ghost" href="${esc(HOTSPOT_URL)}" target="_blank">百大平台</a><a class="ghost" href="${esc(CASE_TRACKING_URL)}" target="_blank">案件追蹤</a></div></nav>

  <header class="hero visual-hero"><div><p class="eyebrow">VISUAL COMMAND</p><h1>新北市噪音車可視化主控台</h1><p>所有功能以狀態卡、流程圖與操作回饋呈現。後台只給管理者使用；LINE 使用端不顯示後台連結或系統網址。</p><div class="status-line"><span class="ok">LINE 安全回覆</span><span>平台按鈕直接跳轉</span><span>最後更新：${esc(lastLine)}</span></div></div><div class="holo-core"><div class="ring"></div><b>${fmt(s.rate,1)}%</b><span>年度進度</span></div></header>

  <section class="metric-strip"><div class="metric"><i>✓</i><span>完成場次</span><b>${fmt(s.sessions)}</b><em>490 目標</em></div><div class="metric"><i>⟡</i><span>車流辨識</span><b>${fmt(s.traffic)}</b><em>件</em></div><div class="metric"><i>△</i><span>超標件數</span><b>${fmt(s.exceed)}</b><em>件</em></div><div class="metric"><i>◎</i><span>成案件數</span><b>${fmt(s.cases)}</b><em>件</em></div><div class="metric"><i>↗</i><span>KPI</span><b>${fmt(s.kpi,2)}</b><em>件/場</em></div></section>

  <section class="visual-grid main-control">
    <div class="panel action-panel"><div class="panel-head"><div><p class="eyebrow small">ACTIONS</p><h2>主控操作</h2><p class="hint">按下後會直接顯示成功項目、異常項目與下一步建議。</p></div><span class="chip live">ONLINE</span></div><div class="action-cards"><button id="btnLineAll" class="action-card primary" type="button"><span class="icon-cube">⚡</span><b>一鍵更新</b><small>同步資料、新聞與 Rich Menu</small></button><button id="btnStatus" class="action-card" type="button"><span class="icon-cube">◉</span><b>狀態巡檢</b><small>檢查 LINE、資料、平台、照片</small></button><a class="action-card link" href="/report/monthly.html"><span class="icon-cube">▣</span><b>月報中心</b><small>開啟月報產製</small></a><a class="action-card link" href="/admin/field-photos.html"><span class="icon-cube">▤</span><b>照片管理</b><small>外勤照片紀錄</small></a></div><div class="simulator smart"><input id="simulateText" value="進度" placeholder="輸入 LINE 指令測試：進度、5月、淡水區、法規中心"><button id="btnSim" class="secondary" type="button">模擬回覆</button></div></div>
    <div class="panel result-board" id="adminResult"><p class="eyebrow small">RESULT</p><h2>操作結果</h2><div class="result-visual idle"><div class="result-orb">待命</div><div><b>尚未執行操作</b><p>請點選「一鍵更新」或「狀態巡檢」。執行後會用卡片顯示成功、注意與異常項目。</p></div></div></div>
  </section>

  <section class="panel equipment-panel"><div class="panel-head"><div><p class="eyebrow small">EQUIPMENT</p><h2>設備管理 Sheet</h2><p class="hint">匯入設備 Google Sheet 到系統快取；LINE 只顯示到期日與燈號提醒。</p></div><div class="toolbar"><button id="btnEquipmentSync" class="secondary" type="button">同步設備 Sheet</button><a class="ghost" href="/api/admin/export/equipment-csv">匯出設備清冊</a><a class="ghost" href="${esc(EQUIPMENT_GOOGLE_SHEET_URL)}" target="_blank">開啟 Google Sheet</a></div></div><div id="equipmentGrid" class="module-grid">${equipmentCardsHtml(store.equipment)}</div></section>

  <section class="panel equipment-panel"><div class="panel-head"><div><p class="eyebrow small">LIVE EQUIPMENT</p><h2>設備即時機況</h2><p class="hint">依設備生命週期判斷：最新架設場次未填後校正日＝運作中；最新場次已填後校正日且尚無下一場＝維護中；後校正後新增場次＝重新上線。</p></div><div class="toolbar"><button id="btnLiveEquipmentSync" class="secondary" type="button">同步外勤機況</button><a class="ghost" href="/api/admin/export/equipment-live-csv">匯出即時機況</a><a class="ghost" href="${esc(FIELD_GOOGLE_SHEET_URL)}" target="_blank">開啟外勤 Sheet</a></div></div><div id="liveEquipmentGrid" class="module-grid">${liveEquipmentCardsHtml(store.equipmentLive)}</div></section>

  <section class="panel complaint-panel"><div class="panel-head"><div><p class="eyebrow small">COMPLAINT TREND</p><h2>陳情趨勢 Sheet</h2><p class="hint">連動 1999 市政信箱陳情資料，可依年份、月份、行政區、時段與關鍵字彙整趨勢與熱門陳情點位。</p></div><div class="toolbar"><button id="btnComplaintSync" class="secondary" type="button">同步陳情 Sheet</button><a class="ghost" href="/api/admin/export/complaints-csv">匯出陳情資料</a><a class="ghost" href="${esc(COMPLAINT_GOOGLE_SHEET_URL)}" target="_blank">開啟 Google Sheet</a></div></div><div id="complaintGrid" class="module-grid">${complaintTrendCardsHtml(aggregateComplaints({}))}</div></section>

  <section class="panel"><div class="panel-head"><div><p class="eyebrow small">FUNCTION MAP</p><h2>功能狀態總覽</h2><p class="hint">所有功能以模組卡呈現。綠色代表可用，黃色代表需注意，紅色代表需處理。</p></div><button id="btnRefreshModules" class="secondary" type="button">重新巡檢</button></div><div id="moduleGrid" class="module-grid">${moduleCardsHtml(initialStatus.modules)}</div></section>

  <section class="panel"><p class="eyebrow small">SYSTEM FLOW</p><h2>四平台資料流程</h2><div class="flow-visual"><div class="flow-node line"><span>LINE</span><b>使用端查詢</b><small>快速選項 / Rich Menu</small></div><div class="flow-arrow">→</div><div class="flow-node hub"><span>HUB</span><b>主控 API</b><small>安全回覆 / 狀態巡檢</small></div><div class="flow-arrow">→</div><div class="flow-stack"><a href="${esc(DASHBOARD_URL)}" target="_blank">成果平台</a><a href="${esc(FIELD_REPORT_URL)}" target="_blank">外勤平台</a><a href="${esc(HOTSPOT_URL)}" target="_blank">百大平台</a><a href="${esc(CASE_TRACKING_URL)}" target="_blank">案件追蹤</a></div></div></section>

  <section class="grid command-grid"><div id="liveStatus" class="panel status-panel"><p class="eyebrow small">LIVE STATUS</p><h2>即時巡檢</h2>${statusCardsHtml(initialStatus)}</div><div class="panel platform-card"><p class="eyebrow small">PLATFORM</p><h2>平台入口</h2><div class="portal-list compact"><a href="${esc(DASHBOARD_URL)}" target="_blank"><span class="mini-icon">📊</span><b>成果查詢</b><span>成果 / 月份行政區</span></a><a href="${esc(FIELD_REPORT_URL)}" target="_blank"><span class="mini-icon">📍</span><b>外勤回報</b><span>填報 / 照片 / 彙整</span></a><a href="${esc(HOTSPOT_URL)}" target="_blank"><span class="mini-icon">🗺️</span><b>百大熱點</b><span>熱點 / 布點 / 缺口</span></a><a href="${esc(CASE_TRACKING_URL)}" target="_blank"><span class="mini-icon">🧾</span><b>案件追蹤</b><span>超標案件 / 行政流程</span></a></div></div></section>

  <section class="panel preview"><p class="eyebrow small">LINE PREVIEW</p><h2>LINE 回覆預覽</h2><div class="chat-bubble">${esc(progressText()).replace(/\n/g,'<br>')}</div><div class="quick-tags"><span>1月</span><span>2月</span><span>3月</span><span>4月</span><span>5月</span><span>6月</span><span>行政區選單</span><span>陳情趨勢</span><span>法規中心</span></div></section>
  </main><script>${adminJs()}</script></body></html>`;
}

function adminExtraCss(){return `
.brand{display:flex;align-items:center;gap:12px}.ntpc-mark{width:54px;height:54px;object-fit:contain;filter:drop-shadow(0 0 18px rgba(84,226,255,.35))}.visual-hero{background:linear-gradient(135deg,rgba(8,35,63,.94),rgba(4,18,34,.92)),radial-gradient(circle at 72% 12%,rgba(83,226,255,.22),transparent 36%)}.holo-core{position:relative;z-index:2;width:190px;height:190px;border-radius:50%;display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 35% 25%,#bdfaff 0,#4cd8ff 22%,#376dff 45%,#071e36 78%);border:1px solid rgba(143,242,255,.72);box-shadow:0 0 42px rgba(80,226,255,.42),inset 0 0 42px rgba(10,48,86,.78)}.holo-core .ring{position:absolute;inset:18px;border-radius:50%;border:1px dashed rgba(255,255,255,.52);animation:spin 8s linear infinite}.holo-core b{font-size:42px}.holo-core span{margin-top:56px;color:#d7f7ff}.metric-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:18px 0}.metric{position:relative;overflow:hidden;border:1px solid rgba(91,226,255,.32);border-radius:24px;padding:18px;background:linear-gradient(180deg,rgba(9,34,60,.94),rgba(8,24,42,.9));box-shadow:0 24px 60px rgba(0,0,0,.3),inset 0 0 28px rgba(84,226,255,.06)}.metric:before{content:'';position:absolute;left:0;top:0;height:3px;width:100%;background:linear-gradient(90deg,#5be7ff,#3b7dff,transparent)}.metric i{float:right;width:44px;height:44px;border-radius:16px;display:grid;place-items:center;font-style:normal;background:linear-gradient(135deg,rgba(255,255,255,.82),rgba(84,226,255,.16));color:#0b3354;box-shadow:inset 0 0 18px rgba(255,255,255,.3),0 14px 28px rgba(0,0,0,.26)}.metric span,.metric em{display:block;color:#92abc6;font-style:normal}.metric b{display:block;margin:8px 0 4px;font-size:34px;color:#fff}.visual-grid{display:grid;grid-template-columns:1.35fr .9fr;gap:16px}.action-panel{position:relative;overflow:hidden}.action-panel:before{content:'';position:absolute;right:-100px;bottom:-120px;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle,rgba(84,226,255,.15),transparent 65%)}.action-cards{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:18px}.action-card{min-height:154px;text-align:left;display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:18px;border:1px solid rgba(92,221,255,.34);border-radius:24px;background:linear-gradient(155deg,rgba(15,56,91,.94),rgba(6,25,45,.9));color:var(--text);box-shadow:0 22px 46px rgba(0,0,0,.28),inset 0 0 26px rgba(84,226,255,.08)}.action-card.primary{background:linear-gradient(155deg,#64e7ff,#397dff);color:#041322}.action-card.link{text-decoration:none}.action-card b{font-size:21px}.action-card small{color:inherit;opacity:.8;line-height:1.5}.icon-cube{width:58px;height:58px;border-radius:20px;display:grid;place-items:center;font-size:28px;background:linear-gradient(135deg,rgba(255,255,255,.9),rgba(84,226,255,.16));box-shadow:inset 0 0 20px rgba(255,255,255,.42),0 16px 30px rgba(0,0,0,.28);color:#0b3354}.primary .icon-cube{background:rgba(255,255,255,.44)}.smart{margin-top:16px}.smart input{max-width:660px}.result-board{min-height:310px}.result-visual{display:flex;gap:18px;align-items:center;border:1px solid rgba(84,226,255,.2);border-radius:24px;padding:18px;background:rgba(84,226,255,.06)}.result-orb{width:112px;height:112px;border-radius:50%;display:grid;place-items:center;font-weight:900;color:#061525;background:linear-gradient(135deg,#5be7ff,#36f2ad);box-shadow:0 0 36px rgba(84,226,255,.3)}.result-visual p{margin:8px 0 0;color:var(--mut);line-height:1.7}.module-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-top:16px}.module-card{position:relative;border:1px solid rgba(84,226,255,.22);border-radius:20px;padding:16px;background:linear-gradient(160deg,rgba(14,49,82,.82),rgba(6,22,38,.88));box-shadow:inset 0 0 22px rgba(84,226,255,.05)}.module-card:before{content:'';position:absolute;left:14px;top:14px;width:10px;height:10px;border-radius:50%;background:#ffc85a;box-shadow:0 0 16px rgba(255,200,90,.5)}.module-card.ok:before{background:#2ee6a6;box-shadow:0 0 18px rgba(46,230,166,.56)}.module-card.bad:before{background:#ff6170;box-shadow:0 0 18px rgba(255,97,112,.56)}.module-card .icon{float:right;width:42px;height:42px;border-radius:15px;display:grid;place-items:center;background:rgba(84,226,255,.11);box-shadow:inset 0 0 18px rgba(84,226,255,.12)}.module-card b{display:block;margin:18px 0 6px;font-size:18px}.module-card small{display:block;color:var(--mut);line-height:1.5}.module-card .state{margin-top:12px;display:inline-flex;border-radius:999px;padding:6px 10px;border:1px solid rgba(84,226,255,.22);font-size:12px;font-weight:900;color:#c7f4ff}.flow-visual{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;align-items:center;gap:14px;margin-top:12px}.flow-node{border:1px solid rgba(84,226,255,.26);border-radius:24px;padding:20px;background:linear-gradient(135deg,rgba(84,226,255,.1),rgba(61,140,255,.08));min-height:120px}.flow-node span{display:inline-flex;border-radius:999px;padding:6px 10px;background:rgba(84,226,255,.12);color:#8af1ff;font-weight:900}.flow-node b{display:block;margin-top:14px;font-size:20px}.flow-node small{display:block;margin-top:6px;color:var(--mut)}.flow-arrow{font-size:30px;color:#76eaff}.flow-stack{display:grid;gap:10px}.flow-stack a{text-decoration:none;color:var(--text);font-weight:900;border:1px solid rgba(84,226,255,.24);border-radius:16px;padding:14px;background:rgba(84,226,255,.07)}.status-card.ok{border-color:rgba(46,230,166,.42);background:linear-gradient(135deg,rgba(46,230,166,.13),rgba(255,255,255,.04))}.status-card.warn{border-color:rgba(255,200,90,.42);background:linear-gradient(135deg,rgba(255,200,90,.13),rgba(255,255,255,.04))}.status-card.bad{border-color:rgba(255,97,112,.42);background:linear-gradient(135deg,rgba(255,97,112,.13),rgba(255,255,255,.04))}.status-card strong{display:block;font-size:22px;margin-top:6px}.quick-tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.quick-tags span{padding:7px 10px;border-radius:999px;border:1px solid rgba(84,226,255,.28);background:rgba(84,226,255,.08);color:#c7f4ff;font-weight:800;font-size:13px}.loading-line{color:var(--mut);padding:18px}.live{animation:pulse 1.6s ease-in-out infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(84,226,255,.0)}50%{box-shadow:0 0 0 8px rgba(84,226,255,.08)}}@media(max-width:1100px){.visual-grid,.flow-visual{grid-template-columns:1fr}.flow-arrow{transform:rotate(90deg);justify-self:center}.action-cards{grid-template-columns:1fr}.holo-core{width:140px;height:140px;margin-top:18px}.holo-core span{margin-top:44px}}
`;}

function adminJs() { return `
async function api(path, opts){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 9000);
  let r;
  try { r = await fetch(path, Object.assign({cache:'no-store', signal:controller.signal}, opts||{})); }
  finally { clearTimeout(timer); }
  const j = await r.json().catch(()=>({ok:false,error:'回傳格式非 JSON'}));
  if(!r.ok) throw new Error(j.error || j.message || ('HTTP '+r.status));
  return j;
}
function escHtml(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]||c))}
function stateClass(v){ if(v===true) return 'ok'; if(v===false) return 'bad'; return 'warn'; }
function stateText(v){ if(v===true) return '正常'; if(v===false) return '異常'; return '注意'; }
function card(label,value,state,detail){return '<div class="status-card '+stateClass(state)+'"><b>'+escHtml(label)+'</b><strong>'+escHtml(value)+'</strong><span>'+escHtml(detail||'')+'</span></div>'}
function statusGrid(cards){return '<div class="status-cards">'+cards.map(c=>card(c[0],c[1],c[2],c[3])).join('')+'</div>'}
function makeModules(obj){
  const m=obj.modules||[];
  moduleGrid.innerHTML=m.map(x=>'<div class="module-card '+stateClass(x.ok)+'"><span class="icon">'+escHtml(x.icon||'●')+'</span><b>'+escHtml(x.name)+'</b><small>'+escHtml(x.desc||'')+'</small><span class="state">'+escHtml(x.status||stateText(x.ok))+'</span></div>').join('') || '<div class="loading-line">尚無巡檢資料</div>';
}
function renderStatus(target, obj){
  makeModules(obj);
  const s=obj.summary||{};
  const cards=[
    ['整體狀態', obj.overallOk?'可正常使用':'需處理', obj.overallOk, obj.time||''],
    ['LINE 連線', obj.lineReady?'正常':'需確認', obj.lineReady, obj.botName||'Token / Secret'],
    ['Rich Menu', obj.richMenuReady?'已套用':'待更新', obj.richMenuReady, '平台按鈕直接跳轉'],
    ['資料同步', obj.sheetsChecked?'已檢查':'尚未同步', !!obj.sheetsChecked, obj.lastDataSync||'請執行一鍵更新'],
    ['新聞快取', (obj.newsCount||0)+' 筆', (obj.newsCount||0)>0, 'LINE 新聞查詢'],
    ['成果口徑', (s.sessions||0)+' 場｜KPI '+Number(s.kpi||0).toFixed(2), true, 'LINE 與平台一致']
  ];
  document.getElementById(target).innerHTML='<p class="eyebrow small">LIVE STATUS</p><h2>即時巡檢</h2>'+statusGrid(cards);
}
function renderSteps(title, steps, note){
  const box=document.getElementById('adminResult');
  const ok=steps.filter(x=>x.ok===true).length, warn=steps.filter(x=>x.ok!==true).length;
  box.innerHTML='<p class="eyebrow small">RESULT</p><h2>'+escHtml(title)+'</h2><div class="result-visual"><div class="result-orb">'+ok+'/'+steps.length+'</div><div><b>'+escHtml(warn?"完成，部分需注意":"全部完成")+'</b><p>'+escHtml(note||'')+'</p></div></div><div class="module-grid">'+steps.map(x=>'<div class="module-card '+stateClass(x.ok)+'"><span class="icon">'+escHtml(x.icon||'●')+'</span><b>'+escHtml(x.name)+'</b><small>'+escHtml(x.desc||'')+'</small><span class="state">'+escHtml(x.status||stateText(x.ok))+'</span></div>').join('')+'</div>';
  box.scrollIntoView({behavior:'smooth',block:'center'});
}
function showSimulation(title,obj){
  const quick=(obj.lineMessages&&obj.lineMessages[0]&&obj.lineMessages[0].quick)||[];
  adminResult.innerHTML='<p class="eyebrow small">LINE PREVIEW</p><h2>'+escHtml(title)+'</h2><div class="chat-bubble">'+escHtml(obj.preview||'已產生 LINE 回覆').split('\\n').join('<br>')+'</div>'+(quick.length?'<div class="quick-tags">'+quick.map(x=>'<span>'+escHtml(x)+'</span>').join('')+'</div>':'');
  adminResult.scrollIntoView({behavior:'smooth',block:'center'});
}
async function updateLineAll(){
  const btn=btnLineAll; const old=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="icon-cube">⏳</span><b>更新中</b><small>請稍候</small>';
  try{
    const j=await api('/api/admin/line/update-all',{method:'POST'});
    const st=(j.lastLineUpdate||{}).status||{};
    const steps=[
      {name:'LINE 連線',ok:!!st.lineReady,status:st.lineReady?'正常':'需確認',desc:'Token / Secret 檢查',icon:'🤖'},
      {name:'Google Sheet',ok:!!st.sheetsOk,status:st.sheetsOk?'同步完成':'需確認',desc:'成果、外勤、百大、設備資料',icon:'▦'},
      {name:'新聞快取',ok:!!st.newsOk,status:st.newsOk?'已更新':'需確認',desc:'法規新聞查詢',icon:'📰'},
      {name:'Rich Menu',ok:!!st.richMenuOk,status:st.richMenuOk?'已套用':'需確認',desc:'平台按鈕直接跳轉',icon:'☰'},
      {name:'快速選項',ok:true,status:'已啟用',desc:'月份、行政區、法規按鈕',icon:'⚡'}
    ];
    renderSteps('一鍵更新結果',steps,'最後更新：'+((j.lastLineUpdate||{}).atTaipei||'已完成'));
    await loadStatus();
  }catch(e){renderSteps('一鍵更新失敗',[{name:'系統錯誤',ok:false,status:'異常',desc:e.message,icon:'!'}],'請檢查環境變數或 LINE Token。')}
  finally{btn.disabled=false; btn.innerHTML=old;}
}
async function systemStatus(){
  try{ const j=await api('/api/admin/system/status'); renderStatus('liveStatus',j); renderSteps('狀態巡檢結果',j.modules||[], j.overallOk?'所有核心功能可使用。':'有項目需要處理，請看黃色或紅色卡片。'); }
  catch(e){renderSteps('狀態巡檢失敗',[{name:'讀取失敗',ok:false,status:'異常',desc:e.message,icon:'!'}]);}
}
async function simulateLine(){
  const text=simulateText.value||'進度';
  try{showSimulation('LINE 回覆模擬：'+text, await api('/api/line/simulate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})}));}
  catch(e){renderSteps('LINE 模擬失敗',[{name:'模擬失敗',ok:false,status:'異常',desc:e.message,icon:'!'}]);}
}
async function loadStatus(){try{renderStatus('liveStatus', await api('/api/admin/system/status'));}catch(e){liveStatus.innerHTML='<p class="eyebrow small">LIVE STATUS</p><h2>即時巡檢</h2><div class="result-empty">線上巡檢逾時，已保留頁面預載狀態卡。請按「狀態巡檢」重試。</div>';}}
function equipmentCards(items){return (items||[]).map(e=>'<div class="module-card '+(String(e.light||'').includes('🔴')?'bad':(String(e.light||'').includes('🟡')?'warn':'ok'))+'"><span class="icon">🛠️</span><b>'+escHtml(e.id||'-')+'</b><small>比測到期：'+escHtml(e.bitestDue||'-')+'<br>噪音計：'+escHtml(e.soundMeterDue||'-')+'<br>風速計：'+escHtml(e.windMeterDue||'-')+'</small><span class="state">'+escHtml(e.light||'⚪未填')+'</span></div>').join('') || '<div class="loading-line">尚未同步設備資料。</div>'}
async function loadEquipment(){try{const j=await api('/api/admin/equipment/status'); if(document.getElementById('equipmentGrid')) equipmentGrid.innerHTML=equipmentCards(j.equipment||[]);}catch(e){if(document.getElementById('equipmentGrid')) equipmentGrid.innerHTML='<div class="loading-line">設備狀態讀取失敗：'+escHtml(e.message)+'</div>';}}
async function syncEquipment(){const btn=btnEquipmentSync; const old=btn.innerHTML; btn.disabled=true; btn.innerHTML='同步中'; try{const j=await api('/api/admin/equipment/import',{method:'POST'}); equipmentGrid.innerHTML=equipmentCards(j.equipment||[]); renderSteps('設備 Sheet 同步結果',[{name:'設備 Google Sheet',ok:!!j.ok,status:j.ok?'同步完成':'需確認',desc:(j.count||0)+' 台設備',icon:'🛠️'}], j.ok?'LINE「設備管理」會顯示最新到期日與燈號。':(j.error||'請確認 Sheet 權限。')); await loadStatus();}catch(e){renderSteps('設備同步失敗',[{name:'設備 Google Sheet',ok:false,status:'異常',desc:e.message,icon:'!'}],'請確認 Sheet 已開啟連結讀取，或更新環境變數。')} finally{btn.disabled=false; btn.innerHTML=old;}}
function liveEquipmentCards(items){return (items||[]).map(e=>{const st=String(e.state||''); const online=st.includes('運作')||st.includes('上線'); const cls=online?'ok':'bad'; const icon=online?'🟢':'⚫'; const label=online?'運作中':'維護中'; return '<div class="module-card '+cls+'"><span class="icon">'+icon+'</span><b>'+escHtml(e.deviceId||'-')+'</b><small>'+escHtml(e.state||'-')+'<br>架設：'+escHtml(e.onlineDate||'-')+'｜場次：'+escHtml(e.sessionNo||'-')+'<br>後校正：'+escHtml(e.postCalibrationDate||'-')+'<br>'+escHtml(e.district||'-')+'｜'+escHtml(e.location||'-')+'<br>'+escHtml(e.maintenanceReason||'')+'</small><span class="state">'+label+'</span></div>';}).join('') || '<div class="loading-line">尚未同步外勤機況。</div>'}
async function loadLiveEquipment(){try{const j=await api('/api/admin/equipment/live-status'); if(document.getElementById('liveEquipmentGrid')) liveEquipmentGrid.innerHTML=liveEquipmentCards(j.equipmentLive||[]);}catch(e){if(document.getElementById('liveEquipmentGrid')) liveEquipmentGrid.innerHTML='<div class="loading-line">即時機況讀取失敗：'+escHtml(e.message)+'</div>';}}
async function syncLiveEquipment(){const btn=btnLiveEquipmentSync; const old=btn.innerHTML; btn.disabled=true; btn.innerHTML='同步中'; try{const j=await api('/api/admin/equipment/live-sync',{method:'POST'}); liveEquipmentGrid.innerHTML=liveEquipmentCards(j.equipmentLive||[]); const c=j.counts||{}; renderSteps('外勤機況同步結果',[{name:'外勤回報場次',ok:!!j.ok,status:j.ok?'同步完成':'需確認',desc:'運作 '+(c.online||0)+'｜維護 '+(c.maintenance||0),icon:'📡'}], j.ok?'LINE 輸入「即時機況」會依設備生命週期顯示運作中/維護中。':(j.error||'請確認外勤 Sheet 權限。')); await loadStatus();}catch(e){renderSteps('外勤機況同步失敗',[{name:'外勤回報 Sheet',ok:false,status:'異常',desc:e.message,icon:'!'}],'請確認外勤 Sheet 已開啟連結讀取，或更新環境變數。')} finally{btn.disabled=false; btn.innerHTML=old;}}
function complaintCards(trend){const t=trend||{}; const d=t.byDistrict&&t.byDistrict[0]; const h=t.hotspots&&t.hotspots[0]; return '<div class="module-card ok"><span class="icon">📣</span><b>總陳情數</b><small>'+escHtml((t.total||0).toLocaleString())+' 件<br>'+escHtml(t.scope||'全部資料')+'</small><span class="state">陳情趨勢</span></div><div class="module-card ok"><span class="icon">📍</span><b>行政區熱點</b><small>'+escHtml(d?d.name:'-')+'<br>'+(d?(d.count+' 件'):'尚無')+'</small><span class="state">Top</span></div><div class="module-card ok"><span class="icon">🔥</span><b>熱門點位</b><small>'+escHtml(h?h.name:'-')+'<br>'+(h?(h.count+' 件'):'尚無')+'</small><span class="state">熱點</span></div>'; }
async function loadComplaints(){try{const j=await api('/api/admin/complaints/status'); if(document.getElementById('complaintGrid')) complaintGrid.innerHTML=complaintCards((j.trend||{}));}catch(e){if(document.getElementById('complaintGrid')) complaintGrid.innerHTML='<div class="loading-line">陳情趨勢讀取失敗：'+escHtml(e.message)+'</div>';}}
async function syncComplaints(){const btn=btnComplaintSync; const old=btn.innerHTML; btn.disabled=true; btn.innerHTML='同步中'; try{const j=await api('/api/admin/complaints/sync',{method:'POST'}); complaintGrid.innerHTML=complaintCards((j.trend||{})); renderSteps('陳情趨勢同步結果',[{name:'市政信箱陳情 Sheet',ok:!!j.ok,status:j.ok?'同步完成':'使用快取',desc:(j.count||0)+' 筆陳情資料',icon:'📣'}], j.ok?'LINE 輸入「陳情趨勢」即可查詢最新資料。':(j.error||'Google Sheet 目前無資料，已保留系統快取。')); await loadStatus();}catch(e){renderSteps('陳情趨勢同步失敗',[{name:'陳情 Google Sheet',ok:false,status:'異常',desc:e.message,icon:'!'}],'請確認 Sheet 已開啟連結讀取，或先使用匯出 CSV 建立欄位。')} finally{btn.disabled=false; btn.innerHTML=old;}}
btnLineAll.addEventListener('click', updateLineAll);
btnStatus.addEventListener('click', systemStatus);
btnSim.addEventListener('click', simulateLine);
btnRefreshModules.addEventListener('click', systemStatus);
if (document.getElementById('btnEquipmentSync')) btnEquipmentSync.addEventListener('click', syncEquipment);
if (document.getElementById('btnLiveEquipmentSync')) btnLiveEquipmentSync.addEventListener('click', syncLiveEquipment);
if (document.getElementById('btnComplaintSync')) btnComplaintSync.addEventListener('click', syncComplaints);
window.addEventListener('load', ()=>{loadStatus(); loadEquipment(); loadLiveEquipment();});
`; }

function css() { return `:root{--bg0:#061525;--bg1:#08223a;--card:rgba(9,30,52,.82);--card2:rgba(12,43,72,.92);--line:rgba(93,211,255,.28);--line2:rgba(82,139,255,.36);--text:#eaf7ff;--mut:#91abc7;--blue:#3d8cff;--cyan:#54e2ff;--green:#2ee6a6;--amber:#ffc85a;--shadow:0 24px 70px rgba(0,0,0,.32);--glow:0 0 32px rgba(84,226,255,.28)}*{box-sizing:border-box}body{margin:0;min-height:100vh;color:var(--text);font-family:Arial,'Microsoft JhengHei','Noto Sans TC',sans-serif;background:radial-gradient(circle at 16% -8%,rgba(68,191,255,.36),transparent 34%),radial-gradient(circle at 100% 0%,rgba(54,104,255,.22),transparent 30%),linear-gradient(135deg,#06111f 0%,#071c31 48%,#071421 100%)}body:before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.8),transparent 82%);pointer-events:none}main{position:relative;max-width:1320px;margin:0 auto;padding:28px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}.topbar>div:first-child{display:flex;align-items:center;gap:12px}.topbar strong{font-size:18px;letter-spacing:.4px}.topbar small{color:var(--mut);margin-left:10px}.logo-dot{width:15px;height:15px;border-radius:50%;background:var(--cyan);box-shadow:0 0 0 8px rgba(84,226,255,.12),0 0 28px rgba(84,226,255,.8)}.top-actions{display:flex;gap:10px;flex-wrap:wrap}.hero{position:relative;display:flex;justify-content:space-between;align-items:center;gap:24px;padding:30px;border:1px solid var(--line);border-radius:30px;background:linear-gradient(135deg,rgba(11,39,67,.88),rgba(9,25,44,.78));box-shadow:var(--shadow);overflow:hidden}.hero:after{content:'';position:absolute;right:-80px;top:-120px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(84,226,255,.28),transparent 64%)}.hero h1{margin:0;font-size:38px;line-height:1.25;letter-spacing:.5px}.hero p{margin:10px 0 0;color:var(--mut);line-height:1.8}.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;color:#8af1ff;background:rgba(84,226,255,.1);border:1px solid rgba(84,226,255,.26);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:900;letter-spacing:1px}.eyebrow.small{font-size:11px;padding:5px 10px}.status-line{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.status-line span,.chip{display:inline-flex;border:1px solid var(--line);background:rgba(84,226,255,.08);border-radius:999px;color:#bdefff;padding:8px 12px;font-weight:800}.status-line .ok{color:#071d22;background:linear-gradient(135deg,var(--green),var(--cyan));border:0}.orb{position:relative;z-index:1;width:170px;height:170px;border-radius:50%;display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 30% 20%,rgba(84,226,255,.9),rgba(61,140,255,.42) 45%,rgba(12,33,56,.9) 72%);border:1px solid rgba(139,238,255,.5);box-shadow:var(--glow)}.orb b{display:block;font-size:40px}.orb span{display:block;color:#d5f7ff}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;margin:18px 0}.kpis div,.panel,.card{background:linear-gradient(180deg,var(--card),rgba(7,23,40,.86));border:1px solid var(--line);border-radius:24px;box-shadow:var(--shadow);padding:20px}.kpis div{position:relative;overflow:hidden}.kpis div:before{content:'';position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,var(--cyan),var(--blue),transparent)}.kpis small,.kpis span,.hint,.result-empty{color:var(--mut);line-height:1.7}.kpis b{display:block;margin:8px 0 2px;font-size:34px;color:#fff;letter-spacing:1px}.grid{display:grid;gap:16px}.command-grid{grid-template-columns:2fr 1fr}.span2{grid-column:auto}.panel-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.panel h2{margin:0 0 12px;font-size:26px}.toolbar,.simulator,.hero-actions{display:flex;gap:10px;flex-wrap:wrap}.toolbar{margin-top:18px}button,.btn,.ghost,.portal-list a,.top a{appearance:none;border:0;text-decoration:none;cursor:pointer;font-weight:900;border-radius:16px;transition:.18s ease}button,.btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 17px;color:#061525;background:linear-gradient(135deg,var(--cyan),var(--blue));box-shadow:0 12px 30px rgba(61,140,255,.25)}button.secondary,.btn.secondary,.ghost{background:rgba(255,255,255,.06);color:var(--text);border:1px solid var(--line);box-shadow:none}.ghost{display:inline-flex;padding:11px 14px}.portal-list{display:grid;gap:12px}.portal-list a{display:block;padding:16px 18px;color:var(--text);background:linear-gradient(135deg,rgba(84,226,255,.1),rgba(61,140,255,.08));border:1px solid var(--line2)}.portal-list a:hover,button:hover,.btn:hover,.ghost:hover{transform:translateY(-1px);filter:brightness(1.08)}.portal-list b{display:block;font-size:18px}.portal-list span{display:block;margin-top:4px;color:var(--mut)}.portal-list.compact a{padding:13px 15px}.simulator{margin-top:16px}.simulator input,input{width:100%;max-width:420px;padding:14px 15px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.08);color:var(--text);outline:none}.simulator input::placeholder,input::placeholder{color:#7190ad}.behavior{display:grid;gap:12px}.behavior div{border:1px solid rgba(84,226,255,.2);background:rgba(84,226,255,.06);border-radius:18px;padding:15px}.behavior b{display:block}.behavior span{color:var(--mut);display:block;margin-top:4px}.result-panel .status-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.status-card{border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.06);padding:15px}.status-card b{display:block}.status-card span{color:var(--mut)}.chat-bubble{max-width:760px;background:linear-gradient(135deg,#dff8ff,#ffffff);color:#0b2e52;border-radius:24px 24px 24px 6px;padding:20px;line-height:1.75;border:1px solid rgba(255,255,255,.55);box-shadow:0 12px 30px rgba(0,0,0,.18)}pre{white-space:pre-wrap;overflow:auto;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:18px;color:var(--text);padding:16px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.wide{grid-column:1/-1}label{font-weight:800;color:#d9efff}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.card img{width:100%;height:140px;object-fit:cover;border-radius:14px;background:rgba(255,255,255,.08)}.card small{display:block;color:var(--mut)}.photo-row{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;align-items:start}.thumbs{display:flex;gap:8px;flex-wrap:wrap}.thumbs img{width:92px;height:72px;object-fit:cover;border-radius:10px}.flow{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:18px 0}.flow div{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px;box-shadow:var(--shadow)}.flow b{display:block;font-size:18px;margin-bottom:8px}.flow span{color:var(--mut);line-height:1.6}.steps{line-height:2;color:#cfe7ff}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid rgba(84,226,255,.16);padding:12px;text-align:left;vertical-align:top}code{background:rgba(84,226,255,.1);border:1px solid var(--line);border-radius:8px;padding:3px 6px;color:#b8f5ff}@media(max-width:980px){main{padding:16px}.hero,.topbar,.panel-head{display:block}.orb{width:130px;height:130px;margin-top:18px}.command-grid,.grid2,.photo-row,.flow{grid-template-columns:1fr}.simulator input{max-width:100%}.top-actions{margin-top:12px}.hero h1{font-size:30px}}`; }

function reportPage(urlObj) {
  const month = urlObj.searchParams.get('month') || '';
  const district = urlObj.searchParams.get('district') || '';
  const s = scopedSummary({ month, district });
  const monthLabel = month ? `${normalizeMonthKey(month)}月` : '本月/全年度';
  const districtLabel = district || '全市';
  const scopeTitle = s.scopeType === 'month' ? `${monthLabel}月報` : (s.scopeType === 'district' ? `${districtLabel}成果摘要` : '全年度成果摘要');
  const note = s.note ? `<p class="note">${esc(s.note)}</p>` : '';
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>月報中心</title><style>${css()}</style></head><body><main><div class="top"><h1>新北市噪音車科技執法月報</h1><button onclick="window.print()">列印 / 另存 PDF</button></div><section class="panel"><h2>${esc(scopeTitle)}</h2><p>月份：${esc(monthLabel)}｜行政區：${esc(districtLabel)}｜統計範圍：${esc(s.scope)}｜更新時間：${esc(s.updatedAt)}</p>${note}</section><section class="kpis"><div><b>${fmt(s.sessions)}</b><span>${s.scopeType === 'month' ? '本月完成場次' : '完成場次'}</span></div><div><b>${fmt(s.rate,1)}%</b><span>${s.scopeType === 'month' ? '占年度目標' : '年度達成率'}</span></div><div><b>${fmt(s.traffic)}</b><span>車流辨識</span></div><div><b>${fmt(s.exceed)}</b><span>超標件數</span></div><div><b>${fmt(s.cases)}</b><span>成案件數</span></div><div><b>${fmt(s.kpi,2)}</b><span>KPI</span></div></section><section class="panel"><h2>執行數據口徑</h2><p>本頁僅呈現指定月份或行政區的成果統計資料，不產生 AI 建議。</p><p>統計口徑：成案件數 = 告發件數 + 通知到檢件數；KPI = 成案件數 ÷ 完成場次。</p></section></main></body></html>`;
}

function photoPageJs() { return `async function fileToDataUrl(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}document.getElementById('submit').onclick=async()=>{const photos=[];for(const input of document.querySelectorAll('input[type=file]')){for(const f of input.files){photos.push({type:input.dataset.type,name:f.name,dataUrl:await fileToDataUrl(f)})}}const body={sessionNo:sessionNo.value,date:date.value,district:district.value,deviceId:deviceId.value,location:location.value,signDistance:signDistance.value,reporter:reporter.value,note:note.value,photos};const r=await fetch('/api/field/photos/upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();result.innerHTML=j.ok?('<b>已送出照片紀錄</b><br>場次：'+(j.record.sessionNo||'-')+'<br>照片：'+((j.record.photos||[]).length)+' 張<br>距離提醒：'+(j.record.distanceText||'-')):('<b>送出失敗</b><br>'+(j.error||'請重新確認資料'));if(j.ok) alert('已送出照片紀錄')};`; }
function adminPhotoJs() { return `async function load(){const r=await fetch('/api/field/photos/list');const j=await r.json();list.innerHTML=(j.records||[]).reverse().map(x=>'<section class="panel photo-row"><div><h3>'+esc(x.sessionNo||'-')+'｜'+esc(x.district||'-')+'</h3><p>機台：'+esc(x.deviceId||'-')+'<br>地點：'+esc(x.location||'-')+'<br>距離：'+esc(x.distanceText||'-')+'<br>完整度：'+x.completion+'%</p></div><div>照片：'+(x.photos||[]).length+'張<br>上傳：'+esc(x.createdAtTaipei||'')+'</div><div class="thumbs">'+(x.photos||[]).map(p=>'<a href="'+p.url+'" target="_blank"><img src="'+p.url+'" title="'+esc(p.label||p.type)+'"></a>').join('')+'</div></section>').join('')||'<p>無資料</p>'}function esc(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}load();`; }


function complaintTrendPage(urlObj) {
  const trend = aggregateComplaints({
    year: urlObj.searchParams.get('year') || '',
    month: urlObj.searchParams.get('month') || '',
    district: urlObj.searchParams.get('district') || '',
    period: urlObj.searchParams.get('period') || '',
    keyword: urlObj.searchParams.get('keyword') || ''
  });
  const hot = trend.hotspots.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${fmt(x.count)}</td></tr>`).join('');
  const districts = trend.byDistrict.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${fmt(x.count)}</td></tr>`).join('');
  const same = trend.sameMonth.map(x=>`<span>${esc(x.name)}年：${fmt(x.count)}件</span>`).join('');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>陳情趨勢</title><style>${css()}</style></head><body><main><div class="top"><h1>陳情趨勢分析</h1><a class="btn" href="/admin.html">返回後台</a></div><section class="panel"><h2>${esc(trend.scope)}</h2><p>總陳情數：${fmt(trend.total)} 件｜更新時間：${esc(trend.updatedAt)}｜資料來源：1999 市政信箱陳情案件</p><div class="quick-tags">${same || '<span>可加 month 參數查看同期比較</span>'}</div></section><section class="grid2"><div class="panel"><h2>行政區排行</h2><table><thead><tr><th>#</th><th>行政區</th><th>件數</th></tr></thead><tbody>${districts}</tbody></table></div><div class="panel"><h2>熱門陳情點位</h2><table><thead><tr><th>#</th><th>點位</th><th>件數</th></tr></thead><tbody>${hot}</tbody></table></div></section></main></body></html>`;
}

function platformGuidePage() {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>四平台使用架構</title><style>${css()}</style></head><body><main><div class="hero"><div><p class="eyebrow">Platform Architecture</p><h1>四平台整合使用架構</h1><p>主控 LINE Bot 負責查詢與管理，外部平台分別處理成果、外勤、百大熱點與案件追蹤。資料以 Google Sheet / 系統快取作為共同交換層。</p></div><a class="btn" href="/admin.html">返回後台</a></div><section class="flow"><div><b>01 LINE Bot 主控</b><span>newtaipeinoise<br>查詢、Rich Menu、一鍵更新、月報與狀態檢查</span></div><div><b>02 成果平台</b><span>noise115<br>成果查詢、KPI、月份/行政區統計</span></div><div><b>03 外勤回報</b><span>out115<br>現場填報、照片佐證、回報彙整、匯入匯出</span></div><div><b>04 百大熱點</b><span>ntpcnoisely<br>熱點排序、建議布點、缺口分析</span></div><div><b>05 案件追蹤</b><span>ntpclynoise<br>超標案件行政流程追蹤查詢</span></div></section><section class="panel"><h2>標準作業流</h2><ol class="steps"><li>外勤於 out115 填寫回報並上傳照片。</li><li>成果人員於 noise115 匯入聲音照相成果。</li><li>百大平台更新熱點排序與建議布點。</li><li>LINE Bot 後台執行一鍵更新，刷新 Rich Menu、新聞、Sheet 讀取狀態與系統快取。</li><li>承辦透過 LINE 查詢進度、案件追蹤、照片、月報與資料一致性。</li></ol></section><section class="links"><a href="${esc(env('DASHBOARD_URL','https://noise115.zeabur.app'))}" target="_blank">成果平台</a><a href="${esc(env('FIELD_REPORT_URL','https://out115.zeabur.app'))}" target="_blank">外勤回報平台</a><a href="${esc(env('HOTSPOT_URL','https://ntpcnoisely.zeabur.app/login'))}" target="_blank">百大熱點平台</a><a href="${esc(env('CASE_TRACKING_URL','https://ntpclynoise.zeabur.app/'))}" target="_blank">案件追蹤平台</a><a href="/line-help.html">LINE 指令表</a></section></main></body></html>`;
}

function lineHelpPage() {
  const rows = [
    ['主選單','選單、menu、help、指令','顯示 LINE Bot 功能說明'],
    ['Google Sheet','Google Sheet 連結、表單連結、資料表連結','需先輸入密碼，驗證後提供成果、外勤、設備、陳情 Sheet 連結'],
    ['成果進度','進度、統計查詢','年度進度、車流、超標、成案件數'],
    ['月份/行政區','5月、淡水區、淡水區執行成效','查詢特定月份或行政區成果'],
    ['外勤','外勤回報、架設點位、S01、OE_ZB001','開啟外勤平台或查詢場次/機台'],
    ['照片','架設照片、S01照片、淡水區照片','查詢現場照片紀錄'],
    ['百大','百大點位、淡水區百大、第1名詳細、百大公式','查詢百大熱點與評分口徑'],
    ['月報','本月月報、5月月報、淡水區月報','產出月報摘要與網頁連結'],
    ['同步','資料一致性檢查、同步檢查','檢查資料來源與快取狀態'],
    ['法規新聞','法規中心、新聞、更新新聞、NIEA82B','法規、方法、新聞連結'],
    ['案件/設備/車號','案件追蹤、設備管理、即時機況、車牌 ABC-1234','超標案件流程、設備到期燈號；車號查詢保留文字指令但不放 Rich Menu'],
    ['陳情趨勢','陳情趨勢、4月陳情、四月陳情、淡水區陳情、夜間陳情、熱門陳情點位','依年份、月份、行政區、時段與關鍵字查詢市政信箱陳情趨勢']
  ];
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LINE 指令表</title><style>${css()}</style></head><body><main><div class="hero"><div><p class="eyebrow">LINE Command</p><h1>LINE Bot 指令表</h1><p>可直接複製指令到 LINE 測試。</p></div><a class="btn" href="/admin.html">返回後台</a></div><section class="panel"><table><thead><tr><th>類別</th><th>指令</th><th>用途</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td><code>${r[1]}</code></td><td>${r[2]}</td></tr>`).join('')}</tbody></table></section></main></body></html>`;
}

function richMenuSwitchAction(targetAlias, data) {
  return { type: 'richmenuswitch', richMenuAliasId: targetAlias, data };
}
function area(x, y, width, height, action) {
  return { bounds: { x, y, width, height }, action };
}
function lineRichMenuPayload(page = 'main') {
  // V71 單頁版 Rich Menu：明亮科技卡片式操作介面。
  // 右下角保留隱藏功能區：連續點三下後啟動後端平台驗證入口。
  const w = 2500, h = 1686;
  return {
    size: { width: w, height: h },
    selected: true,
    name: 'NTPC Noise V71 乾淨單頁 Rich Menu',
    chatBarText: '新北噪音車',
    areas: [
      // 主要六大功能
      area(70, 55, 780, 525, { type: 'uri', uri: FIELD_REPORT_URL }),
      area(900, 55, 760, 525, { type: 'uri', uri: DASHBOARD_URL }),
      area(1700, 55, 735, 525, { type: 'message', text: '即時機況' }),

      area(70, 610, 780, 285, { type: 'message', text: '設備管理' }),
      area(885, 610, 760, 285, { type: 'uri', uri: CASE_TRACKING_URL }),
      area(1680, 610, 760, 285, { type: 'message', text: '統計查詢' }),

      // 法規 / 資訊
      area(70, 920, 650, 300, { type: 'message', text: '法規中心' }),
      area(745, 920, 560, 300, { type: 'uri', uri: HOTSPOT_URL }),
      area(1325, 920, 560, 300, { type: 'message', text: '陳情趨勢' }),
      area(1905, 920, 540, 300, { type: 'message', text: '新聞' }),

      // 右下角隱藏後端功能：連點三次
      area(2350, 1530, 145, 150, { type: 'message', text: ADMIN_HIDDEN_TAP_TOKEN })
    ]
  };
}
async function lineApiJson(pathname, method='GET', body=null) {
  const token = env('LINE_CHANNEL_ACCESS_TOKEN','');
  if (!token) return { ok: false, skipped: true, error: 'missing LINE_CHANNEL_ACCESS_TOKEN' };
  const r = await fetchWithTimeout(`https://api.line.me${pathname}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? {'content-type':'application/json'} : {}) }, body: body ? JSON.stringify(body) : undefined }, 6500);
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}
async function getLineStatus() {
  const token = env('LINE_CHANNEL_ACCESS_TOKEN','');
  const secret = env('LINE_CHANNEL_SECRET','');
  let info = token ? { ok: null, pending: true } : { ok: false, skipped: true, error: 'missing LINE_CHANNEL_ACCESS_TOKEN' };
  if (token) {
    try { info = await lineApiJson('/v2/bot/info'); }
    catch (e) { info = { ok: false, timeout: e.name === 'AbortError', error: e.name === 'AbortError' ? 'LINE API timeout' : e.message }; }
  }
  return { ok: !!token && !!secret && info.ok !== false, hasToken: !!token, hasSecret: !!secret, botInfo: info };
}
async function uploadRichMenuImage(richMenuId, imagePath) {
  const token = env('LINE_CHANNEL_ACCESS_TOKEN','');
  if (!fs.existsSync(imagePath)) return { ok:false, skipped:true, error:`${path.basename(imagePath)} not found` };
  const stat = fs.statSync(imagePath);
  const maxBytes = 1024 * 1024;
  if (stat.size > maxBytes) {
    return { ok:false, skipped:true, error:`${path.basename(imagePath)} exceeds LINE rich menu image limit: ${stat.size} bytes > ${maxBytes} bytes`, bytes:stat.size, file:path.basename(imagePath) };
  }
  const r = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' },
    body: fs.readFileSync(imagePath)
  });
  const t = await r.text();
  return { ok:r.ok, status:r.status, bytes:stat.size, file:path.basename(imagePath), data:t ? t.slice(0,300) : {} };
}
async function upsertRichMenuAlias(aliasId, richMenuId) {
  const create = await lineApiJson('/v2/bot/richmenu/alias', 'POST', { richMenuAliasId: aliasId, richMenuId });
  if (create.ok) return { ok:true, aliasId, richMenuId, mode:'created', create };
  // LINE returns conflict when the alias already exists. In that case, update it to the newest menu.
  if (create.status === 409 || /already|conflict/i.test(JSON.stringify(create.data || {}))) {
    const update = await lineApiJson(`/v2/bot/richmenu/alias/${encodeURIComponent(aliasId)}`, 'POST', { richMenuId });
    return { ok:!!update.ok, aliasId, richMenuId, mode:'updated', create, update };
  }
  return { ok:false, aliasId, richMenuId, mode:'create_failed', create };
}
async function getDefaultRichMenu() {
  return await lineApiJson('/v2/bot/user/all/richmenu', 'GET');
}
async function listRichMenus() {
  return await lineApiJson('/v2/bot/richmenu/list', 'GET');
}
async function deleteRichMenuById(richMenuId) {
  if (!richMenuId) return { ok:false, skipped:true, error:'missing richMenuId' };
  return await lineApiJson(`/v2/bot/richmenu/${encodeURIComponent(richMenuId)}`, 'DELETE');
}
async function deleteDefaultRichMenuSafe() {
  const r = await lineApiJson('/v2/bot/user/all/richmenu', 'DELETE');
  // 404 / no default rich menu should not block applying a new default.
  if (r.ok || r.status === 404) return { ok:true, ignoredStatus:r.status, data:r.data };
  return r;
}
async function cleanupOldNtpcRichMenus(keepRichMenuId) {
  const before = await listRichMenus();
  const deleted = [];
  if (before.ok && before.data && Array.isArray(before.data.richmenus)) {
    for (const m of before.data.richmenus) {
      const id = m.richMenuId;
      const name = String(m.name || '');
      if (id && id !== keepRichMenuId && /^NTPC Noise/i.test(name)) {
        const r = await deleteRichMenuById(id);
        deleted.push({ richMenuId:id, name, ok:!!r.ok, status:r.status, data:r.data });
      }
    }
  }
  const after = await listRichMenus();
  return { ok:true, beforeCount: before.data?.richmenus?.length ?? null, deleted, afterCount: after.data?.richmenus?.length ?? null, before, after };
}

async function updateRichMenu() {
  const token = env('LINE_CHANNEL_ACCESS_TOKEN','');
  if (!token) return { ok:false, skipped:true, error:'missing LINE_CHANNEL_ACCESS_TOKEN' };

  const mainImage = path.join(PUBLIC_DIR, 'assets', 'line-rich-menu-main.jpg');
  const mainImageStat = fs.existsSync(mainImage) ? fs.statSync(mainImage) : null;
  const richMenusBefore = await listRichMenus();
  const defaultBefore = await getDefaultRichMenu();

  const mainCreate = await lineApiJson('/v2/bot/richmenu', 'POST', lineRichMenuPayload('main'));
  if (!mainCreate.ok) return { ok:false, step:'create rich menu', mainCreate, richMenusBefore, defaultBefore };
  const mainRichMenuId = mainCreate.data.richMenuId;

  const mainUpload = await uploadRichMenuImage(mainRichMenuId, mainImage);
  if (!mainUpload.ok) return { ok:false, step:'upload rich menu image', mainRichMenuId, mainUpload, mainImageBytes:mainImageStat?.size, richMenusBefore, defaultBefore };

  // 強制刷新：先取消舊 default，再設定最新 default。
  // 這可避免 LINE Channel 仍掛在舊 default rich menu。
  const unsetDefault = await deleteDefaultRichMenuSafe();
  const setDefault = await lineApiJson(`/v2/bot/user/all/richmenu/${mainRichMenuId}`, 'POST');
  if (!setDefault.ok) return { ok:false, step:'set default rich menu', mainRichMenuId, mainUpload, unsetDefault, setDefault, richMenusBefore, defaultBefore };

  // 清掉本系統歷代 NTPC Noise rich menu，避免後台或 LINE Channel 誤掛舊選單。
  const cleanup = await cleanupOldNtpcRichMenus(mainRichMenuId);
  const defaultAfter = await getDefaultRichMenu();

  return {
    ok: !!setDefault.ok,
    mode: 'single-page-rich-menu-v71-admin-login-fix-force-refresh',
    mainRichMenuId,
    mainImageFile: path.basename(mainImage),
    mainImageBytes: mainImageStat?.size ?? null,
    mainUpload,
    unsetDefault,
    setDefault,
    defaultBefore,
    defaultAfter,
    cleanup
  };
}
function decodeXml(s){return String(s||'').replace(/<!\[CDATA\[(.*?)\]\]>/gs,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')}
async function refreshNews() {
  const q = encodeURIComponent('新北 噪音車 聲音照相 OR 科技執法');
  const url = `https://news.google.com/rss/search?q=${q}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
  try {
    const r = await fetchWithTimeout(url, { redirect:'follow' }, 6500);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,5).map(m => {
      const block = m[1];
      const pick = tag => decodeXml(((block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`)) || [])[1] || ''));
      const title = pick('title').replace(/ - Google News$/,'');
      const link = pick('link');
      const pubDate = pick('pubDate');
      const source = pick('source') || 'Google News';
      return { title, url: link, source, publishedAt: pubDate, summary: '請點選連結查看完整內容。' };
    }).filter(x=>x.title);
    const store = getStore();
    store.news = { updatedAt: nowIso(), updatedAtTaipei: taipeiTime(), items, source: url, ok: r.ok };
    safeJsonWrite(STORE_PATH, store);
    return { ok:true, count: items.length, news: store.news };
  } catch(e) { return { ok:false, error:e.message }; }
}

function completedRow(row) {
  const v = String(row['是否完成'] ?? row['完成'] ?? '').trim();
  if (!v) return true;
  return /^(是|完成|已完成|TRUE|true|1)$/i.test(v);
}
function resultRowToMetric(row) {
  return {
    sessions: 1,
    traffic: num(row['辨識車流'] || row['車流辨識'] || row['車流'] || row['辨識數'], 0),
    exceed: num(row['超標數'] || row['超標件數'] || row['超標車輛'] || row['超標'], 0),
    fines: num(row['告發件數'] || row['告發'] || row['告發數'], 0),
    notices: num(row['通知到檢件數'] || row['通知到檢'] || row['通檢件數'] || row['通檢'], 0),
    amount: num(row['告發金額'] || row['金額'], 0)
  };
}
function addMetric(target, metric) {
  target.sessions = num(target.sessions, 0) + num(metric.sessions, 0);
  target.traffic = num(target.traffic, 0) + num(metric.traffic, 0);
  target.exceed = num(target.exceed, 0) + num(metric.exceed, 0);
  target.fines = num(target.fines, 0) + num(metric.fines, 0);
  target.notices = num(target.notices, 0) + num(metric.notices, 0);
  target.amount = num(target.amount, 0) + num(metric.amount, 0);
  target.cases = target.fines + target.notices;
  return target;
}
function emptyMetric() { return { sessions:0, traffic:0, exceed:0, fines:0, notices:0, cases:0, amount:0 }; }
function normalizeDistrict(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  const m = raw.match(/(板橋|三重|中和|永和|新莊|土城|淡水|汐止|新店|樹林|蘆洲|五股|泰山|林口|八里|三峽|鶯歌|金山|萬里|三芝|石門|瑞芳|貢寮|雙溪|平溪|深坑|石碇|坪林|烏來)區?/);
  if (m) return `${m[1]}區`;
  return raw.endsWith('區') ? raw : raw;
}
function aggregateResultsRows(rows) {
  const summary = emptyMetric();
  const months = {};
  const districts = {};
  const monthDistricts = {};
  const completedRows = [];
  for (const row of rows || []) {
    if (!completedRow(row)) continue;
    const metric = resultRowToMetric(row);
    const monthKey = normalizeMonthKey(row['月份'] || row['月'] || row['日期']);
    const districtKey = normalizeDistrict(row['行政區'] || row['區域'] || '');
    addMetric(summary, metric);
    completedRows.push(row);
    if (monthKey) {
      if (!months[monthKey]) months[monthKey] = emptyMetric();
      addMetric(months[monthKey], metric);
    }
    if (districtKey) {
      if (!districts[districtKey]) districts[districtKey] = emptyMetric();
      addMetric(districts[districtKey], metric);
    }
    if (monthKey && districtKey) {
      if (!monthDistricts[monthKey]) monthDistricts[monthKey] = {};
      if (!monthDistricts[monthKey][districtKey]) monthDistricts[monthKey][districtKey] = emptyMetric();
      addMetric(monthDistricts[monthKey][districtKey], metric);
    }
  }
  return { summary, months, districts, monthDistricts, completedRows: completedRows.length, rows: Array.isArray(rows) ? rows.length : 0 };
}
async function fetchResultsSheetCsv() {
  const id = RESULTS_GOOGLE_SHEET_ID;
  if (!id) return { ok:false, error:'missing RESULTS_GOOGLE_SHEET_ID' };
  const gid = RESULTS_GOOGLE_SHEET_GID || '617607580';
  const urls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(gid)}`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/pub?gid=${encodeURIComponent(gid)}&single=true&output=csv`
  ];
  let last = null;
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, { redirect:'follow' }, 9000);
      const txt = await r.text();
      if (r.ok && txt.includes('月份') && txt.includes('行政區') && txt.includes('辨識車流')) return { ok:true, url, status:r.status, text:txt, rows:parseCsv(txt).length };
      last = { ok:false, status:r.status, error:txt.slice(0,160) };
    } catch(e) { last = { ok:false, error:e.message }; }
  }
  return last || { ok:false, error:'無法讀取成果統計 Sheet' };
}
async function syncResultsFromSheet() {
  const fetched = await fetchResultsSheetCsv();
  const store = getStore();
  if (!fetched.ok) {
    store.lastResultsSync = { at: nowIso(), atTaipei: taipeiTime(), ok:false, error:fetched.error || `HTTP ${fetched.status || ''}`.trim(), sheetId: RESULTS_GOOGLE_SHEET_ID, gid: RESULTS_GOOGLE_SHEET_GID };
    safeJsonWrite(STORE_PATH, store);
    return { ok:false, checkedAt:taipeiTime(), error:store.lastResultsSync.error, cached:true, summary:store.summary || {}, sheetId:RESULTS_GOOGLE_SHEET_ID, gid:RESULTS_GOOGLE_SHEET_GID };
  }
  const rows = csvToObjects(fetched.text);
  const agg = aggregateResultsRows(rows);
  store.summary = { ...agg.summary, dashboardConsistent:false, source:'resultsSheet' };
  store.months = agg.months;
  store.districts = agg.districts;
  store.monthDistricts = agg.monthDistricts;
  store.lastResultsSync = { at:nowIso(), atTaipei:taipeiTime(), ok:true, rows:agg.rows, completedRows:agg.completedRows, sheetId:RESULTS_GOOGLE_SHEET_ID, gid:RESULTS_GOOGLE_SHEET_GID };
  safeJsonWrite(STORE_PATH, store);
  return { ok:true, checkedAt:store.lastResultsSync.atTaipei, rows:agg.rows, completedRows:agg.completedRows, summary:agg.summary, monthCount:Object.keys(agg.months).length, districtCount:Object.keys(agg.districts).length, sheetId:RESULTS_GOOGLE_SHEET_ID, gid:RESULTS_GOOGLE_SHEET_GID };
}

async function syncSheetsStatus() {
  const results = await syncResultsFromSheet();
  const out = { top100: await fetchSheetCsv(env('TOP100_GOOGLE_SHEET_ID')), results: { ok: results.ok, count: results.completedRows || 0, monthCount: results.monthCount || 0, districtCount: results.districtCount || 0, error: results.error || null, sheetId: RESULTS_GOOGLE_SHEET_ID, gid: RESULTS_GOOGLE_SHEET_GID }, field: await fetchSheetCsv(env('FIELD_GOOGLE_SHEET_ID'), FIELD_GOOGLE_SHEET_GID), equipment: await fetchSheetCsv(EQUIPMENT_GOOGLE_SHEET_ID, EQUIPMENT_GOOGLE_SHEET_GID), complaints: await fetchSheetCsv(COMPLAINT_GOOGLE_SHEET_ID, COMPLAINT_GOOGLE_SHEET_GID) };
  const equipment = await syncEquipmentFromSheet();
  const live = await syncLiveEquipmentFromFieldSheet();
  const complaints = await syncComplaintsFromSheet();
  out.complaints = { ok: complaints.ok, count: complaints.count, cached: !!complaints.cached, error: complaints.error || null, sheetId: COMPLAINT_GOOGLE_SHEET_ID, gid: COMPLAINT_GOOGLE_SHEET_GID };
  out.equipment = { ok: equipment.ok, count: equipment.count, error: equipment.error || null, sheetId: EQUIPMENT_GOOGLE_SHEET_ID };
  out.equipmentLive = { ok: live.ok, count: live.count, counts: live.counts || null, error: live.error || null, sheetId: env('FIELD_GOOGLE_SHEET_ID'), gid: FIELD_GOOGLE_SHEET_GID };
  const store = getStore();
  store.lastDataSync = { at: nowIso(), atTaipei: taipeiTime(), status: out };
  safeJsonWrite(STORE_PATH, store);
  return { ok:true, checkedAt: taipeiTime(), sheets: out };
}
async function updateRichMenuAndSyncSheets() {
  const richMenu = await updateRichMenu();
  const sheets = await syncSheetsStatus();
  const news = await refreshNews();
  const store = getStore();
  store.lastLineUpdate = { at: nowIso(), atTaipei: taipeiTime(), status: { richMenuOk: richMenu.ok, sheetsOk: sheets.ok, newsOk: news.ok, autoSyncedAfterRichMenu: true } };
  safeJsonWrite(STORE_PATH, store);
  return { ok: !!richMenu.ok && !!sheets.ok, richMenu, sheets, news, lastLineUpdate: store.lastLineUpdate };
}

async function updateLineAll() {
  const status = await getLineStatus();
  const richMenuAndSync = await updateRichMenuAndSyncSheets();
  const store = getStore();
  store.lastLineUpdate = { at: nowIso(), atTaipei: taipeiTime(), status: { lineReady: status.ok, richMenuOk: richMenuAndSync.richMenu?.ok, newsOk: richMenuAndSync.news?.ok, sheetsOk: richMenuAndSync.sheets?.ok, autoSyncedAfterRichMenu: true } };
  safeJsonWrite(STORE_PATH, store);
  return { ok: true, lineStatus: status, richMenu: richMenuAndSync.richMenu, sheets: richMenuAndSync.sheets, news: richMenuAndSync.news, lastLineUpdate: store.lastLineUpdate };
}


function systemStatusSnapshot(lineStatus = null) {
  const store = getStore();
  const sync = store.lastDataSync?.status || {};
  const top100Ok = sync.top100 ? !!sync.top100.ok : !!env('TOP100_GOOGLE_SHEET_ID');
  const resultsOk = sync.results ? !!sync.results.ok : !!env('RESULTS_GOOGLE_SHEET_ID');
  const fieldOk = sync.field ? !!sync.field.ok : !!env('FIELD_GOOGLE_SHEET_ID');
  const richMenuReady = !!store.lastLineUpdate?.status?.richMenuOk;
  const hasToken = !!env('LINE_CHANNEL_ACCESS_TOKEN');
  const hasSecret = !!env('LINE_CHANNEL_SECRET');
  const lineReady = lineStatus ? !!lineStatus.ok : (hasToken && hasSecret);
  const newsCount = Array.isArray(store.news?.items) ? store.news.items.length : 0;
  const photos = getPhotoRecords().length;
  const modules = [
    { key:'line', name:'LINE Bot', icon:'🤖', ok: lineReady, status: lineReady ? '正常' : '需設定', desc:'Token / Secret / Bot 連線' },
    { key:'richmenu', name:'Rich Menu', icon:'☰', ok: richMenuReady, status: richMenuReady ? '已套用' : '待更新', desc:'兩頁式：外勤/內勤、法規/資訊切換' },
    { key:'quick', name:'快速選項', icon:'⚡', ok:true, status:'已啟用', desc:'月份、行政區、法規按鈕回覆' },
    { key:'results', name:'成果資料', icon:'📊', ok: resultsOk, status: resultsOk ? '可讀取' : '需確認', desc:'監測成果 Google Sheet' },
    { key:'field', name:'外勤資料', icon:'📍', ok: fieldOk, status: fieldOk ? '可讀取' : '需確認', desc:'外勤回報 Google Sheet' },
    { key:'top100', name:'百大熱點', icon:'🗺️', ok: top100Ok, status: top100Ok ? '可讀取' : '需確認', desc:'百大點位 Google Sheet' },
    { key:'news', name:'法規新聞', icon:'📰', ok: newsCount > 0 ? true : null, status: newsCount > 0 ? `${newsCount} 筆` : '可手動更新', desc:'噪音車新聞與法規資訊' },
    { key:'photos', name:'外勤照片', icon:'🖼️', ok:true, status:`${photos} 筆`, desc:'現場佐證照片紀錄' },
    { key:'monthly', name:'月報中心', icon:'▣', ok:true, status:'可用', desc:'月報摘要與列印輸出' },
    { key:'platforms', name:'平台入口', icon:'↗', ok:true, status:'直連', desc:'成果、外勤、百大、案件追蹤' },
    { key:'case', name:'案件追蹤', icon:'🧾', ok:true, status:'直連', desc:'超標案件行政流程查詢' },
    { key:'legal', name:'法規中心', icon:'⚖️', ok:true, status:'可用', desc:'法條、指引、NIEA82B' },
    { key:'device', name:'設備管理', icon:'🛠️', ok: Array.isArray(store.equipment) && store.equipment.length > 0 ? true : null, status: (Array.isArray(store.equipment) && store.equipment.length > 0) ? `${store.equipment.length} 台` : '待同步', desc:'設備到期燈號與 Google Sheet 匯入/匯出' },
    { key:'liveDevice', name:'即時機況', icon:'📡', ok: Array.isArray(store.equipmentLive) && store.equipmentLive.length > 0 ? true : null, status: (Array.isArray(store.equipmentLive) && store.equipmentLive.length > 0) ? `${liveEquipmentCounts(store.equipmentLive).online} 運作｜${liveEquipmentCounts(store.equipmentLive).maintenance} 維護` : '待同步', desc:'外勤回報最新場次日＋後校正日推算設備生命週期；最新場次未填後校正日為上線' },
    { key:'complaintTrend', name:'陳情趨勢', icon:'📣', ok: Array.isArray(store.complaints) && store.complaints.length > 0 ? true : null, status: (Array.isArray(store.complaints) && store.complaints.length > 0) ? `${store.complaints.length} 筆` : '待同步', desc:'1999市政信箱陳情趨勢、同期比較與熱門點位' },
    { key:'plate', name:'車號追蹤', icon:'🚘', ok:true, status:'可查詢', desc:'車牌查詢與軌跡提示' }
  ];
  const overallOk = modules.filter(m => m.ok === false).length === 0;
  return {
    ok: true,
    overallOk,
    lineReady,
    botName: lineStatus && lineStatus.botInfo && lineStatus.botInfo.ok && lineStatus.botInfo.data ? lineStatus.botInfo.data.displayName : '',
    richMenuReady,
    richMenuMode: 'V62 使用者指定圖片 Rich Menu / 兩張獨立圖 / richmenuswitch 切換 / Sheet 安全驗證',
    lastLineUpdate: store.lastLineUpdate?.atTaipei || '',
    lastDataSync: store.lastDataSync?.atTaipei || '',
    sheetsChecked: !!store.lastDataSync || !!env('RESULTS_GOOGLE_SHEET_ID'),
    newsCount,
    summary: summary(),
    photoRecords: photos,
    modules,
    time: taipeiTime()
  };
}
function moduleCardsHtml(modules) {
  return (modules || []).map(x => `<div class="module-card ${x.ok === true ? 'ok' : (x.ok === false ? 'bad' : 'warn')}"><span class="icon">${esc(x.icon || '●')}</span><b>${esc(x.name)}</b><small>${esc(x.desc || '')}</small><span class="state">${esc(x.status || (x.ok ? '正常' : '注意'))}</span></div>`).join('') || '<div class="loading-line">尚無巡檢資料</div>';
}
function statusCardsHtml(obj) {
  const s = obj.summary || {};
  const cards = [
    ['整體狀態', obj.overallOk ? '可正常使用' : '需處理', obj.overallOk, obj.time || ''],
    ['LINE 連線', obj.lineReady ? '正常' : '需確認', obj.lineReady, obj.botName || 'Token / Secret'],
    ['Rich Menu', obj.richMenuReady ? '已套用' : '待更新', obj.richMenuReady, '兩頁式掀頁操作'],
    ['資料同步', obj.sheetsChecked ? '已檢查' : '尚未同步', !!obj.sheetsChecked, obj.lastDataSync || '請執行一鍵更新'],
    ['新聞快取', `${obj.newsCount || 0} 筆`, (obj.newsCount || 0) > 0, 'LINE 新聞查詢'],
    ['成果口徑', `${s.sessions || 0} 場｜KPI ${Number(s.kpi || 0).toFixed(2)}`, true, 'LINE 與平台一致']
  ];
  return `<div class="status-cards">${cards.map(c => `<div class="status-card ${c[2] === true ? 'ok' : (c[2] === false ? 'bad' : 'warn')}"><b>${esc(c[0])}</b><strong>${esc(c[1])}</strong><span>${esc(c[3] || '')}</span></div>`).join('')}</div>`;
}
async function systemStatusData() {
  let status = null;
  try { status = await getLineStatus(); } catch (e) { status = null; }
  return systemStatusSnapshot(status);
}



async function fetchFieldReportSheetCsv() {
  const id = env('FIELD_GOOGLE_SHEET_ID', '1BVZ4kEoKndO5OMAZmk8OLwplrzBL_Drt4xEmpzgejb8');
  if (!id) return { ok:false, error:'missing FIELD_GOOGLE_SHEET_ID' };
  const gid = FIELD_GOOGLE_SHEET_GID || '1228277001';
  const urls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(gid)}`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/pub?gid=${encodeURIComponent(gid)}&single=true&output=csv`
  ];
  let last = null;
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, { redirect:'follow' }, 9000);
      const txt = await r.text();
      if (r.ok && txt.includes('機台編號') && txt.includes('執勤地點')) return { ok:true, url, status:r.status, text:txt, rows:parseCsv(txt).length };
      last = { ok:false, status:r.status, error:txt.slice(0,160) };
    } catch(e) { last = { ok:false, error:e.message }; }
  }
  return last || { ok:false, error:'無法讀取外勤回報 Sheet' };
}
async function syncLiveEquipmentFromFieldSheet() {
  // 即時機況需要同時參考外勤架設回報與設備清冊內的後校正日。
  // 因此在同步外勤機況時，先嘗試刷新設備 Sheet，避免後校正日使用舊快取。
  try { await syncEquipmentFromSheet(); } catch (_) {}
  const fetched = await fetchFieldReportSheetCsv();
  const store = getStore();
  if (!fetched.ok) {
    store.lastLiveEquipmentSync = { at: nowIso(), atTaipei: taipeiTime(), ok:false, error:fetched.error || `HTTP ${fetched.status || ''}`.trim() };
    safeJsonWrite(STORE_PATH, store);
    return { ok:false, checkedAt:taipeiTime(), error:store.lastLiveEquipmentSync.error, count:Array.isArray(store.equipmentLive) ? store.equipmentLive.length : 0, cached:true };
  }
  const rows = csvToObjects(fetched.text);
  const items = liveEquipmentFromRows(rows, store);
  const counts = liveEquipmentCounts(items);
  store.equipmentLive = items;
  store.lastLiveEquipmentSync = { at:nowIso(), atTaipei:taipeiTime(), ok:true, count:items.length, counts, sheetId:env('FIELD_GOOGLE_SHEET_ID'), gid:FIELD_GOOGLE_SHEET_GID };
  safeJsonWrite(STORE_PATH, store);
  return { ok:true, checkedAt:store.lastLiveEquipmentSync.atTaipei, count:items.length, counts, equipmentLive:items, sheetId:env('FIELD_GOOGLE_SHEET_ID'), gid:FIELD_GOOGLE_SHEET_GID };
}
function liveEquipmentStatusData() {
  const store = getStore();
  const items = Array.isArray(store.equipmentLive) ? store.equipmentLive : [];
  const counts = liveEquipmentCounts(items);
  const summary = { ...counts, overallState: counts.maintenance > 0 ? '部分設備維護中' : (items.length ? '設備運作中' : '尚未同步') };
  return { ok:true, sheetId:env('FIELD_GOOGLE_SHEET_ID'), gid:FIELD_GOOGLE_SHEET_GID, sheetUrl:FIELD_GOOGLE_SHEET_URL, count:items.length, counts, summary, lastSync:store.lastLiveEquipmentSync || null, equipmentLive:items };
}

async function fetchEquipmentSheetCsv() {
  const id = EQUIPMENT_GOOGLE_SHEET_ID;
  if (!id) return { ok: false, error: 'missing EQUIPMENT_GOOGLE_SHEET_ID' };
  const urls = [
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(EQUIPMENT_GOOGLE_SHEET_GID || '0')}`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/pub?gid=${encodeURIComponent(EQUIPMENT_GOOGLE_SHEET_GID || '0')}&single=true&output=csv`
  ];
  let last = null;
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, { redirect: 'follow' }, 8000);
      const txt = await r.text();
      if (r.ok && txt.includes('機台編號')) return { ok: true, url, status: r.status, text: txt, rows: parseCsv(txt).length };
      last = { ok: false, status: r.status, error: txt.slice(0, 160) };
    } catch (e) { last = { ok: false, error: e.message }; }
  }
  return last || { ok:false, error:'無法讀取設備 Sheet' };
}
async function syncEquipmentFromSheet() {
  const fetched = await fetchEquipmentSheetCsv();
  const store = getStore();
  if (!fetched.ok) {
    store.lastEquipmentSync = { at: nowIso(), atTaipei: taipeiTime(), ok: false, error: fetched.error || `HTTP ${fetched.status || ''}`.trim() };
    safeJsonWrite(STORE_PATH, store);
    return { ok:false, checkedAt: taipeiTime(), error: store.lastEquipmentSync.error, count: Array.isArray(store.equipment) ? store.equipment.length : 0, cached: true };
  }
  const items = equipmentFromRows(csvToObjects(fetched.text));
  store.equipment = items;
  store.lastEquipmentSync = { at: nowIso(), atTaipei: taipeiTime(), ok: true, count: items.length, sheetId: EQUIPMENT_GOOGLE_SHEET_ID };
  safeJsonWrite(STORE_PATH, store);
  return { ok:true, checkedAt: store.lastEquipmentSync.atTaipei, count: items.length, equipment: items, sheetId: EQUIPMENT_GOOGLE_SHEET_ID };
}
function equipmentStatusData() {
  const store = getStore();
  const eq = Array.isArray(store.equipment) ? store.equipment : [];
  const counts = eq.reduce((a, e) => {
    const l = String(e.light || '⚪未填');
    const key = l.includes('🔴') ? 'red' : (l.includes('🟡') ? 'yellow' : (l.includes('🟢') ? 'green' : 'gray'));
    a[key] = (a[key] || 0) + 1;
    return a;
  }, { green:0, yellow:0, red:0, gray:0 });
  return { ok:true, sheetId: EQUIPMENT_GOOGLE_SHEET_ID, sheetUrl: EQUIPMENT_GOOGLE_SHEET_URL, count: eq.length, counts, lastSync: store.lastEquipmentSync || null, equipment: eq };
}

async function fetchSheetCsv(id, gid = '0') {
  if (!id) return { ok: false, error: 'missing sheet id' };
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&gid=${encodeURIComponent(gid || '0')}`;
  try {
    const r = await fetchWithTimeout(url, { redirect: 'follow' }, 6500);
    const txt = await r.text();
    return { ok: r.ok, status: r.status, bytes: txt.length, rows: txt.split(/\r?\n/).filter(Boolean).length, error: r.ok ? null : txt.slice(0, 120) };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function handle(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);
  try {
    if (req.method === 'GET' && pathname === '/admin-gate.html') return html(res, adminGatePage());
    if (req.method === 'GET' && pathname === '/admin-login') return redirect(res, '/admin-gate.html');
    if (req.method === 'POST' && pathname === '/admin-login') {
      const bodyRaw = await readBody(req);
      const params = new URLSearchParams(bodyRaw.toString('utf8'));
      const password = String(params.get('password') || '');
      if (password === ADMIN_PASSWORD) {
        setAdminSessionCookie(res);
        return redirect(res, '/admin.html');
      }
      return html(res, adminGatePage('密碼錯誤，請重新輸入。'), 401);
    }
    if (req.method === 'POST' && pathname === '/admin-logout') {
      clearAdminSessionCookie(res);
      return redirect(res, '/admin-gate.html');
    }
    if ((pathname === '/admin.html' || pathname.startsWith('/api/admin/')) && !isAdminAuthed(req)) {
      if (pathname.startsWith('/api/admin/')) return json(res, 401, { ok:false, error:'admin authentication required', login:'/admin-gate.html' });
      return redirect(res, '/admin-gate.html');
    }
    if (req.method === 'GET' && pathname === '/') return redirect(res, '/admin.html');
    if (req.method === 'GET' && pathname === '/healthz') return json(res, 200, { ok: true, service: SERVICE_NAME, version: APP_VERSION, noInstall: true, hasAdminPassword: !!ADMIN_PASSWORD, hasSessionSecret: !!env('SESSION_SECRET'), time: taipeiTime() });
    if (req.method === 'GET' && pathname === '/api/deploy/check') return json(res, 200, { ok: true, service: SERVICE_NAME, version: APP_VERSION, noInstall: true, npmInstallRequired: false, expressRequired: false, files: { packageJson: fs.existsSync(path.join(ROOT, 'package.json')), serverJs: fs.existsSync(path.join(ROOT, 'server.js')), dockerfile: fs.existsSync(path.join(ROOT, 'Dockerfile')), public: fs.existsSync(PUBLIC_DIR), data: fs.existsSync(DATA_DIR), uploads: fs.existsSync(path.join(ROOT, 'uploads')) }, env: { lineToken: !!env('LINE_CHANNEL_ACCESS_TOKEN'), lineSecret: !!env('LINE_CHANNEL_SECRET'), top100Sheet: !!env('TOP100_GOOGLE_SHEET_ID'), resultsSheet: !!RESULTS_GOOGLE_SHEET_ID, resultsSheetGid: RESULTS_GOOGLE_SHEET_GID, fieldSheet: !!env('FIELD_GOOGLE_SHEET_ID'), resultsCompletedSessions: env('RESULTS_COMPLETED_SESSIONS', ''), resultsCases: env('RESULTS_CASES', ''), photoStorageMode: env('PHOTO_STORAGE_MODE', 'local'), caseTrackingUrl: CASE_TRACKING_URL, equipmentSheet: !!EQUIPMENT_GOOGLE_SHEET_ID, fieldSheetGid: FIELD_GOOGLE_SHEET_GID, complaintSheet: !!COMPLAINT_GOOGLE_SHEET_ID, complaintSheetGid: COMPLAINT_GOOGLE_SHEET_GID, autoSyncSheetsOnStartup: env('AUTO_SYNC_SHEETS_ON_STARTUP','true'), gsheetSyncIntervalMin: env('GSHEET_SYNC_INTERVAL_MIN','60') } });
    if (req.method === 'GET' && pathname === '/api/integration/status') return json(res, 200, { ok: true, service: SERVICE_NAME, links: { dashboard: env('DASHBOARD_URL', 'https://noise115.zeabur.app'), field: env('FIELD_REPORT_URL', 'https://out115.zeabur.app'), hotspot: env('HOTSPOT_URL', 'https://ntpcnoisely.zeabur.app/login'), caseTracking: CASE_TRACKING_URL, photoUpload: `${PUBLIC_BASE_URL}/field/photos.html`, monthlyReport: `${PUBLIC_BASE_URL}/report/monthly.html` }, summary: summary(), complaintTrend: aggregateComplaints({}), photoRecords: getPhotoRecords().length });
    if (req.method === 'GET' && pathname === '/api/report/monthly') return json(res, 200, { ok: true, service: SERVICE_NAME, report: scopedSummary({ month: urlObj.searchParams.get('month') || '', district: urlObj.searchParams.get('district') || '' }) });
    if (req.method === 'GET' && pathname === '/api/complaints/trend') return json(res, 200, { ok: true, service: SERVICE_NAME, trend: aggregateComplaints({ year: urlObj.searchParams.get('year') || '', month: urlObj.searchParams.get('month') || '', district: urlObj.searchParams.get('district') || '', period: urlObj.searchParams.get('period') || '', keyword: urlObj.searchParams.get('keyword') || '' }) });
    if (req.method === 'GET' && pathname === '/api/admin/complaints/status') return json(res, 200, complaintStatusData({}));
    if (req.method === 'POST' && pathname === '/api/admin/complaints/sync') return json(res, 200, await syncComplaintsFromSheet());
    if (req.method === 'GET' && pathname === '/api/admin/data-consistency') return json(res, 200, { ok: true, summary: summary(), hotspots: (getStore().hotspots || []).length, photoRecords: getPhotoRecords().length, storeReadable: fs.existsSync(STORE_PATH), photoRecordsReadable: fs.existsSync(PHOTO_RECORDS_PATH), time: taipeiTime() });
    if (req.method === 'GET' && pathname === '/api/admin/system/status') return json(res, 200, await systemStatusData());
    if (req.method === 'GET' && pathname === '/api/sheets/status') {
      const out = { top100: await fetchSheetCsv(env('TOP100_GOOGLE_SHEET_ID')), results: await fetchSheetCsv(RESULTS_GOOGLE_SHEET_ID, RESULTS_GOOGLE_SHEET_GID), field: await fetchSheetCsv(env('FIELD_GOOGLE_SHEET_ID'), FIELD_GOOGLE_SHEET_GID), equipment: await fetchSheetCsv(EQUIPMENT_GOOGLE_SHEET_ID, EQUIPMENT_GOOGLE_SHEET_GID), complaints: await fetchSheetCsv(COMPLAINT_GOOGLE_SHEET_ID, COMPLAINT_GOOGLE_SHEET_GID) };
      return json(res, 200, { ok: true, checkedAt: taipeiTime(), sheets: out });
    }
    if (req.method === 'GET' && pathname === '/equipment-live.html') return html(res, equipmentLivePage());
    if (req.method === 'GET' && pathname === '/api/admin/equipment-live/status') return json(res, 200, liveEquipmentStatusData());
    if (req.method === 'GET' && pathname === '/api/admin/equipment-live/sync-status') return json(res, 200, liveEquipmentStatusData());
    if (req.method === 'GET' && pathname === '/api/admin/equipment/status') return json(res, 200, equipmentStatusData());
    if (req.method === 'POST' && pathname === '/api/admin/equipment/import') return json(res, 200, await syncEquipmentFromSheet());
    if (req.method === 'GET' && pathname === '/api/admin/equipment/live-status') return json(res, 200, liveEquipmentStatusData());
    if (req.method === 'POST' && pathname === '/api/admin/equipment/live-sync') return json(res, 200, await syncLiveEquipmentFromFieldSheet());
    if (req.method === 'POST' && pathname === '/api/admin/results/sync') return json(res, 200, await syncResultsFromSheet());
    if (req.method === 'GET' && pathname === '/api/admin/results/status') return json(res, 200, { ok:true, sheetId:RESULTS_GOOGLE_SHEET_ID, gid:RESULTS_GOOGLE_SHEET_GID, sheetUrl:RESULTS_GOOGLE_SHEET_URL, lastSync:getStore().lastResultsSync || null, summary:summary(), months:getStore().months || {}, districts:getStore().districts || {}, monthDistricts:getStore().monthDistricts || {} });
    if (req.method === 'GET' && pathname === '/api/admin/export/complaints-csv') {
      const csv = complaintCsv(complaintRows());
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="complaint-trends.csv"' });
      return res.end(csv);
    }
    if (req.method === 'GET' && pathname === '/api/admin/export/equipment-live-csv') {
      const csv = liveEquipmentCsv(getStore().equipmentLive || []);
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="equipment-live-status.csv"' });
      return res.end(csv);
    }
    if (req.method === 'GET' && pathname === '/api/admin/export/equipment-csv') {
      const csv = equipmentCsv(getStore().equipment || []);
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="equipment-management.csv"' });
      return res.end(csv);
    }
    if (req.method === 'GET' && pathname === '/api/line/test') return json(res, 200, { ok: true, service: SERVICE_NAME, hasToken: !!env('LINE_CHANNEL_ACCESS_TOKEN'), hasSecret: !!env('LINE_CHANNEL_SECRET'), sampleReply: progressText() });
    if (req.method === 'GET' && pathname === '/api/legal/news') return json(res, 200, getStore().news || { items: [] });
    if (req.method === 'GET' && pathname === '/api/field/photos/list') {
      const records = getPhotoRecords().map(r => ({ ...r, completion: photoCompletion(r), distanceText: distanceReminder(r.signDistance), createdAtTaipei: r.createdAt ? taipeiTime(r.createdAt) : '' }));
      return json(res, 200, { ok: true, records });
    }
    if (req.method === 'GET' && (pathname === '/api/admin/export/field-photos-csv' || pathname === '/api/admin/export/field-photos-xlsx')) {
      const rows = [['場次','日期','行政區','機台','地點','告示牌距離','距離提醒','照片數','完整度','照片類型','照片連結','上傳時間','備註']];
      for (const r of getPhotoRecords()) {
        const ps = r.photos && r.photos.length ? r.photos : [{}];
        for (const p of ps) rows.push([r.sessionNo, r.date, r.district, r.deviceId, r.location, r.signDistance, distanceReminder(r.signDistance), (r.photos || []).length, photoCompletion(r)+'%', p.label || p.type || '', p.url ? PUBLIC_BASE_URL + p.url : '', r.createdAt ? taipeiTime(r.createdAt) : '', r.note]);
      }
      const csv = '\uFEFF' + rows.map(row => row.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="field-photos.csv"' });
      return res.end(csv);
    }
    if (req.method === 'GET' && pathname === '/complaints/trend.html') return html(res, complaintTrendPage(urlObj));
    if (req.method === 'GET' && pathname === '/platforms.html') return html(res, platformGuidePage());
    if (req.method === 'GET' && pathname === '/sheet-auth.html') return html(res, sheetAuthPage(urlObj));
    if (req.method === 'POST' && pathname === '/api/sheet-auth/verify') return json(res, 200, verifySheetAuthRequest(parseJsonBody(await readBody(req, 64 * 1024))));
    if (req.method === 'GET' && pathname === '/line-help.html') return html(res, lineHelpPage());
    if (req.method === 'GET' && pathname === '/api/admin/line/status') return json(res, 200, await getLineStatus());
    if (req.method === 'GET' && pathname === '/api/admin/line/rich-menu-diagnostics') return json(res, 200, { ok:true, serviceName:SERVICE_NAME, appVersion:APP_VERSION, defaultRichMenu: await getDefaultRichMenu(), richMenus: await listRichMenus(), localMainImage: (() => { const p=path.join(PUBLIC_DIR,'assets','line-rich-menu-main.jpg'); return fs.existsSync(p) ? { file:path.basename(p), bytes:fs.statSync(p).size } : { missing:true }; })() });
    if (req.method === 'POST' && pathname === '/api/admin/line/update-all') return json(res, 200, await updateLineAll());
    if (req.method === 'POST' && pathname === '/api/admin/line/update-rich-menu') return json(res, 200, await updateRichMenuAndSyncSheets());
    if (req.method === 'POST' && pathname === '/api/admin/news/refresh') return json(res, 200, await refreshNews());
    if (req.method === 'POST' && pathname === '/api/admin/sheets/sync') return json(res, 200, await syncSheetsStatus());
    if (req.method === 'GET' && pathname === '/admin.html') return html(res, adminPage());
    if (req.method === 'GET' && pathname === '/field/photos.html') return html(res, photoUploadPage());
    if (req.method === 'GET' && pathname === '/admin/field-photos.html') return html(res, photoAdminPage());
    if (req.method === 'GET' && pathname === '/report/monthly.html') return html(res, reportPage(urlObj));
    if (req.method === 'POST' && pathname === '/api/field/photos/upload') {
      const max = Math.max(PHOTO_MAX_FILES * PHOTO_MAX_SIZE_MB * 1024 * 1024 * 1.5, 5 * 1024 * 1024);
      const body = parseJsonBody(await readBody(req, max));
      const photos = Array.isArray(body.photos) ? body.photos.slice(0, PHOTO_MAX_FILES) : [];
      const id = `${normName(body.sessionNo || 'SESSION')}_${Date.now()}`;
      const dir = path.join(UPLOAD_DIR, id);
      fs.mkdirSync(dir, { recursive: true });
      const saved = [];
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        const parsed = parseDataUrl(p.dataUrl);
        if (!parsed) continue;
        if (parsed.buffer.length > PHOTO_MAX_SIZE_MB * 1024 * 1024) continue;
        const ext = extFromMime(parsed.mime);
        const name = `${String(i + 1).padStart(2, '0')}_${normName(p.type)}${ext}`;
        const filePath = path.join(dir, name);
        fs.writeFileSync(filePath, parsed.buffer);
        const typeInfo = PHOTO_TYPES.find(x => x[0] === p.type);
        saved.push({ type: p.type || 'extra', label: typeInfo ? typeInfo[1] : (p.type || '補充照片'), originalName: p.name || '', url: `/uploads/field-photos/${id}/${name}`, size: parsed.buffer.length });
      }
      const rec = { id, sessionNo: body.sessionNo || '', date: body.date || '', district: body.district || '', deviceId: body.deviceId || '', location: body.location || '', signDistance: body.signDistance || '', reporter: body.reporter || '', note: body.note || '', photos: saved, createdAt: nowIso(), updatedAt: nowIso() };
      const records = getPhotoRecords();
      records.push(rec);
      savePhotoRecords(records);
      return json(res, 200, { ok: true, record: { ...rec, completion: photoCompletion(rec), distanceText: distanceReminder(rec.signDistance) } });
    }
    if (req.method === 'POST' && pathname === '/api/line/webhook') {
      const buf = await readBody(req, 2 * 1024 * 1024);
      if (!verifyLineSignature(req, buf)) return json(res, 403, { ok: false, error: 'invalid signature' });
      const body = parseJsonBody(buf);
      const events = Array.isArray(body.events) ? body.events : [];
      for (const ev of events) {
        if (ev.type === 'message' && ev.message?.type === 'text') {
          await showLineWaitingIfNeeded(ev, ev.message.text);
          await replyLine(ev.replyToken, lineReplyFor(ev.message.text, ev.source));
        }
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/line/simulate') {
      const body = parseJsonBody(await readBody(req));
      { const reply = lineReplyFor(body.text || '', { userId: 'simulator' }); return json(res, 200, { ok: true, preview: previewReply(reply), lineMessages: lineMessagesFor(reply).map(m => ({ type: m.type, altText: m.altText || '', title: m.template?.title || '', text: m.text || m.template?.text || '', actions: m.template?.actions?.map(a => a.label) || [], quick: (m.quickReply?.items || []).map(i => i.action?.label).filter(Boolean) })) }); }
    }
    if (req.method === 'GET' && pathname.startsWith('/assets/')) return serveFile(res, path.join(PUBLIC_DIR, pathname));
    if (req.method === 'GET' && pathname.startsWith('/uploads/')) return serveFile(res, path.join(ROOT, pathname));
    return notFound(res);
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message || String(e), service: SERVICE_NAME });
  }
}


let sheetAutoSyncTimer = null;
function scheduleAutoSheetSync() {
  const enabled = env('AUTO_SYNC_SHEETS_ON_STARTUP', 'true') !== 'false';
  const intervalMin = Math.max(Number(env('GSHEET_SYNC_INTERVAL_MIN', '60')) || 60, 5);
  if (!enabled) {
    console.log('Google Sheet auto sync disabled by AUTO_SYNC_SHEETS_ON_STARTUP=false');
    return;
  }
  setTimeout(async () => {
    try {
      const r = await syncSheetsStatus();
      console.log('Google Sheet startup sync:', JSON.stringify({ ok:r.ok, checkedAt:r.checkedAt }));
    } catch (e) {
      console.error('Google Sheet startup sync failed:', e.message || e);
    }
  }, 3500);
  sheetAutoSyncTimer = setInterval(async () => {
    try {
      const r = await syncSheetsStatus();
      console.log('Google Sheet scheduled sync:', JSON.stringify({ ok:r.ok, checkedAt:r.checkedAt }));
    } catch (e) {
      console.error('Google Sheet scheduled sync failed:', e.message || e);
    }
  }, intervalMin * 60 * 1000);
}

http.createServer(handle).listen(PORT, '0.0.0.0', () => {
  console.log(`${SERVICE_NAME} running on 0.0.0.0:${PORT}`);
  console.log('No npm dependencies required. Docker build skips npm install.');
  scheduleAutoSheetSync();
});
