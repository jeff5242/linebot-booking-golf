'use strict';

/**
 * 散客自動併組（GroupMatching）
 *
 * 最高原則：group_matching.enabled 預設 false。功能未啟用時，本模組的
 * 對外判斷（isActiveOn）一律回 false，呼叫端據此完全走既有流程 → 零影響。
 *
 * 設定存於 system_settings.key='group_matching'（jsonb），與其他設定一致（不動 schema）。
 */

const { createClient } = require('@supabase/supabase-js');

// 延遲初始化：讓純函式（isActiveOn/peakType/normalizeConfig）可在無 env 下被單元測試 require。
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

const SETTINGS_KEY = 'group_matching';

// 預設「全關」：這是「不影響既有服務」的保證。
const DEFAULT_CONFIG = {
  enabled: false,        // 功能總開關
  enabledWeekdays: [],   // 星期幾啟用（0=日 … 6=六）；空＝不靠星期
  enabledDates: [],      // 指定日期啟用（'YYYY-MM-DD'，如國定假日/活動日）
  force: false,          // 啟用日：散客不同意併組時是否「不能完成預約」
  maxPerGroup: 4,        // 一組人數上限
};

/** 讀設定（與預設合併；讀不到或格式異常 → 回預設＝關閉） */
async function getConfig() {
  try {
    const { data } = await getSupabase()
      .from('system_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    return normalizeConfig(data?.value);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 正規化＋補預設，確保型別安全（外部資料不可信） */
function normalizeConfig(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const maxPerGroup = Number.isInteger(v.maxPerGroup) && v.maxPerGroup >= 2 && v.maxPerGroup <= 4
    ? v.maxPerGroup : DEFAULT_CONFIG.maxPerGroup;
  return {
    enabled: v.enabled === true,
    enabledWeekdays: Array.isArray(v.enabledWeekdays)
      ? [...new Set(v.enabledWeekdays.map(Number).filter(n => n >= 0 && n <= 6))] : [],
    enabledDates: Array.isArray(v.enabledDates)
      ? [...new Set(v.enabledDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))] : [],
    force: v.force === true,
    maxPerGroup,
  };
}

/**
 * 該日期是否啟用自動併組（純函式，好測試）。
 * enabled 為 false 一律回 false（零影響保證）。
 * @param {string} date 'YYYY-MM-DD'
 * @param {object} config normalizeConfig 後的設定
 */
function isActiveOn(date, config) {
  const c = config || DEFAULT_CONFIG;
  if (!c.enabled) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
  if (Array.isArray(c.enabledDates) && c.enabledDates.includes(date)) return true;
  // 以台灣時區日界判斷星期，避免 UTC 位移把週六算成週五
  const wd = new Date(`${date}T00:00:00+08:00`).getDay();
  return Array.isArray(c.enabledWeekdays) && c.enabledWeekdays.includes(wd);
}

/**
 * 判斷開球時間屬 peak_a / peak_b / null（離峰）。純函式。
 * @param {string} time 'HH:mm' 或 'HH:mm:ss'
 * @param {{start:string,end:string}} peakA
 * @param {{start:string,end:string}} peakB
 */
function peakType(time, peakA, peakB) {
  const t = String(time || '').slice(0, 5);
  if (!t) return null;
  if (peakA && peakA.start && peakA.end && t >= peakA.start && t <= peakA.end) return 'peak_a';
  if (peakB && peakB.start && peakB.end && t >= peakB.start && t <= peakB.end) return 'peak_b';
  return null;
}

/**
 * 把候選預約排序＋去識別（純函式，好測試）。
 * 規則：同一開球時間優先 → 同 Peak → 當天其他；同群組內時間近者優先。
 * 只回未滿 maxPerGroup 人的組，且排除自己（excludeBookingIds）。
 * @param {Array} bookings 當天非取消預約（含 id,time,players_count,players_info,holes）
 * @param {string} reqTime 散客想要的開球時間 'HH:mm'
 * @param {{start,end}} peakA
 * @param {{start,end}} peakB
 * @param {number} maxPerGroup
 * @param {Set<string>} excludeBookingIds 要排除的 booking id（自己的組）
 * @returns {Array<{booking_id,time,current_count,remaining,holes,peak,same_slot}>}
 */
function rankMergeable(bookings, reqTime, peakA, peakB, maxPerGroup, excludeBookingIds) {
  const max = maxPerGroup || 4;
  const reqShort = String(reqTime || '').slice(0, 5);
  const reqPeak = peakType(reqShort, peakA, peakB);
  const exclude = excludeBookingIds instanceof Set ? excludeBookingIds : new Set();

  const candidates = (bookings || [])
    .filter(b => b && b.status !== 'cancelled')
    .filter(b => !exclude.has(String(b.id)))
    .filter(b => Number(b.players_count) > 0 && Number(b.players_count) < max)
    .map(b => {
      const tShort = String(b.time || '').slice(0, 5);
      const p = peakType(tShort, peakA, peakB);
      return {
        booking_id: b.id,
        time: tShort,
        current_count: Number(b.players_count),
        remaining: max - Number(b.players_count),
        holes: b.holes != null ? Number(b.holes) : null,
        peak: p,
        same_slot: tShort === reqShort,
      };
    });

  // 排序：同時間 → 同 Peak → 其他；再按與想要時間的接近程度、時間先後
  const rank = (c) => (c.same_slot ? 0 : (reqPeak && c.peak === reqPeak ? 1 : 2));
  candidates.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.time.localeCompare(b.time);
  });
  return candidates;
}

