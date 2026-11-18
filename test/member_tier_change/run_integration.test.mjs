// 整合測試（連 .env 的 Supabase）：建測試會員（停權白金）→ 發 B 套本 → 驗身分改金卡、紀錄、同步保護 → 清除。
// node test/member_tier_change/run_integration.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });
const MTC = require('../../services/MemberTierChange.js');
const VoucherOps = require('../../services/VoucherOps.js');
const { sb } = require('../../services/UserSettingsLog.js');
const { buildUserRow } = require('../../scripts/syncUsers.js');

const PHONES = { lapsed: '0999000112', active: '0999000113' };
const db = sb();
const userIds = [];
let logRowExisted = false;
let passed = 0;
const t = async (n, fn) => { await fn(); passed++; console.log('  ✓', n); };

async function createMember(phone, lastPurchase) {
  const { data: u, error } = await db.from('users')
    .insert({ phone, display_name: `測試身分${phone.slice(-1)}`, golfer_type: '白金會員' }).select('id').single();
  if (error) throw error;
  userIds.push(u.id);
  const { error: vErr } = await db.from('vouchers').insert({
    code: `TEST-${phone}`, product_id: 0, product_name: '測試舊券', user_id: u.id,
    status: 'expired', source_type: 'paper_converted', price: 0, purchase_date: lastPurchase,
  });
  if (vErr) throw vErr;
  return u.id;
}

async function cleanup() {
  if (userIds.length) {
    const { data: vs } = await db.from('vouchers').select('id').in('user_id', userIds);
    const ids = (vs || []).map(v => v.id);
    if (ids.length) await db.from('voucher_logs').delete().in('voucher_id', ids);
    await db.from('vouchers').delete().in('user_id', userIds);
    await db.from('voucher_packages').delete().in('user_id', userIds);
    const { data: row } = await db.from('system_settings').select('value').eq('key', MTC.LOG_KEY).maybeSingle();
    if (row) {
      const rest = Object.fromEntries(Object.entries(row.value || {}).filter(([k]) => !userIds.includes(k)));
      if (!logRowExisted && Object.keys(rest).length === 0) {
        await db.from('system_settings').delete().eq('key', MTC.LOG_KEY);
      } else {
        await db.from('system_settings').update({ value: rest, updated_at: new Date().toISOString() }).eq('key', MTC.LOG_KEY);
      }
    }
  }
  await db.from('users').delete().in('phone', Object.values(PHONES));
}

async function main() {
  console.log('MemberTierChange 整合測試');
  const { data: existing } = await db.from('users').select('id').in('phone', Object.values(PHONES));
  assert.equal(existing.length, 0, '測試電話已存在，中止以免動到真實資料');
  const { data: logRow } = await db.from('system_settings').select('key').eq('key', MTC.LOG_KEY).maybeSingle();
  logRowExisted = Boolean(logRow);

  const lapsedId = await createMember(PHONES.lapsed, '2025-07-01');
  const activeId = await createMember(PHONES.active, new Date().toISOString().slice(0, 10));

  await t('停權白金發 B 套本：券照發、身分改金卡會員', async () => {
    const r = await VoucherOps.issuePackage({ userId: lapsedId, packageIndex: 1, operatorName: '測試員', invoiceNumber: 'TT00000001' });
    assert.equal(r.green_fee.count, 9);
    assert.equal(r.product.count, 10);
    assert.deepEqual(r.tierChange, { from: '白金會員', to: '金卡會員', changed: true });
    const { data: u } = await db.from('users').select('golfer_type').eq('id', lapsedId).single();
    assert.equal(u.golfer_type, '金卡會員');
  });

  await t('身分變更留紀錄，電話列入同步保護', async () => {
    const log = await MTC.getTierLog();
    assert.equal(log[lapsedId].length, 1);
    assert.equal(log[lapsedId][0].operator, '測試員');
    assert.equal(log[lapsedId][0].phone, PHONES.lapsed);
    assert.ok((await MTC.getTierLockedPhones()).has(PHONES.lapsed));
  });

  await t('同步 upsert：受保護的電話不會被試算表改回白金', async () => {
    const row = buildUserRow({ phone: PHONES.lapsed, name: '測試身分2', golferType: '白金會員' }, new Set(), await MTC.getTierLockedPhones());
    const { error } = await db.from('users').upsert(row, { onConflict: 'phone' });
    if (error) throw error;
    const { data: u } = await db.from('users').select('golfer_type').eq('id', lapsedId).single();
    assert.equal(u.golfer_type, '金卡會員');
  });

  await t('未停權白金發 B 套本：身分不變、不留紀錄', async () => {
    const r = await VoucherOps.issuePackage({ userId: activeId, packageIndex: 1, operatorName: '測試員', invoiceNumber: 'TT00000002' });
    assert.equal(r.tierChange, null);
    const { data: u } = await db.from('users').select('golfer_type').eq('id', activeId).single();
    assert.equal(u.golfer_type, '白金會員');
    assert.equal((await MTC.getTierLog())[activeId], undefined);
  });
}

main()
  .then(() => console.log(`\n${passed} passed`))
  .catch(err => { console.error('FAILED:', err); process.exitCode = 1; })
  .finally(cleanup);
