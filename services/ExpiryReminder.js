'use strict';

/**
 * 票券到期提醒（ExpiryReminder）
 *
 * 目的：會員的電子券在「剩 N 天到期」時，透過 LINE 個人化推播提醒。
 * 最高原則：`expiry_reminder.enabled` 預設 false ⇒ 排程與端點都不會發送任何訊息（零影響）。
 *
 * 去重：每位會員的「一批券」以同一 valid_until 為單位，記在
 * system_settings.expiry_reminder_log（jsonb）：key = `${userId}|${validUntil}` → 送出日期，
 * 確保同一批只提醒一次（即使排程重跑或有多張券同批）。
 * 設定與紀錄都存 system_settings（不動 schema）。
 */

const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  return _sb;
}

const SETTINGS_KEY = 'expiry_reminder';
const LOG_KEY = 'expiry_reminder_log';
const PRODUCT_NAMES = ['果嶺券', '商品券'];

const DEFAULT_TEMPLATE =
  '⛳ 大衛營高爾夫 票券到期提醒\n\n{name} 您好，您的電子票券將於 {date} 到期（約剩 {days} 天）。\n目前尚有 {count} 張可用，歡迎多加利用，或洽櫃檯續約。';

const DEFAULT_CONFIG = {
  enabled: false,          // 總開關（預設關＝零影響）
  daysBefore: 100,         // 到期前幾天提醒
  windowDays: 7,           // 觸發窗（daysBefore..daysBefore-windowDays+1），防排程漏跑、且不會回頭洗整批
  voucherTypes: ['果嶺券', '商品券'],
  runHour: 10,             // 排程每日執行時（台灣時，0-23）
  template: DEFAULT_TEMPLATE,
};

function normalizeConfig(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const daysBefore = Number.isInteger(v.daysBefore) && v.daysBefore >= 1 && v.daysBefore <= 365 ? v.daysBefore : DEFAULT_CONFIG.daysBefore;
  const windowDays = Number.isInteger(v.windowDays) && v.windowDays >= 1 && v.windowDays <= 30 ? v.windowDays : DEFAULT_CONFIG.windowDays;
  const runHour = Number.isInteger(v.runHour) && v.runHour >= 0 && v.runHour <= 23 ? v.runHour : DEFAULT_CONFIG.runHour;
  const voucherTypes = Array.isArray(v.voucherTypes) && v.voucherTypes.length
    ? v.voucherTypes.filter(t => PRODUCT_NAMES.includes(t)) : [...DEFAULT_CONFIG.voucherTypes];
  const template = typeof v.template === 'string' && v.template.trim() ? v.template : DEFAULT_CONFIG.template;
  return {
    enabled: v.enabled === true,
    daysBefore,
    windowDays,
    voucherTypes: voucherTypes.length ? voucherTypes : [...DEFAULT_CONFIG.voucherTypes],
    runHour,
    template,
  };
}

