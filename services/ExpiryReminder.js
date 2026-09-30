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

module.exports = {
  SETTINGS_KEY, LOG_KEY, PRODUCT_NAMES, DEFAULT_CONFIG, DEFAULT_TEMPLATE,
  sb,
  normalizeConfig, daysBetween, daysUntil, isDue, buildMessage, sentKey, selectDue,
};
