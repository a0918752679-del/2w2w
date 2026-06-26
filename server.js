
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const PORT = Number(process.env.PORT || 8080);
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const GOOGLE_AUTO_SYNC = String(process.env.GOOGLE_AUTO_SYNC || 'false').toLowerCase() === 'true';
const SHEET_RAW = process.env.GOOGLE_SHEET_RAW_NAME || '執行成效資料';
const SHEET_VEHICLES = process.env.GOOGLE_SHEET_VEHICLE_NAME || '車輛案件資料';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_WEBHOOK_VERIFY = String(process.env.LINE_WEBHOOK_VERIFY || 'false').toLowerCase() === 'true';
const DASHBOARD_ADMIN_TOKEN = process.env.DASHBOARD_ADMIN_TOKEN || process.env.ADMIN_TOKEN || '';
const DASHBOARD_EDITOR_TOKEN = process.env.DASHBOARD_EDITOR_TOKEN || '';

const DATA_FILE = path.join(__dirname, 'data', 'dashboard-cache.json');
const BUILTIN_DATA_FILE = path.join(__dirname, 'data', 'builtin-dashboard-cache.json');
const RAW_COLUMNS = ['場次編號','機台編號','案件來源','執行時段','日期','月份','行政區','點位地址','辨識車流','超標數','告發件數','通知到檢件數','告發金額','是否完成'];
const VEHICLE_COLUMNS = ['案件類型','車牌','車種','日期','量測時間','行政區','點位地址','道路','量測值','標準值','超標值','金額','案件編號','官方註記','來源備註'];