/**
 * 查當天可併組候選（DB）。功能未啟用時一律回空陣列（零影響）。
 * @param {{date,time,excludeUserId,config,bookingSettings}} args
 *   config: normalizeConfig 後設定；bookingSettings: 含 peak_a/peak_b 的預約設定
 * @returns {Promise<{active:boolean, groups:Array}>}
 */
async function findMergeableGroups({ date, time, excludeUserId, config, bookingSettings }) {
  const cfg = config || DEFAULT_CONFIG;
  if (!isActiveOn(date, cfg)) return { active: false, groups: [] };

  const sb = getSupabase();
  // 當天非取消預約
  const { data: bookings, error } = await sb
    .from('bookings')
    .select('id, time, players_count, players_info, holes, status, user_id')
    .eq('date', date)
    .neq('status', 'cancelled');
  if (error) throw error;

  // 排除散客自己已有的組（同 user_id）
  const exclude = new Set(
    (bookings || []).filter(b => excludeUserId && b.user_id === excludeUserId).map(b => String(b.id))
  );

  const peakA = bookingSettings?.peak_a;
  const peakB = bookingSettings?.peak_b;
  const groups = rankMergeable(bookings, time, peakA, peakB, cfg.maxPerGroup, exclude);
  return { active: true, groups };
}

/**
 * 把散客併入既有組（併進目標那筆預約的 players_info）。
 * 護欄：目標非取消、併組後 ≤ maxPerGroup；樂觀鎖（players_count 仍為讀到的值才更新）
 * 防兩位散客同時搶同一組最後一位。並在目標組寫入 allow_matching=true。
 * @param {{targetBookingId, joiners:Array<{name,phone}>, config}} args
 * @returns {Promise<{booking_id, players_count, joined}>}
 */
async function joinGroup({ targetBookingId, joiners, config }) {
  const cfg = config || DEFAULT_CONFIG;
  const max = cfg.maxPerGroup || 4;
  const add = (Array.isArray(joiners) ? joiners : []).filter(j => j && j.name && String(j.name).trim());
  if (add.length === 0) throw new Error('缺少要加入的球友資料');
  if (!targetBookingId) throw new Error('缺少目標組');

  const sb = getSupabase();
  const { data: target, error } = await sb
    .from('bookings')
    .select('id, status, players_count, players_info')
    .eq('id', targetBookingId)
    .maybeSingle();
  if (error) throw error;
  if (!target) throw new Error('找不到目標組');
  if (target.status === 'cancelled') throw new Error('目標組已取消，無法併入');

  const oldCount = Number(target.players_count) || 0;
  const newCount = oldCount + add.length;
  if (newCount > max) throw new Error(`併組後 ${newCount} 人，超過一組上限 ${max} 人`);

  const newInfo = [
    ...(Array.isArray(target.players_info) ? target.players_info : []),
    ...add.map(j => ({ name: String(j.name).trim(), phone: j.phone || null })),
  ];

  // 樂觀鎖：只有 players_count 仍等於剛讀到的 oldCount 且未取消時才更新
  const { data: updated, error: uErr } = await sb
    .from('bookings')
    .update({ players_info: newInfo, players_count: newCount, allow_matching: true })
    .eq('id', targetBookingId)
    .eq('players_count', oldCount)
    .neq('status', 'cancelled')
    .select('id, players_count');
  if (uErr) throw uErr;
  if (!updated || updated.length === 0) {
    throw new Error('該組人數剛剛有變動（可能已被他人併入），請重新查詢可併組別');
  }
  return { booking_id: targetBookingId, players_count: newCount, joined: add.length };
}

module.exports = {
  SETTINGS_KEY,
  DEFAULT_CONFIG,
  getConfig,
  normalizeConfig,
  isActiveOn,
  peakType,
  rankMergeable,
  findMergeableGroups,
  joinGroup,
};
