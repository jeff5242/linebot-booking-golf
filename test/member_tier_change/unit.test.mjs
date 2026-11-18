// 單元測試：MemberTierChange 純函式＋同步組資料。node test/member_tier_change/unit.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MTC = require('../../services/MemberTierChange.js');
const { buildUserRow } = require('../../scripts/syncUsers.js');

let passed = 0;
const t = (n, fn) => { fn(); passed++; console.log('  ✓', n); };
console.log('MemberTierChange 單元測試');

const NOW = new Date('2026-11-18T12:00:00+08:00');

t('isLapsed：上次購買 + 15 個月之後＝停權（張增守 2025-07-13 → 2026-10-13 後停權）', () => {
  assert.equal(MTC.isLapsed('2025-07-13T16:00:00+00:00', NOW), true);
});
t('isLapsed：還在 13 個月效期或 2 個月寬限內＝未停權', () => {
  assert.equal(MTC.isLapsed('2025-11-01', NOW), false); // 效期內
  assert.equal(MTC.isLapsed('2025-09-01', NOW), false); // 寬限期內（2026-12-01 才停權）
});
t('isLapsed：沒有購買紀錄或日期無效＝未停權', () => {
  assert.equal(MTC.isLapsed(null, NOW), false);
  assert.equal(MTC.isLapsed('not-a-date', NOW), false);
});
t('isPackageAllowedWhenLapsed：只有 B 套本（index 1）', () => {
  assert.equal(MTC.isPackageAllowedWhenLapsed(1), true);
  assert.equal(MTC.isPackageAllowedWhenLapsed('1'), true);
  assert.equal(MTC.isPackageAllowedWhenLapsed(0), false);
});
t('planTierChange：停權白金 + B 套本 → 白金改金卡', () => {
  const plan = MTC.planTierChange({ packageIndex: 1, golferType: '白金會員', lastPurchaseDate: '2025-07-13', now: NOW });
  assert.deepEqual(plan, { from: '白金會員', to: '金卡會員' });
});
t('planTierChange：A 套本、未停權、非白金 → 不改', () => {
  assert.equal(MTC.planTierChange({ packageIndex: 0, golferType: '白金會員', lastPurchaseDate: '2025-07-13', now: NOW }), null);
  assert.equal(MTC.planTierChange({ packageIndex: 1, golferType: '白金會員', lastPurchaseDate: '2025-11-01', now: NOW }), null);
  assert.equal(MTC.planTierChange({ packageIndex: 1, golferType: '來賓', lastPurchaseDate: '2025-07-13', now: NOW }), null);
  assert.equal(MTC.planTierChange({ packageIndex: 1, golferType: '金卡會員', lastPurchaseDate: '2025-07-13', now: NOW }), null);
});
t('buildUserRow：身分受保護的電話不帶 golfer_type，其他欄位照帶', () => {
  const row = buildUserRow({ phone: '0911', name: '甲', golferType: '白金會員', memberNo: 'A1' }, new Set(), new Set(['0911']));
  assert.equal('golfer_type' in row, false);
  assert.equal(row.display_name, '甲');
  assert.equal(row.member_no, 'A1');
});
t('buildUserRow：未保護照常帶 golfer_type；不傳第三參數也相容', () => {
  assert.equal(buildUserRow({ phone: '0911', name: '甲', golferType: '白金會員' }, new Set(), new Set()).golfer_type, '白金會員');
  assert.equal(buildUserRow({ phone: '0911', name: '甲', golferType: '白金會員' }, new Set()).golfer_type, '白金會員');
});

console.log(`\n${passed} passed`);
