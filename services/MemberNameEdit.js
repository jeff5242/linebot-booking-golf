'use strict';

/**
 * 會員名稱修改（後台「用戶管理」）
 *
 * - 管理人員可修改會員顯示名稱（只改名字，不改電話）。
 * - 每次修改都留紀錄：system_settings.key='member_name_edits'（jsonb，不動 schema）
 *   結構：{ [userId]: [{ from, to, phone, operator, at }, ...] }
 * - 有紀錄的會員＝「手動改過名字」：Google 試算表同步（scripts/syncUsers.js）不再覆蓋其名稱。
 */

const { createClient } = require('@supabase/supabase-js');

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  return _sb;
}

const LOG_KEY = 'member_name_edits';
const MAX_NAME_LENGTH = 30;
const LOG_WRITE_RETRIES = 3;
const ID_CHUNK_SIZE = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class NameEditError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** 名稱清理＋檢查（純函式）：去頭尾空白、連續空白縮成一個、不可含控制字元 */
function normalizeName(raw) {
  if (typeof raw !== 'string') return { ok: false, error: '請輸入名字' };
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: '請輸入名字' };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: `名字最多 ${MAX_NAME_LENGTH} 個字` };
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: '名字含有無效字元' };
  return { ok: true, name };
}

/** 回傳加上一筆紀錄後的新 log（不修改原物件） */
function appendEdit(log, userId, entry) {
  const prev = Array.isArray(log?.[userId]) ? log[userId] : [];
  return { ...(log || {}), [userId]: [...prev, entry] };
}

/** 攤平成「最新在前」的清單（純函式） */
function flattenLog(log) {
  return Object.entries(log || {})
    .flatMap(([userId, entries]) => (Array.isArray(entries) ? entries : []).map(e => ({ userId, ...e })))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

async function readLogRow() {
  const { data, error } = await sb().from('system_settings').select('value, updated_at').eq('key', LOG_KEY).maybeSingle();
  if (error) throw error;
  return data;
}

async function getEditLog() {
  const row = await readLogRow();
  return row?.value && typeof row.value === 'object' ? row.value : {};
}

/**
 * 寫入一筆紀錄。以 updated_at 做樂觀鎖，避免兩位管理人員同時修改時互相蓋掉紀錄。
 */
async function saveEditEntry(userId, entry) {
  for (let attempt = 0; attempt < LOG_WRITE_RETRIES; attempt++) {
    const row = await readLogRow();
    const nextValue = appendEdit(row?.value, userId, entry);
    const updatedAt = new Date().toISOString();
    if (!row) {
      const { error } = await sb().from('system_settings').insert({ key: LOG_KEY, value: nextValue, updated_at: updatedAt });
      if (!error) return;
      if (error.code !== '23505') throw error; // 23505＝別人剛好先建立，重試
      continue;
    }
    const { data, error } = await sb().from('system_settings')
      .update({ value: nextValue, updated_at: updatedAt })
      .eq('key', LOG_KEY).eq('updated_at', row.updated_at)
      .select('key');
    if (error) throw error;
    if (data && data.length) return;
  }
  throw new Error('改名紀錄寫入衝突，請再試一次');
}

/**
 * 修改會員名稱並留下紀錄。
 * 紀錄寫入失敗時把名字改回原值，確保「改了名字就一定有紀錄、同步不會蓋掉」。
 */
async function renameMember({ userId, newName, operator }) {
  const checked = normalizeName(newName);
  if (!checked.ok) throw new NameEditError('INVALID_NAME', checked.error, 400);
  if (!UUID_PATTERN.test(String(userId))) throw new NameEditError('NOT_FOUND', '找不到這位會員', 404);

  const { data: user, error: fetchErr } = await sb().from('users')
    .select('id, display_name, phone').eq('id', userId).maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!user) throw new NameEditError('NOT_FOUND', '找不到這位會員', 404);
  if (user.display_name === checked.name) throw new NameEditError('SAME_NAME', '新名字和目前的名字相同', 400);

  // 只在名字仍是剛才看到的值時才更新，避免蓋掉別人同時做的修改
  let update = sb().from('users').update({ display_name: checked.name }).eq('id', userId);
  update = user.display_name === null ? update.is('display_name', null) : update.eq('display_name', user.display_name);
  const { data: updated, error: updErr } = await update.select('id, display_name, phone');
  if (updErr) throw updErr;
  if (!updated || !updated.length) throw new NameEditError('CONFLICT', '這位會員的名字剛被其他人修改，請重新整理後再試', 409);

  const entry = {
    from: user.display_name,
    to: checked.name,
    phone: user.phone,
    operator: operator || '未知',
    at: new Date().toISOString(),
  };
  try {
    await saveEditEntry(userId, entry);
  } catch (logErr) {
    console.error('[MemberNameEdit] 紀錄寫入失敗，名字改回原值:', logErr);
    await sb().from('users').update({ display_name: user.display_name }).eq('id', userId).eq('display_name', checked.name);
    throw new NameEditError('LOG_FAILED', '紀錄寫入失敗，名字未修改，請再試一次', 500);
  }
  return { user: updated[0], entry };
}

/** 手動改過名字的會員電話（同步時不覆蓋這些人的名字） */
async function getNameLockedPhones() {
  const userIds = Object.keys(await getEditLog());
  const phones = new Set();
  for (let i = 0; i < userIds.length; i += ID_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + ID_CHUNK_SIZE);
    const { data, error } = await sb().from('users').select('phone').in('id', chunk);
    if (error) throw error;
    (data || []).forEach(u => u.phone && phones.add(u.phone));
  }
  return phones;
}

module.exports = {
  LOG_KEY, MAX_NAME_LENGTH, NameEditError,
  sb,
  normalizeName, appendEdit, flattenLog,
  getEditLog, saveEditEntry, renameMember, getNameLockedPhones,
};
