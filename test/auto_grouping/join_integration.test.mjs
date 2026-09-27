// 整合測試：joinGroup 對正式 DB（測試帳號、遠未來日期、跑完刪）。
// 需 .env；node test/auto_grouping/join_integration.test.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');
const GM = require('../../services/GroupMatching.js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const cfg = GM.normalizeConfig({ enabled: true, maxPerGroup: 4 });

const TEST_DATE = '2099-12-31';   // 遠未來，不干擾真實資料
const ownerId = crypto.randomUUID();
const ownerPhone = '09' + String(Date.now()).slice(-8);
let bookingId = null;

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

async function main() {
  console.log('joinGroup 整合測試（正式 DB / 測試帳號）');

  // 準備：測試組長 + 目標組（2 人，未滿）
  const { error: uErr } = await sb.from('users').insert({ id: ownerId, display_name: '【測試】併組組長', phone: ownerPhone });
  if (uErr) throw new Error('建測試 user 失敗: ' + uErr.message);
  const { data: bk, error: bErr } = await sb.from('bookings').insert({
    user_id: ownerId, date: TEST_DATE, time: '08:00', holes: 18, players_count: 2,
    status: 'confirmed', players_info: [{ name: '測試甲' }, { name: '測試乙' }], allow_matching: false,
  }).select('id').single();
  if (bErr) throw new Error('建測試 booking 失敗: ' + bErr.message);
  bookingId = bk.id;

  // ① happy path：加入 1 位散客 → 3 人、allow_matching=true、players_info +1
  await GM.joinGroup({ targetBookingId: bookingId, joiners: [{ name: '散客丙', phone: '0900000003' }], config: cfg });
  const { data: after1 } = await sb.from('bookings').select('players_count, players_info, allow_matching').eq('id', bookingId).single();
  t('併入 1 位 → 3 人、allow_matching=true、含散客資料', () => {
    assert.equal(after1.players_count, 3);
    assert.equal(after1.allow_matching, true);
    assert.equal(after1.players_info.length, 3);
    assert.ok(after1.players_info.some(p => p.name === '散客丙' && p.phone === '0900000003'));
  });

  // ①b 我的預約查找：以散客手機 jsonb contains 找得到被併入的組
  const { data: found } = await sb.from('bookings').select('id').contains('players_info', JSON.stringify([{ phone: '0900000003' }]));
  t('併組後：以散客手機 contains 查得到該組（供「我的預約」顯示）', () => {
    assert.ok((found || []).some(b => b.id === bookingId));
  });

  // ② 超過上限：目前 3 人，再加 2 位（=5）→ 應丟錯、資料不變
  let threw = false;
  try {
    await GM.joinGroup({ targetBookingId: bookingId, joiners: [{ name: 'x' }, { name: 'y' }], config: cfg });
  } catch { threw = true; }
  const { data: after2 } = await sb.from('bookings').select('players_count').eq('id', bookingId).single();
  t('超過上限：丟錯且人數維持 3', () => {
    assert.equal(threw, true);
    assert.equal(after2.players_count, 3);
  });

  // ③ 樂觀鎖原語：用過時的 players_count 做條件更新 → 0 筆（證明搶最後一位會被擋）
  const staleCount = 999;
  const { data: locked } = await sb.from('bookings')
    .update({ players_count: 4 }).eq('id', bookingId).eq('players_count', staleCount).select('id');
  t('樂觀鎖：players_count 不符 → 條件更新 0 筆', () => {
    assert.ok(!locked || locked.length === 0);
  });

  console.log(`\n通過 ${passed} 項\n`);
}

async function cleanup() {
  try { if (bookingId) await sb.from('bookings').delete().eq('id', bookingId); } catch {}
  try { await sb.from('users').delete().eq('id', ownerId); } catch {}
}

main()
  .then(cleanup)
  .catch(async (e) => { await cleanup(); console.error('整合測試失敗:', e.message); process.exit(1); });
