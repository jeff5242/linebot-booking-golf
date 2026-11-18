'use strict';

/**
 * 以會員為單位、存在 system_settings（jsonb，不動 schema）的變更紀錄。
 * 結構：{ [userId]: [entry, ...] }
 *
 * 用途：改名紀錄（member_name_edits）、會員身分變更紀錄（member_tier_changes）。
 * 有紀錄的會員＝「系統內改過」，Google 試算表同步不覆蓋對應欄位。
 */

const { createClient } = require('@supabase/supabase-js');

const LOG_WRITE_RETRIES = 3;
const ID_CHUNK_SIZE = 200;

let _sb = null;
function sb() {
  if (!_sb) _sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  return _sb;
}

/** 回傳加上一筆紀錄後的新 log（不修改原物件） */
function appendEntry(log, userId, entry) {
  const prev = Array.isArray(log?.[userId]) ? log[userId] : [];
  return { ...(log || {}), [userId]: [...prev, entry] };
}

/** 攤平成「最新在前」的清單（純函式） */
function flattenLog(log) {
  return Object.entries(log || {})
    .flatMap(([userId, entries]) => (Array.isArray(entries) ? entries : []).map(e => ({ userId, ...e })))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

async function readLogRow(key) {
  const { data, error } = await sb().from('system_settings').select('value, updated_at').eq('key', key).maybeSingle();
  if (error) throw error;
  return data;
}

async function getLog(key) {
  const row = await readLogRow(key);
  return row?.value && typeof row.value === 'object' ? row.value : {};
}

/**
 * 寫入一筆紀錄。以 updated_at 做樂觀鎖，避免兩位管理人員同時寫入時互相蓋掉紀錄。
 */
async function saveEntry(key, userId, entry) {
  for (let attempt = 0; attempt < LOG_WRITE_RETRIES; attempt++) {
    const row = await readLogRow(key);
    const nextValue = appendEntry(row?.value, userId, entry);
    const updatedAt = new Date().toISOString();
    if (!row) {
      const { error } = await sb().from('system_settings').insert({ key, value: nextValue, updated_at: updatedAt });
      if (!error) return;
      if (error.code !== '23505') throw error; // 23505＝別人剛好先建立，重試
      continue;
    }
    const { data, error } = await sb().from('system_settings')
      .update({ value: nextValue, updated_at: updatedAt })
      .eq('key', key).eq('updated_at', row.updated_at)
      .select('key');
    if (error) throw error;
    if (data && data.length) return;
  }
  throw new Error('紀錄寫入衝突，請再試一次');
}

/** 有紀錄的會員電話（同步時不覆蓋這些人的對應欄位） */
async function getLockedPhones(key) {
  const userIds = Object.keys(await getLog(key));
  const phones = new Set();
  for (let i = 0; i < userIds.length; i += ID_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + ID_CHUNK_SIZE);
    const { data, error } = await sb().from('users').select('phone').in('id', chunk);
    if (error) throw error;
    (data || []).forEach(u => u.phone && phones.add(u.phone));
  }
  return phones;
}

module.exports = { sb, appendEntry, flattenLog, getLog, saveEntry, getLockedPhones };