/** 兩個 'YYYY-MM-DD' 相差天數（to - from），以 UTC 午夜計算，純函式 */
function daysBetween(fromDate, toDate) {
  const f = Date.parse(`${String(fromDate).slice(0, 10)}T00:00:00Z`);
  const t = Date.parse(`${String(toDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(f) || Number.isNaN(t)) return NaN;
  return Math.round((t - f) / 86400000);
}

/** 距到期天數（validUntil 可為 timestamptz 字串，取日期部分），純函式 */
function daysUntil(validUntil, todayStr) {
  return daysBetween(todayStr, validUntil);
}

/** 是否落在觸發窗：daysLeft 在 (daysBefore-windowDays, daysBefore] 內，純函式 */
function isDue(daysLeft, config) {
  const c = config || DEFAULT_CONFIG;
  return Number.isInteger(daysLeft) && daysLeft <= c.daysBefore && daysLeft > c.daysBefore - c.windowDays;
}

/** 組訊息（填 {name}{date}{days}{count}），純函式 */
function buildMessage(member, config) {
  const c = config || DEFAULT_CONFIG;
  return String(c.template)
    .replace(/\{name\}/g, member.name || '會員')
    .replace(/\{date\}/g, String(member.validUntil).slice(0, 10))
    .replace(/\{days\}/g, String(member.daysLeft))
    .replace(/\{count\}/g, String(member.count));
}

/** 去重 key */
function sentKey(userId, validUntil) {
  return `${userId}|${String(validUntil).slice(0, 10)}`;
}

/**
 * 從「批次列」挑出該提醒且尚未提醒過的會員，純函式（好測試）。
 * @param {Array<{user_id,name,line_user_id,valid_until,count}>} batches 每位會員每個到期批次一列
 * @param {string} todayStr 'YYYY-MM-DD'
 * @param {object} config
 * @param {Set<string>} sentSet 已提醒過的 key 集合
 * @returns {Array} due 會員（附 daysLeft）
 */
function selectDue(batches, todayStr, config, sentSet) {
  const c = config || DEFAULT_CONFIG;
  const done = sentSet instanceof Set ? sentSet : new Set();
  const out = [];
  for (const b of (batches || [])) {
    if (!b.line_user_id) continue;               // 沒綁 LINE 收不到，略過
    if (!b.valid_until) continue;
    const daysLeft = daysUntil(b.valid_until, todayStr);
    if (!isDue(daysLeft, c)) continue;
    if (done.has(sentKey(b.user_id, b.valid_until))) continue;  // 已提醒過
    out.push({ user_id: b.user_id, name: b.name || '會員', line_user_id: b.line_user_id, validUntil: b.valid_until, count: b.count, daysLeft });
  }
  return out;
}

// ───────── DB 存取 ─────────
const PAGE = 1000;
async function fetchAll(buildQuery) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function getConfig() {
  try {
    const { data } = await sb().from('system_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    return normalizeConfig(data?.value);
  } catch { return { ...DEFAULT_CONFIG }; }
}

async function getSentLog() {
  try {
    const { data } = await sb().from('system_settings').select('value').eq('key', LOG_KEY).maybeSingle();
    return data?.value && typeof data.value === 'object' ? data.value : {};
  } catch { return {}; }
}

async function saveSentLog(map) {
  await sb().from('system_settings').upsert({ key: LOG_KEY, value: map, updated_at: new Date().toISOString() });
}

/** 移除已到期超過 30 天的紀錄，避免無限成長，純函式 */
function pruneSentLog(map, todayStr) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const d = k.split('|')[1];
    if (d && daysBetween(d, todayStr) <= 30) out[k] = v; // 到期日距今 ≤30 天（含未來）才保留
  }
  return out;
}

/** 撈「每位會員每個到期批次」一列（active 數位券，依設定券種），附姓名與 line_user_id */
async function fetchBatches(voucherTypes) {
  const types = (Array.isArray(voucherTypes) ? voucherTypes : PRODUCT_NAMES).filter(t => PRODUCT_NAMES.includes(t));
  const vs = await fetchAll(() => sb().from('vouchers')
    .select('user_id, valid_until')
    .eq('status', 'active').eq('source_type', 'digital_purchase')
    .in('product_name', types.length ? types : PRODUCT_NAMES));

  const map = new Map();
  for (const v of vs) {
    if (!v.valid_until) continue;
    const d = String(v.valid_until).slice(0, 10);
    const k = `${v.user_id}|${d}`;
    const cur = map.get(k) || { user_id: v.user_id, valid_until: d, count: 0 };
    cur.count++; map.set(k, cur);
  }
  const userIds = [...new Set([...map.values()].map(b => b.user_id))];
  const users = {};
  for (let i = 0; i < userIds.length; i += 100) {
    const chunk = userIds.slice(i, i + 100);
    const { data } = await sb().from('users').select('id, display_name, line_user_id').in('id', chunk);
    for (const u of (data || [])) users[u.id] = u;
  }
  return [...map.values()].map(b => ({
    ...b, name: users[b.user_id]?.display_name || '會員', line_user_id: users[b.user_id]?.line_user_id || null,
  }));
}

/**
 * 執行到期提醒。預設 dryRun=false 才真的推播。
 * @param {{dryRun?, pushFn?, todayStr?}} opts pushFn 可注入（測試用），預設用 LINE sendPushMessage
 * @returns {Promise<object>} 摘要
 */
async function run(opts = {}) {
  const { dryRun = false, pushFn, todayStr } = opts;
  const config = await getConfig();
  if (!config.enabled) return { enabled: false, skipped: 'disabled', dueCount: 0, sent: 0, failed: 0 };

  const today = todayStr || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); // 台灣日期
  const batches = await fetchBatches(config.voucherTypes);
  const sentLog = await getSentLog();
  const sentSet = new Set(Object.keys(sentLog));
  const due = selectDue(batches, today, config, sentSet);

  if (dryRun) {
    return {
      enabled: true, dryRun: true, today, dueCount: due.length,
      sample: due.slice(0, 8).map(d => ({ name: d.name, validUntil: d.validUntil, daysLeft: d.daysLeft, count: d.count })),
    };
  }

  // 個人化逐人推播（LINE messages 需為陣列 [{type:'text',text}]）
  const push = pushFn || (async (lineId, text) => {
    const { sendPushMessage } = require('./LineNotification');
    return sendPushMessage(lineId, [{ type: 'text', text }]);
  });

  let sent = 0, failed = 0;
  const updated = { ...sentLog };
  for (const m of due) {
    const text = buildMessage(m, config);
    let ok = false;
    try { const r = await push(m.line_user_id, text); ok = !r || r.success !== false; } catch { ok = false; }
    if (ok) { sent++; updated[sentKey(m.user_id, m.validUntil)] = today; }
    else failed++;
  }
  await saveSentLog(pruneSentLog(updated, today));
  return { enabled: true, dryRun: false, today, dueCount: due.length, sent, failed };
}

// ───────── 排程狀態（每日只跑一次，跨重啟保存）─────────
const STATE_KEY = 'expiry_reminder_state';
async function getState() {
  try {
    const { data } = await sb().from('system_settings').select('value').eq('key', STATE_KEY).maybeSingle();
    return data?.value && typeof data.value === 'object' ? data.value : {};
  } catch { return {}; }
}
async function setLastRun(dateStr) {
  await sb().from('system_settings').upsert({ key: STATE_KEY, value: { lastRun: dateStr }, updated_at: new Date().toISOString() });
}

/**
 * 排程每小時呼叫一次：功能開啟、已到執行時、且當天尚未跑過 → 執行。
 * 皆不符合就跳過（不發送）。opts.nowMs / opts.pushFn 供測試注入。
 */
async function maybeRunDaily(opts = {}) {
  const config = await getConfig();
  if (!config.enabled) return { skipped: 'disabled' };
  const nowMs = opts.nowMs || Date.now();
  const tw = new Date(nowMs + 8 * 3600 * 1000);           // 位移到台灣時間
  const todayStr = tw.toISOString().slice(0, 10);
  const hour = tw.getUTCHours();                           // 位移後的 UTC 時＝台灣時
  if (hour < config.runHour) return { skipped: 'before_run_hour', hour };
  const state = await getState();
  if (state.lastRun === todayStr) return { skipped: 'already_ran', lastRun: todayStr };
  const result = await run({ dryRun: false, todayStr, pushFn: opts.pushFn });
  await setLastRun(todayStr);
  return { ran: true, ...result };
}

module.exports = {
  SETTINGS_KEY, LOG_KEY, STATE_KEY, PRODUCT_NAMES, DEFAULT_CONFIG, DEFAULT_TEMPLATE,
  sb,
  normalizeConfig, daysBetween, daysUntil, isDue, buildMessage, sentKey, selectDue,
  getConfig, getSentLog, saveSentLog, pruneSentLog, fetchBatches, run,
  getState, setLastRun, maybeRunDaily,
};
