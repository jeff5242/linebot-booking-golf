'use strict';

// ============================================================
// 會員去重 / 合併
//
// 背景：客戶綁 LINE 時若電話/姓名與原始會員差一點（後三碼不同、
// 姓名差一字），register 會 INSERT 一筆新 users → 同一人兩個帳號：
// 會員身分（member_no/券/套本）在原始帳號、LINE 綁定在新帳號。
//
// 本模組：
//   - findDuplicateCandidates()：偵測疑似重複「配對」供櫃檯檢視
//   - mergeUsers({ keepId, removeId })：把 remove 的關聯資料搬到 keep、
//     身分欄位以「keep 缺的才補」方式併入，最後刪除 remove。
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const PAGE_SIZE = 1000;

// 合併時 keep 缺值才從 remove 補的身分欄位（皆非關聯，直接寫在 users 列上）
const IDENTITY_FIELDS = ['member_no', 'golfer_type', 'member_valid_until', 'gender', 'tax_id'];

// 以 user_id 參照 users 的關聯表：合併時整批改掛 keep
// （voucher_transfers 在正式 DB 不存在故不列；voucher_logs 走 voucher_id 不需搬）
const USER_ID_TABLES = ['vouchers', 'voucher_packages', 'bookings', 'waitlist', 'membership_benefits_issued'];

// 電話前綴長度：前 7 碼相同視為同一群（09XXXXX），用於縮小 findDuplicatesForUser 的候選集
const PHONE_PREFIX_LEN = 7;
// 電話近似容忍：等長且相差字元數 ≤ 此值視為疑似打錯（如末碼 741 vs 941）
const PHONE_MAX_DIFF = 2;

function normPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// 兩個等長字串相差幾個字元；長度不同回傳 Infinity
function charDiffCount(a, b) {
  if (a == null || b == null || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// 姓名近似：完全相同、或等長差 ≤1 字（滕/藤、仲/中）、或一方為另一方子字串
function nameSimilar(n1, n2) {
  const a = String(n1 || '').trim();
  const b = String(n2 || '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (charDiffCount(a, b) <= 1) return true;
  if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

// 電話近似：等長且相差 ≤ PHONE_MAX_DIFF 碼（不含完全相同）
function phoneSimilar(p1, p2) {
  if (!p1 || !p2 || p1 === p2 || p1.length !== p2.length) return false;
  return charDiffCount(p1, p2) <= PHONE_MAX_DIFF;
}

// 判斷兩帳號是否疑似重複；回傳 reason 或 null
// 規則（由強到弱）：
//   'phone'      完全相同電話（不同帳號）
//   'phone+name' 姓名近似「且」電話近似（典型打錯 → 同一人）
//   'name'       姓名完全相同、電話不同
function dupReason(a, b) {
  const pa = normPhone(a.phone);
  const pb = normPhone(b.phone);
  if (pa && pb && pa === pb) return 'phone';
  if (nameSimilar(a.display_name, b.display_name) && phoneSimilar(pa, pb)) return 'phone+name';
  const na = String(a.display_name || '').trim();
  const nb = String(b.display_name || '').trim();
  if (na && na === nb && pa !== pb) return 'name';
  return null;
}

async function fetchAllUsers() {
  const cols = 'id, display_name, phone, member_no, golfer_type, member_valid_until, gender, tax_id, line_user_id, created_at';
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('users')
      .select(cols)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

const emptyStats = () => ({ voucher_total: 0, voucher_active: 0, package_active: 0, booking_count: 0 });

// 單一帳號的關聯統計（給前端顯示與判斷保留哪個）
async function getAccountStats(userId) {
  const map = await computeStatsBulk([userId]);
  return map[userId] || emptyStats();
}

// 批次算多個帳號的關聯統計：以 in() 一次撈回再於 JS 聚合，避免 N×查詢
async function computeStatsBulk(userIds) {
  const stats = {};
  for (const id of userIds) stats[id] = emptyStats();
  if (userIds.length === 0) return stats;

  const CHUNK = 100;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const ids = userIds.slice(i, i + CHUNK);
    const [vres, pres, bres] = await Promise.all([
      supabase.from('vouchers').select('user_id, status').in('user_id', ids),
      supabase.from('voucher_packages').select('user_id, status').in('user_id', ids),
      supabase.from('bookings').select('user_id').in('user_id', ids),
    ]);
    if (vres.error) throw vres.error;
    if (pres.error) throw pres.error;
    if (bres.error) throw bres.error;
    for (const v of vres.data || []) {
      const s = stats[v.user_id]; if (!s) continue;
      s.voucher_total++;
      if (v.status === 'active') s.voucher_active++;
    }
    for (const p of pres.data || []) {
      const s = stats[p.user_id]; if (!s) continue;
      if (p.status === 'active') s.package_active++;
    }
    for (const b of bres.data || []) {
      const s = stats[b.user_id]; if (!s) continue;
      s.booking_count++;
    }
  }
  return stats;
}

// 幫一筆 user 補上「有無綁 LINE」與精簡欄位（不含敏感的完整 line_user_id）
function publicUser(u) {
  return {
    id: u.id,
    display_name: u.display_name,
    phone: u.phone,
    member_no: u.member_no,
    golfer_type: u.golfer_type,
    member_valid_until: u.member_valid_until,
    gender: u.gender,
    line_bound: !!u.line_user_id,
    created_at: u.created_at,
  };
}

// 判斷一組配對中「建議保留」哪個：有會員編號優先，其次券多的，其次較早建立的
function suggestKeep(a, b, statsA, statsB) {
  if (!!a.member_no !== !!b.member_no) return a.member_no ? a.id : b.id;
  if (statsA.voucher_total !== statsB.voucher_total) return statsA.voucher_total > statsB.voucher_total ? a.id : b.id;
  return new Date(a.created_at) <= new Date(b.created_at) ? a.id : b.id;
}

// 偵測疑似重複配對（全量兩兩比對；比對為純字串運算故很快，DB 只在最後批次撈統計）
async function findDuplicateCandidates() {
  const users = await fetchAllUsers();
  // 預算 normPhone / trimmed name，避免比對時重複運算
  for (const u of users) {
    u._phone = normPhone(u.phone);
    u._name = String(u.display_name || '').trim();
  }

  const rawPairs = [];
  for (let i = 0; i < users.length; i++) {
    const a = users[i];
    for (let j = i + 1; j < users.length; j++) {
      const b = users[j];
      // 便宜的預篩：兩者姓名與電話都毫無關聯就跳過（dupReason 內含更嚴格判斷）
      const reason = dupReason(a, b);
      if (reason) rawPairs.push({ a, b, reason });
    }
  }

  // 「同名但電話完全不同」多半是不同人剛好同名（常見中文姓名）→ 只在「經典重複」
  //（一邊有會員編號、另一邊綁 LINE，互補）時才保留，其餘濾掉以免雜訊淹沒
  const isClassic = (a, b) => (!!a.member_no !== !!b.member_no) && (!!a.line_user_id !== !!b.line_user_id);
  const filteredPairs = rawPairs.filter(({ a, b, reason }) => reason !== 'name' || isClassic(a, b));

  // 批次撈統計（只撈出現在配對中的帳號）
  const involvedIds = [...new Set(filteredPairs.flatMap(p => [p.a.id, p.b.id]))];
  const statsMap = await computeStatsBulk(involvedIds);

  // 組裝並排序：「一邊有會員編號、另一邊有綁 LINE」的經典重複優先
  const pairs = filteredPairs.map(({ a, b, reason }) => {
    const statsA = statsMap[a.id] || emptyStats();
    const statsB = statsMap[b.id] || emptyStats();
    const keepId = suggestKeep(a, b, statsA, statsB);
    const classic = (!!a.member_no !== !!b.member_no) && (!!a.line_user_id !== !!b.line_user_id);
    return {
      reason,
      classic,
      suggested_keep_id: keepId,
      accounts: [
        { ...publicUser(a), stats: statsA },
        { ...publicUser(b), stats: statsB },
      ],
    };
  });
  const reasonRank = { phone: 0, 'phone+name': 1, name: 2 };
  pairs.sort((p, q) => {
    if (!!q.classic !== !!p.classic) return (q.classic ? 1 : 0) - (p.classic ? 1 : 0);
    return (reasonRank[p.reason] ?? 9) - (reasonRank[q.reason] ?? 9);
  });

  return { total: pairs.length, pairs };
}

// 給定某帳號，找它的疑似重複對象（發券頁提示用；輕量）
async function findDuplicatesForUser(userId) {
  const { data: me, error } = await supabase
    .from('users')
    .select('id, display_name, phone, member_no, golfer_type, member_valid_until, gender, line_user_id, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!me) return [];

  const myPhone = normPhone(me.phone);
  const myName = String(me.display_name || '').trim();
  const prefix = myPhone.slice(0, PHONE_PREFIX_LEN);
  const cols = 'id, display_name, phone, member_no, golfer_type, member_valid_until, gender, line_user_id, created_at';

  // 候選集：電話前綴相同 或 同名（縮小範圍），再用 dupReason 嚴格過濾
  const candidates = new Map();
  if (prefix.length === PHONE_PREFIX_LEN) {
    const { data } = await supabase.from('users').select(cols).like('phone', `${prefix}%`).neq('id', userId);
    for (const u of (data || [])) candidates.set(u.id, u);
  }
  if (myName) {
    const { data } = await supabase.from('users').select(cols).eq('display_name', myName).neq('id', userId);
    for (const u of (data || [])) candidates.set(u.id, u);
  }

  // 同上：同名但電話完全不同者，只在「經典重複」時才視為疑似（濾掉同名不同人）
  const isClassic = (u) => (!!me.member_no !== !!u.member_no) && (!!me.line_user_id !== !!u.line_user_id);
  const matches = [...candidates.values()].filter(u => {
    const reason = dupReason(me, u);
    return reason && (reason !== 'name' || isClassic(u));
  });
  if (matches.length === 0) return [];
  const statsMap = await computeStatsBulk(matches.map(u => u.id));
  return matches.map(u => ({ ...publicUser(u), stats: statsMap[u.id] || emptyStats() }));
}

// 合併：把 removeId 的關聯資料搬到 keepId，身分欄位補進 keep，刪除 remove
async function mergeUsers({ keepId, removeId, operatorName }) {
  if (!keepId || !removeId) throw new Error('缺少 keepId 或 removeId');
  if (keepId === removeId) throw new Error('保留與刪除不能是同一個帳號');

  const { data: keep, error: e1 } = await supabase.from('users').select('*').eq('id', keepId).maybeSingle();
  if (e1) throw e1;
  if (!keep) throw new Error('保留的帳號不存在');
  const { data: remove, error: e2 } = await supabase.from('users').select('*').eq('id', removeId).maybeSingle();
  if (e2) throw e2;
  if (!remove) throw new Error('要刪除的帳號不存在');

  // 護欄一：兩邊有不同會員編號 → 可能是不同人，不予自動合併
  if (keep.member_no && remove.member_no && keep.member_no !== remove.member_no) {
    throw new Error(`兩個帳號有不同的會員編號（${keep.member_no} vs ${remove.member_no}），可能是不同人，不予自動合併`);
  }

  // 護欄二：兩邊都有進行中的套本 → partial unique index 會擋，請先處理其一
  const activePkg = async (uid) => {
    const { count, error } = await supabase
      .from('voucher_packages').select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('status', 'active');
    if (error) throw error;
    return count || 0;
  };
  const [keepActive, removeActive] = await Promise.all([activePkg(keepId), activePkg(removeId)]);
  if (keepActive > 0 && removeActive > 0) {
    throw new Error('兩個帳號都有進行中的套本，請先退掉其中一個再合併');
  }

  // 搬移關聯資料（尚未刪 remove，任一步失敗即中止並回報；重跑具冪等性）
  const moved = {};
  for (const table of USER_ID_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .update({ user_id: keepId })
      .eq('user_id', removeId)
      .select('id');
    if (error) throw new Error(`搬移 ${table} 失敗：${error.message}`);
    moved[table] = (data || []).length;
  }

  // 身分欄位：keep 缺值才從 remove 補；line_user_id/phone/display_name 同理
  const patch = {};
  for (const f of IDENTITY_FIELDS) {
    if ((keep[f] === null || keep[f] === undefined || keep[f] === '') && remove[f]) patch[f] = remove[f];
  }
  if (!keep.line_user_id && remove.line_user_id) patch.line_user_id = remove.line_user_id;
  if (!keep.phone && remove.phone) patch.phone = remove.phone;
  if (!keep.display_name && remove.display_name) patch.display_name = remove.display_name;

  // 先刪 remove（釋放 line_user_id / phone / member_no 唯一鍵），再把值補到 keep
  const { error: delErr } = await supabase.from('users').delete().eq('id', removeId);
  if (delErr) throw new Error(`刪除帳號失敗（可能仍有未搬移的關聯）：${delErr.message}`);

  let updatedKeep = keep;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await supabase.from('users').update(patch).eq('id', keepId).select().single();
    if (error) throw new Error(`更新保留帳號失敗：${error.message}`);
    updatedKeep = data;
  }

  return {
    kept: {
      id: updatedKeep.id,
      display_name: updatedKeep.display_name,
      phone: updatedKeep.phone,
      member_no: updatedKeep.member_no,
      golfer_type: updatedKeep.golfer_type,
      member_valid_until: updatedKeep.member_valid_until,
      line_bound: !!updatedKeep.line_user_id,
    },
    removed_id: removeId,
    removed_label: `${remove.display_name || ''} / ${remove.phone || ''}`,
    moved,
    identity_filled: Object.keys(patch),
    operator_name: operatorName || null,
  };
}

module.exports = {
  findDuplicateCandidates,
  findDuplicatesForUser,
  getAccountStats,
  mergeUsers,
};
