// 端點整合測試：對本機 server（localhost:3000）。需先啟動 server。
// 測試帳號、遠未來日期、跑完還原 group_matching 設定並清資料。
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.TEST_BASE || 'http://localhost:3000';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const KEY = 'group_matching';
const TEST_DATE = '2099-12-30'; // 遠未來（假設週三；用 enabledDates 指定啟用，不依星期）
const GROUP_TIME = '08:00';
const EMPTY_TIME = '09:30';

const ownerId = crypto.randomUUID();
const guestId = crypto.randomUUID();
const guestPhone = '09' + String(Date.now()).slice(-8);
let groupBookingId = null;
let createdBookingIds = [];
let prevSetting = undefined; // 還原用

let passed = 0;
const t = (n, fn) => { fn(); passed++; console.log('  ✓', n); };
const j = (r) => r.json();

async function setConfig(cfg) {
  await sb.from('system_settings').upsert({ key: KEY, value: cfg, updated_at: new Date().toISOString() });
}

async function main() {
  console.log(`端點整合測試 @ ${BASE}`);

  // 快照原設定
  const { data: snap } = await sb.from('system_settings').select('value').eq('key', KEY).maybeSingle();
  prevSetting = snap ? snap.value : undefined;

  // 測試會員（散客）＋組長＋目標組（2 人）
  await sb.from('users').insert([
    { id: ownerId, display_name: '【測試】組長', phone: '09' + String(Date.now() + 1).slice(-8) },
    { id: guestId, display_name: '【測試】散客', phone: guestPhone },
  ]);
  const { data: gb } = await sb.from('bookings').insert({
    user_id: ownerId, date: TEST_DATE, time: GROUP_TIME, holes: 18, players_count: 2,
    status: 'confirmed', players_info: [{ name: '甲' }, { name: '乙' }],
  }).select('id').single();
  groupBookingId = gb.id;

  // ── 功能關閉：mergeable 回 active:false（零影響）──
  await setConfig({ enabled: false });
  const offRes = await j(await fetch(`${BASE}/api/bookings/mergeable?date=${TEST_DATE}&time=${GROUP_TIME}`));
  t('功能關閉：mergeable active:false、groups 空', () => {
    assert.equal(offRes.active, false);
    assert.deepEqual(offRes.groups, []);
  });

  // ── 啟用（指定日期）＋強制 ──
  await setConfig({ enabled: true, enabledDates: [TEST_DATE], force: true, maxPerGroup: 4 });

  const onRes = await j(await fetch(`${BASE}/api/bookings/mergeable?date=${TEST_DATE}&time=${GROUP_TIME}&phone=${guestPhone}`));
  t('啟用：mergeable 回未滿組（去識別，無姓名/電話）', () => {
    assert.equal(onRes.active, true);
    assert.equal(onRes.groups.length, 1);
    const g = onRes.groups[0];
    assert.equal(g.booking_id, groupBookingId);
    assert.equal(g.current_count, 2);
    assert.equal(g.remaining, 2);
    assert.ok(!('players_info' in g) && !('name' in g));
  });

  // ── 建立預約掛鉤：散客訂空時段、未同意 → 409 MERGE_REQUIRED ──
  const blocked = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: guestPhone, date: TEST_DATE, time: EMPTY_TIME, holes: 18, players_count: 1, players_info: [{ name: '散客' }] }),
  });
  const blockedBody = await blocked.json();
  t('啟用日+強制：散客未同意 → 409 MERGE_REQUIRED 並附可併組', () => {
    assert.equal(blocked.status, 409);
    assert.equal(blockedBody.code, 'MERGE_REQUIRED');
    assert.ok(Array.isArray(blockedBody.groups) && blockedBody.groups.length === 1);
  });

  // ── join-group：散客併入 → 該組 3 人 ──
  const joined = await j(await fetch(`${BASE}/api/bookings/join-group`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: guestPhone, target_booking_id: groupBookingId, players_info: [{ name: '散客' }] }),
  }));
  const { data: afterJoin } = await sb.from('bookings').select('players_count, allow_matching').eq('id', groupBookingId).single();
  t('join-group：併入後該組 3 人、allow_matching=true', () => {
    assert.equal(joined.success, true);
    assert.equal(afterJoin.players_count, 3);
    assert.equal(afterJoin.allow_matching, true);
  });

  // ── 同意併組(allow_matching:true) → 可自己建立預約（不擋）──
  const okCreate = await fetch(`${BASE}/api/bookings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: guestPhone, date: TEST_DATE, time: EMPTY_TIME, holes: 18, players_count: 1, players_info: [{ name: '散客' }], allow_matching: true }),
  });
  const okBody = await okCreate.json();
  if (okBody?.booking?.id || okBody?.id) createdBookingIds.push(okBody.booking?.id || okBody.id);
  t('同意併組：可正常建立自己的預約（不被擋）', () => {
    assert.ok(okCreate.status === 200 || okCreate.status === 201, `狀態應成功，實際 ${okCreate.status} / ${JSON.stringify(okBody)}`);
  });

  console.log(`\n通過 ${passed} 項\n`);
}

async function cleanup() {
  try {
    // 撈本次測試在 TEST_DATE 建立的所有預約（含散客自建的）一併刪
    const { data: bks } = await sb.from('bookings').select('id').eq('date', TEST_DATE).in('user_id', [ownerId, guestId]);
    for (const b of (bks || [])) await sb.from('bookings').delete().eq('id', b.id);
  } catch {}
  try { await sb.from('users').delete().in('id', [ownerId, guestId]); } catch {}
  // 還原 group_matching 設定
  try {
    if (prevSetting === undefined) await sb.from('system_settings').delete().eq('key', KEY);
    else await sb.from('system_settings').upsert({ key: KEY, value: prevSetting, updated_at: new Date().toISOString() });
  } catch {}
}

main().then(cleanup).catch(async (e) => { await cleanup(); console.error('端點整合測試失敗:', e.message); process.exit(1); });