function ensureDataDir(){ fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); }
function ensureData(){
  ensureDataDir();
  if(!fs.existsSync(DATA_FILE)){
    if(fs.existsSync(BUILTIN_DATA_FILE)){
      fs.copyFileSync(BUILTIN_DATA_FILE, DATA_FILE);
    }else{
      fs.writeFileSync(DATA_FILE, JSON.stringify({ raw: [], vehicles: [], updatedAt: '' }, null, 2), 'utf8');
    }
  }
}
function readData(){ ensureData(); try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))}catch{return {raw:[],vehicles:[],updatedAt:''}} }
function writeData(data){ ensureDataDir(); fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'); }
function googleSheetConfigured(){ return Boolean(GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_JSON); }
function b64url(input){ return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function getGoogleCredentials(){
  if(!GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('未設定 GOOGLE_SERVICE_ACCOUNT_JSON。');
  const raw = GOOGLE_SERVICE_ACCOUNT_JSON.trim();
  try{ return raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(Buffer.from(raw,'base64').toString('utf8')); }
  catch(e){ throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 格式錯誤，請貼 JSON 原文或 base64。'); }
}
async function getGoogleAccessToken(){
  const c = getGoogleCredentials();
  const now = Math.floor(Date.now()/1000);
  const header = {alg:'RS256',typ:'JWT'};
  const claim = {iss:c.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now};
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign('RSA-SHA256'); signer.update(unsigned);
  const sig = signer.sign(c.private_key,'base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const res = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${sig}`})});
  const json = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`Google Token 取得失敗：${json.error_description||json.error||res.status}`);
  return json.access_token;
}
function encRange(range){ return encodeURIComponent(range).replace(/%21/g,'!'); }
async function googleSheetsRequest(method, url, body){
  const token = await getGoogleAccessToken();
  const res = await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const text = await res.text(); let json={}; try{json=text?JSON.parse(text):{}}catch{json={raw:text}}
  if(!res.ok) throw new Error(json?.error?.message || text || `Google Sheets API ${res.status}`);
  return json;
}
async function ensureNamedSheetExists(name){
  if(!GOOGLE_SHEET_ID) throw new Error('未設定 GOOGLE_SHEET_ID。');
  const meta = await googleSheetsRequest('GET', `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}`);
  const exists = (meta.sheets||[]).some(s => s.properties?.title === name);
  if(!exists){
    await googleSheetsRequest('POST', `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}:batchUpdate`, {requests:[{addSheet:{properties:{title:name}}}]});
  }
}
function normalizeHeader(v){ return String(v ?? '').trim().toLowerCase().replace(/[\s_\-／/（）()：:]/g,''); }
function valueBy(row,aliases){
  const normalized={}; Object.entries(row||{}).forEach(([k,v])=>normalized[normalizeHeader(k)] = v);
  for(const a of aliases){ const k=normalizeHeader(a); if(Object.prototype.hasOwnProperty.call(normalized,k)) return normalized[k]; }
  return '';
}
function toNum(v){ if(v===null||v===undefined||v==='') return 0; const n=Number(String(v).replace(/,/g,'').replace(/元|件|場|db/ig,'')); return Number.isFinite(n)?n:0; }
function toBool(v){ if(typeof v==='boolean')return v; const t=String(v??'').trim().toLowerCase(); return !['false','0','否','未完成','no','n'].includes(t); }
function pad2(v){ return String(v).padStart(2,'0'); }
function excelSerialToDate(n){ const d=new Date(Math.round((Number(n)-25569)*86400*1000)); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`; }
function normalizeDate(v){
  if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
  if(typeof v==='number' && v>20000) return excelSerialToDate(v);
  let t=String(v??'').trim(); if(!t)return '';
  if(/^\d+(\.\d+)?$/.test(t) && Number(t)>20000) return excelSerialToDate(Number(t));
  t=t.replace(/[/.]/g,'-').replace(/年/g,'-').replace(/月/g,'-').replace(/日/g,'').replace(/\s+.*/,'');
  const m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(m)return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  const roc=t.match(/^(\d{2,3})-(\d{1,2})-(\d{1,2})$/); if(roc)return `${Number(roc[1])+1911}-${pad2(roc[2])}-${pad2(roc[3])}`;
  return t;
}
function normalizeDateTime(v,dateFallback=''){
  if(v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())} ${pad2(v.getHours())}:${pad2(v.getMinutes())}:${pad2(v.getSeconds())}`;
  let t=String(v??'').trim(); if(!t)return dateFallback;
  t=t.replace(/[年月]/g,'-').replace(/日/g,'').replace(/\//g,'-');
  const compact=t.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2}:\d{2})$/); if(compact)return `${compact[1]}-${compact[2]}-${compact[3]} ${compact[4]}`;
  const roc=t.match(/^(\d{3})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2}:\d{2})$/); if(roc)return `${Number(roc[1])+1911}-${roc[2]}-${roc[3]} ${roc[4]}`;
  return t;
}
function extractDistrict(location){ const m=String(location||'').match(/(萬里|金山|板橋|汐止|深坑|石碇|瑞芳|平溪|雙溪|貢寮|新店|坪林|烏來|永和|中和|土城|三峽|樹林|鶯歌|三重|新莊|泰山|林口|蘆洲|五股|八里|淡水|三芝|石門)區/); return m?m[0]:''; }
function stripDistrict(location,district){ let s=String(location||'').replace(/^新北市/,'').trim(); if(district&&s.startsWith(district))s=s.slice(district.length); return s.trim(); }
function mapRawRow(row,index=0){
  const date=normalizeDate(valueBy(row,['日期','date','執行日期','監測日期']));
  const seqRaw=valueBy(row,['場次編號','場次','序號','seq','id']);
  return {
    seq:toNum(seqRaw)||index+1,
    machine:String(valueBy(row,['機台編號','機台','machine','設備編號'])||'').trim(),
    caseType:String(valueBy(row,['案件來源','案件類型','caseType','來源'])||'').trim(),
    period:String(valueBy(row,['執行時段','時段','period'])||'').trim(),
    date,
    month:toNum(valueBy(row,['月份','month']))||toNum((date.split('-')[1]||'')),
    district:String(valueBy(row,['行政區','district','區域'])||'').trim(),
    location:String(valueBy(row,['點位地址','點位','地址','location','監測地點'])||'').trim(),
    vehicles:toNum(valueBy(row,['辨識車流','車流辨識量','車流','vehicles'])),
    over:toNum(valueBy(row,['超標數','超標件數','over'])),
    fineCases:toNum(valueBy(row,['告發件數','告發','fineCases'])),
    inspectCases:toNum(valueBy(row,['通知到檢件數','通檢件數','通檢','inspectCases'])),
    fineAmount:toNum(valueBy(row,['告發金額','金額','fineAmount'])),
    completed:toBool(valueBy(row,['是否完成','完成','completed'])||true)
  };
}
function mapVehicleRow(row,index=0){
  const sourceDate=normalizeDate(valueBy(row,['日期','date','案件日期','量測日期']));
  const datetime=normalizeDateTime(valueBy(row,['量測時間','日期時間','datetime','時間','稽查時段']),sourceDate);
  const date=/^\d{4}-\d{2}-\d{2}/.test(datetime)?datetime.slice(0,10):sourceDate;
  const location=String(valueBy(row,['點位地址','點位','地址','location','量測位置地點'])||'').trim();
  const district=String(valueBy(row,['行政區','district','區域','便於複製(行政區)'])||extractDistrict(location)).trim();
  const db=toNum(valueBy(row,['量測值','分貝值','db','背景修正後分貝']));
  const standard=toNum(valueBy(row,['標準值','標準','standard','管制標準']));
  const exceedInput=valueBy(row,['超標值','超標分貝','exceed']);
  const caseType=String(valueBy(row,['案件類型','caseType','類型','_caseType'])||'').trim();
  return {
    caseType,
    plate:String(valueBy(row,['車牌','plate','車牌號碼','車號'])||'').trim().toUpperCase(),
    vehicleType:String(valueBy(row,['車種','vehicleType','車輛種類'])||'').trim(),
    date,
    datetime,
    location,
    district,
    road:String(valueBy(row,['道路','road','路段','便於複製(路段)'])||stripDistrict(location,district)).trim(),
    db, standard,
    exceed:exceedInput===''?Math.round((db-standard)*10)/10:toNum(exceedInput),
    amount:caseType==='通檢'?0:toNum(valueBy(row,['金額','罰鍰','amount'])),
    caseNo:String(valueBy(row,['案件編號','案號','caseNo','告發單號','稽查編號'])||'').trim(),
    officialRepeat:String(valueBy(row,['官方註記','是否累犯','officialRepeat'])||'').trim(),
    sourceNote:String(valueBy(row,['來源備註','備註','承辦複核','sourceNote'])||'').trim()
  };
}
function rawToRow(r){ return [r.seq??'',r.machine||'',r.caseType||'',r.period||'',r.date||'',r.month??'',r.district||'',r.location||'',r.vehicles??0,r.over??0,r.fineCases??0,r.inspectCases??0,r.fineAmount??0,r.completed?'是':'否']; }
function vehicleToRow(v){ return [v.caseType||'',v.plate||'',v.vehicleType||'',v.date||'',v.datetime||'',v.district||'',v.location||'',v.road||'',v.db??0,v.standard??0,v.exceed??0,v.amount??0,v.caseNo||'',v.officialRepeat||'',v.sourceNote||'']; }
function rowsToObjects(values){
  if(!values || values.length<2)return [];
  const headers=values[0];
  return values.slice(1).filter(r => r && r.some(c=>String(c??'').trim()!=='')).map(r => Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
async function readSheet(name, range='A:Z'){
  await ensureNamedSheetExists(name);
  const json=await googleSheetsRequest('GET',`https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encRange(`'${name}'!${range}`)}`);
  return json.values || [];
}
async function writeSheet(name, columns, rows){
  await ensureNamedSheetExists(name);
  await googleSheetsRequest('POST',`https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encRange(`'${name}'!A:Z`)}:clear`,{});
  await googleSheetsRequest('PUT',`https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${encRange(`'${name}'!A1`)}?valueInputOption=USER_ENTERED`,{values:[columns,...rows]});
}
async function pullFromGoogleSheet(){
  if(!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Google Sheet 尚未設定。');
  const rawValues=await readSheet(SHEET_RAW,'A:N');
  const vehicleValues=await readSheet(SHEET_VEHICLES,'A:O');
  const raw=rowsToObjects(rawValues).map(mapRawRow).filter(r=>r.date && r.location);
  const vehicles=rowsToObjects(vehicleValues).map(mapVehicleRow).filter(v=>v.caseType && v.plate && v.date);
  const data={raw,vehicles,updatedAt:new Date().toISOString(),source:'google-sheet'};
  writeData(data);
  return data;
}
async function pushToGoogleSheet(data){
  if(!GOOGLE_SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error('Google Sheet 尚未設定。');
  const raw=(data.raw||[]).map(mapRawRow);
  const vehicles=(data.vehicles||[]).map(mapVehicleRow);
  await writeSheet(SHEET_RAW, RAW_COLUMNS, raw.map(rawToRow));
  await writeSheet(SHEET_VEHICLES, VEHICLE_COLUMNS, vehicles.map(vehicleToRow));
  const out={raw,vehicles,updatedAt:new Date().toISOString(),source:'platform'};
  writeData(out);
  return {ok:true, raw:raw.length, vehicles:vehicles.length, updatedAt:out.updatedAt};
}
async function saveDashboardData(data, source='platform'){
  const raw=(data.raw||[]).map(mapRawRow);
  const vehicles=(data.vehicles||[]).map(mapVehicleRow);
  if(GOOGLE_AUTO_SYNC && googleSheetConfigured()) return await pushToGoogleSheet({raw,vehicles});
  const out={raw,vehicles,updatedAt:new Date().toISOString(),source};
  writeData(out);
  return {ok:true, raw:raw.length, vehicles:vehicles.length, updatedAt:out.updatedAt, storage:'zeabur-local'};
}
async function getDashboardData(){
  if(GOOGLE_AUTO_SYNC && googleSheetConfigured()){
    try{return await pullFromGoogleSheet();}catch(err){console.warn('[SHEET_PULL_FAILED]',err.message)}
  }
  return readData();
}
function summary(data){
  const raw=data.raw||[], vehicles=data.vehicles||[];
  const completed=raw.filter(r=>r.completed!==false);
  const fineVehicles=vehicles.filter(v=>String(v.caseType).includes('告發')).length;
  const inspectVehicles=vehicles.filter(v=>String(v.caseType).includes('通檢')).length;
  const sum=(arr,k)=>arr.reduce((s,r)=>s+(Number(r[k])||0),0);
  const byDistrict={};
  for(const r of raw){const d=r.district||'未填';byDistrict[d]=byDistrict[d]||{sessions:0,vehicles:0,over:0,fine:0,inspect:0};byDistrict[d].sessions++;byDistrict[d].vehicles+=Number(r.vehicles)||0;byDistrict[d].over+=Number(r.over)||0;byDistrict[d].fine+=Number(r.fineCases)||0;byDistrict[d].inspect+=Number(r.inspectCases)||0;}
  return {
    sessions: raw.length,
    completed: completed.length,
    vehicleDetected: sum(raw,'vehicles'),
    over: sum(raw,'over'),
    fineCases: sum(raw,'fineCases'),
    inspectCases: sum(raw,'inspectCases'),
    fineAmount: sum(raw,'fineAmount'),
    vehicleRows: vehicles.length,
    fineVehicles,
    inspectVehicles,
    byDistrict,
    updatedAt: data.updatedAt || ''
  };
}
function summaryMessage(data){
  const s=summary(data);
  return [
    '📊 聲音照相平台更新總數',
    `場次：${s.sessions} 場（完成 ${s.completed} 場）`,
    `辨識車流：${s.vehicleDetected.toLocaleString('zh-TW')}`,
    `超標數：${s.over.toLocaleString('zh-TW')}`,
    `告發件數：${s.fineCases.toLocaleString('zh-TW')}`,
    `通知到檢：${s.inspectCases.toLocaleString('zh-TW')}`,
    `車輛明細：${s.vehicleRows.toLocaleString('zh-TW')} 筆（告發 ${s.fineVehicles}／通檢 ${s.inspectVehicles}）`,
    `最後更新：${s.updatedAt ? new Date(s.updatedAt).toLocaleString('zh-TW') : '-'}`
  ].join('\n');
}
function parseWorkbook(buffer){
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:true});
  const out={raw:[],vehicles:[]};
  for(const name of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:'',raw:false});
    if(!rows.length)continue;
    const norm=normalizeHeader(name);
    const headers=Object.keys(rows[0]||{}).map(normalizeHeader).join('|');
    if(norm.includes('車輛')||norm.includes('案件')||headers.includes('車牌')) out.vehicles.push(...rows.map(mapVehicleRow));
    else out.raw.push(...rows.map(mapRawRow));
  }
  return out;
}
function workbookBuffer(data){
  const wb=XLSX.utils.book_new();
  const raw=(data.raw||[]).map(mapRawRow).map(r=>Object.fromEntries(RAW_COLUMNS.map((h,i)=>[h, rawToRow(r)[i]])));
  const vehicles=(data.vehicles||[]).map(mapVehicleRow).map(v=>Object.fromEntries(VEHICLE_COLUMNS.map((h,i)=>[h, vehicleToRow(v)[i]])));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(raw,{header:RAW_COLUMNS}),SHEET_RAW);
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(vehicles,{header:VEHICLE_COLUMNS}),SHEET_VEHICLES);
  return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
}
async function replyLine(replyToken,text){
  if(!LINE_CHANNEL_ACCESS_TOKEN || !replyToken){
    console.warn('[LINE_REPLY_SKIPPED]', { hasToken:Boolean(LINE_CHANNEL_ACCESS_TOKEN), hasReplyToken:Boolean(replyToken) });
    return {ok:false,skipped:true};
  }
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method:'POST',
    headers:{Authorization:`Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({replyToken,messages:[{type:'text',text:String(text || '').slice(0,4900)}]})
  });
  const body = await res.text();
  if(!res.ok){
    console.warn('[LINE_REPLY_FAILED]', res.status, body);
    return {ok:false,status:res.status,body};
  }
  console.log('[LINE_REPLY_OK]');
  return {ok:true};
}
function verifyLineSignature(req){
  if(!LINE_WEBHOOK_VERIFY)return true;
  const sig=req.get('x-line-signature')||'';
  const expected=crypto.createHmac('sha256',LINE_CHANNEL_SECRET).update(req.rawBody||'').digest('base64');
  try{return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}
}

const ROLE_LEVEL = { viewer: 0, editor: 1, admin: 2 };
function getDashboardToken(req){
  const auth = req.get('authorization') || '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  return String(req.get('x-dashboard-token') || req.get('x-admin-token') || bearer || req.query.token || req.query.auth || '').trim();
}
function safeTokenEqual(a,b){
  if(!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if(ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba,bb);
}
function roleFromToken(token){
  if(token && DASHBOARD_ADMIN_TOKEN && safeTokenEqual(token,DASHBOARD_ADMIN_TOKEN)) return 'admin';
  if(token && DASHBOARD_EDITOR_TOKEN && safeTokenEqual(token,DASHBOARD_EDITOR_TOKEN)) return 'editor';
  return 'viewer';
}
function requireDashboardRole(required='editor'){
  return (req,res,next)=>{
    const token = getDashboardToken(req);
    const role = roleFromToken(token);
    const tokenConfigured = Boolean(DASHBOARD_ADMIN_TOKEN || DASHBOARD_EDITOR_TOKEN);
    if(!tokenConfigured){
      return res.status(503).json({ok:false,message:'管理權限尚未設定。請於 Zeabur 環境變數設定 DASHBOARD_ADMIN_TOKEN，必要時加設 DASHBOARD_EDITOR_TOKEN。'});
    }
    if(ROLE_LEVEL[role] >= ROLE_LEVEL[required]){
      req.dashboardRole = role;
      return next();
    }
    return res.status(401).json({ok:false,message:'權限不足或管理 Token 不正確。'});
  };
}

app.use(express.json({limit:'50mb',verify:(req,res,buf)=>{req.rawBody=buf}}));
app.use(express.urlencoded({extended:true,limit:'50mb'}));
app.use(express.static(path.join(__dirname,'public')));

app.get('/healthz', (req,res)=>res.status(200).send('ok'));
app.get('/api/health', (req,res)=>res.json({
  ok:true,
  uptime:Math.round(process.uptime()),
  storage:'zeabur-local',
  googleAutoSync:GOOGLE_AUTO_SYNC,
  googleSheetConfigured:googleSheetConfigured(),
  lineConfigured:Boolean(LINE_CHANNEL_ACCESS_TOKEN && LINE_CHANNEL_SECRET),
  tokenConfigured:Boolean(DASHBOARD_ADMIN_TOKEN || DASHBOARD_EDITOR_TOKEN)
}));

app.get(['/admin','/management'], (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

app.get('/api/auth/check', (req,res)=>{
  const token = getDashboardToken(req);
  const role = roleFromToken(token);
  const tokenConfigured = Boolean(DASHBOARD_ADMIN_TOKEN || DASHBOARD_EDITOR_TOKEN);
  if(!tokenConfigured) return res.status(503).json({ok:false,role:'viewer',message:'管理權限尚未設定。'});
  if(token && role === 'viewer') return res.status(401).json({ok:false,role:'viewer',message:'管理 Token 不正確。'});
  res.json({
    ok:true,
    role,
    permissions:{
      view:true,
      importData: ROLE_LEVEL[role] >= ROLE_LEVEL.editor,
      exportData: ROLE_LEVEL[role] >= ROLE_LEVEL.editor,
      syncData: ROLE_LEVEL[role] >= ROLE_LEVEL.editor,
      restoreBuiltIn: ROLE_LEVEL[role] >= ROLE_LEVEL.admin
    }
  });
});

app.get('/api/noise-dashboard-data', async (req,res)=>{
  try{const data=await getDashboardData();res.json({...data,summary:summary(data)});}catch(err){res.status(500).json({ok:false,message:err.message})}
});
app.post('/api/noise-dashboard-data', requireDashboardRole('editor'), async (req,res)=>{
  try{
    const payload={raw:Array.isArray(req.body.raw)?req.body.raw:[],vehicles:Array.isArray(req.body.vehicles)?req.body.vehicles:[],updatedAt:new Date().toISOString(),source:req.body.source||'api'};
    const result=await saveDashboardData(payload,'api');
    res.json({ok:true,result,summary:summary(readData())});
  }catch(err){res.status(400).json({ok:false,message:err.message})}
});
app.post('/api/sync/pull', requireDashboardRole('editor'), async (req,res)=>{try{const data=await pullFromGoogleSheet();res.json({ok:true,raw:data.raw.length,vehicles:data.vehicles.length,summary:summary(data)})}catch(err){res.status(400).json({ok:false,message:err.message})}});
app.post('/api/sync/push', requireDashboardRole('admin'), async (req,res)=>{try{const result=await pushToGoogleSheet(readData());res.json({ok:true,result})}catch(err){res.status(400).json({ok:false,message:err.message})}});
app.post('/api/import/excel', requireDashboardRole('editor'), upload.single('file'), async (req,res)=>{
  try{if(!req.file)throw new Error('請上傳 Excel 檔案。');const parsed=parseWorkbook(req.file.buffer);const result=await saveDashboardData(parsed,'excel-import');res.json({ok:true,result,summary:summary(readData())});}catch(err){res.status(400).json({ok:false,message:err.message})}
});
app.post('/api/restore-built-in', requireDashboardRole('admin'), async (req,res)=>{
  try{
    const payload={raw:Array.isArray(req.body.raw)?req.body.raw:[],vehicles:Array.isArray(req.body.vehicles)?req.body.vehicles:[],updatedAt:new Date().toISOString(),source:'restore-built-in'};
    const result=await saveDashboardData(payload,'restore-built-in');
    res.json({ok:true,result,summary:summary(readData())});
  }catch(err){res.status(400).json({ok:false,message:err.message})}
});
app.get('/api/export/excel', requireDashboardRole('editor'), async (req,res)=>{
  try{
    // 匯出前先讀取 Google Sheet，確保匯出內容與目前匯入／同步後資料一致。
    const data = await getDashboardData();
    const normalized = {
      raw: (data.raw || []).map(mapRawRow),
      vehicles: (data.vehicles || []).map(mapVehicleRow),
      updatedAt: new Date().toISOString(),
      source: 'export-synced'
    };
    writeData(normalized);
    const buf = workbookBuffer(normalized);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent('聲音照相資料同步匯出.xlsx')}`);
    res.send(buf);
  }catch(err){res.status(500).send(err.message)}
});
app.get('/api/summary', async (req,res)=>{try{const data=await getDashboardData();res.json({ok:true,summary:summary(data)})}catch(err){res.status(500).json({ok:false,message:err.message})}});
app.get('/line-webhook',(req,res)=>res.json({
  ok:true,
  message:'LINE webhook endpoint ready',
  lineConfigured:Boolean(LINE_CHANNEL_ACCESS_TOKEN && LINE_CHANNEL_SECRET),
  tokenConfigured:Boolean(LINE_CHANNEL_ACCESS_TOKEN),
  secretConfigured:Boolean(LINE_CHANNEL_SECRET),
  sheetConfigured:Boolean(GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_JSON),
  verifySignature:LINE_WEBHOOK_VERIFY,
  mode:'manual_reply_only',
  commands:['最新進度','執行進度','成果總數','最新數據']
}));

