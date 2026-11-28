'use strict';

/**
 * 報到看板（CheckinBoard）：「已出發」紀錄 + 「全員到齊後自動移除」設定。
 *
 * 都存在 system_settings（不動 schema）：
 *   - key='checkin_board'                → { autoHideEnabled, autoHideSeconds }
 *   - key='checkin_departed:YYYY-MM-DD'  → { [bookingId]: 已出發時間 ISO }
 * 每天一列：多台看板/出發台同時按「已出發」時，用 updated_at 做樂觀鎖，衝突就重讀再合併，
 * 不會互相蓋掉。舊的日期列在寫入後順手清掉（保留 KEEP_DAYS 天）。
 */

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

const SETTINGS_KEY = 'checkin_board';
const DEPARTED_PREFIX = 'checkin_departed:';
const ALLOWED_HIDE_SECONDS = [30, 60, 180, 300];
const DEFAULT_CONFIG = { autoHideEnabled: true, autoHideSeconds: 30 };
const MAX_WRITE_ATTEMPTS = 5;
const KEEP_DAYS = 14;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date) {
  return typeof date === 'string' && DATE_RE.test(date);
}

function normalizeConfig(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const seconds = Number(v.autoHideSeconds);
  return {
    autoHideEnabled: v.autoHideEnabled === undefined ? DEFAULT_CONFIG.autoHideEnabled : v.autoHideEnabled === true,
    autoHideSeconds: ALLOWED_HIDE_SECONDS.includes(seconds) ? seconds : DEFAULT_CONFIG.autoHideSeconds,
  };
}

/** 看板實際使用的秒數：關閉時為 0 */
function effectiveAutoHideSeconds(config) {
  const c = normalizeConfig(config);
  return c.autoHideEnabled ? c.autoHideSeconds : 0;
}

function departedKey(date) {
  if (!isValidDate(date)) throw new Error('日期格式必須是 YYYY-MM-DD');
  return `${DEPARTED_PREFIX}${date}`;
}

function cleanMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string' && v));
}

/** 回傳新的已出發對照表（不改原本的物件）。已出發的組再標一次，保留第一次的時間。 */
function applyDeparted(map, bookingId, departed, nowIso) {
  const base = cleanMap(map);
  if (departed) return base[bookingId] ? base : { ...base, [bookingId]: nowIso };
  const { [bookingId]: _removed, ...rest } = base;
  return rest;
}

async function getConfig(client = getSupabase()) {
  try {
    const { data } = await client.from('system_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    return normalizeConfig(data?.value);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(raw, client = getSupabase()) {
  const clean = normalizeConfig(raw);
  const { error } = await client.from('system_settings').upsert({
    key: SETTINGS_KEY, value: clean, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`儲存報到看板設定失敗：${error.message}`);
  return clean;
}

async function readDepartedRow(date, client) {
  const { data, error } = await client
    .from('system_settings').select('value, updated_at').eq('key', departedKey(date)).maybeSingle();
  if (error) throw new Error(`讀取已出發紀錄失敗：${error.message}`);
  return data;
}

async function getDeparted(date, client = getSupabase()) {
  const row = await readDepartedRow(date, client);
  return cleanMap(row?.value);
}

/** 新增或改寫當天那一列；別台剛好也在寫（樂觀鎖失敗）時回 null，讓呼叫端重讀再試 */
async function tryWrite(key, row, next, client) {
  const stamp = new Date().toISOString();
  if (!row) {
    const { error } = await client.from('system_settings').insert({ key, value: next, updated_at: stamp });
    if (!error) return next;
    if (error.code === '23505') return null;
    throw new Error(`儲存已出發紀錄失敗：${error.message}`);
  }
  const { data, error } = await client
    .from('system_settings')
    .update({ value: next, updated_at: stamp })
    .eq('key', key)
    .eq('updated_at', row.updated_at)
    .select('key');
  if (error) throw new Error(`儲存已出發紀錄失敗：${error.message}`);
  return Array.isArray(data) && data.length === 1 ? next : null;
}

/**
 * 標記或取消某組「已出發」。回傳當天最新的已出發對照表。
 * @param {{date: string, bookingId: string, departed: boolean, nowIso: string}} input
 */
async function setDeparted({ date, bookingId, departed, nowIso }, client = getSupabase()) {
  const key = departedKey(date);
  if (typeof bookingId !== 'string' || !bookingId) throw new Error('缺少預約編號');
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const row = await readDepartedRow(date, client);
    const next = applyDeparted(row?.value, bookingId, departed === true, nowIso);
    const saved = await tryWrite(key, row, next, client);
    if (saved) return saved;
  }
  throw new Error('同時有其他人在更新，請再按一次');
}

/** 刪掉 cutoffIso 以前就沒再更新的已出發紀錄（只動 checkin_departed: 開頭的列） */
async function pruneOldDeparted(cutoffIso, client = getSupabase()) {
  const { error } = await client
    .from('system_settings').delete().like('key', `${DEPARTED_PREFIX}%`).lt('updated_at', cutoffIso);
  if (error) throw new Error(`清除舊的已出發紀錄失敗：${error.message}`);
}

function pruneCutoff(now = new Date()) {
  return new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

module.exports = {
  SETTINGS_KEY,
  DEPARTED_PREFIX,
  ALLOWED_HIDE_SECONDS,
  DEFAULT_CONFIG,
  isValidDate,
  normalizeConfig,
  effectiveAutoHideSeconds,
  departedKey,
  applyDeparted,
  getConfig,
  saveConfig,
  getDeparted,
  setDeparted,
  pruneOldDeparted,
  pruneCutoff,
};