app.get('/api/line-debug',(req,res)=>res.json({
  ok:true,
  tokenConfigured:Boolean(LINE_CHANNEL_ACCESS_TOKEN),
  secretConfigured:Boolean(LINE_CHANNEL_SECRET),
  verifySignature:LINE_WEBHOOK_VERIFY,
  sheetConfigured:Boolean(GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_JSON),
  commands:['最新進度','執行進度','成果總數','最新數據'],
  hint:'LINE Bot 沒回應時，先確認 LINE Developers Webhook URL 是否為 /line-webhook，並查看 Zeabur Logs 是否出現 [LINE_WEBHOOK_RECEIVED]。'
}));

function isSummaryCommand(clean){
  return /^(最新進度|執行進度|成果總數|最新數據|總數|狀態|更新總數|立即回報|summary)$/i.test(String(clean || '').trim());
}

app.post('/line-webhook',async(req,res)=>{
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  console.log('[LINE_WEBHOOK_RECEIVED]', {
    events: events.length,
    verifySignature: LINE_WEBHOOK_VERIFY,
    hasToken: Boolean(LINE_CHANNEL_ACCESS_TOKEN),
    hasSecret: Boolean(LINE_CHANNEL_SECRET),
    types: events.map(e => e.type + ':' + (e.message?.type || ''))
  });

  // 先回 200，避免 LINE Developers 判定 Webhook 失敗。
  res.status(200).json({ok:true});

  try{
    if(LINE_WEBHOOK_VERIFY && !verifyLineSignature(req)){
      console.warn('[LINE_SIGNATURE_WARNING]', '簽章驗證未通過；內部控管版仍繼續處理，避免 Bot 無回應。請確認 LINE_CHANNEL_SECRET 是否正確。');
    }

    for(const event of events){
      if(event.type !== 'message') continue;
      if(event.message?.type !== 'text'){
        await replyLine(event.replyToken,'目前僅支援文字查詢。請輸入「最新進度」、「執行進度」、「成果總數」或「最新數據」。');
        continue;
      }

      const clean = String(event.message.text || '').trim();
      try{
        if(isSummaryCommand(clean)){
          const data = await getDashboardData();
          await replyLine(event.replyToken, summaryMessage(data));
        }else{
          await replyLine(event.replyToken, [
            '可輸入下列任一指令查詢平台最新總數：',
            '',
            '最新進度',
            '執行進度',
            '成果總數',
            '最新數據'
          ].join('\\n'));
        }
      }catch(err){
        console.error('[LINE_COMMAND_ERROR]', err);
        await replyLine(event.replyToken, [
          '❌ 查詢失敗',
          `原因：${err.message || err}`,
          '',
          '請確認 Google Sheet 環境變數與 Service Account 權限。'
        ].join('\\n'));
      }
    }
  }catch(err){
    console.error('[LINE_WEBHOOK_ERROR]', err);
  }
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Noise dashboard server listening on 0.0.0.0:${PORT}`));
server.on('error', (err) => {
  console.error('[SERVER_LISTEN_ERROR]', err);
  process.exit(1);
});
