// 單元測試：rankMergeable（可併組候選排序＋去識別）。node test/auto_grouping/mergeable.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const GM = require('../../services/GroupMatching.js');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  ✓', name); }

const peakA = { start: '06:00', end: '09:00' };
const peakB = { start: '14:00', end: '17:00' };

const sample = () => ([
  { id: 'g1', time: '08:00', players_count: 2, players_info: [{ name: '王', phone: '0911111111' }, { name: '李' }], holes: 18, status: 'confirmed', user_id: 'uOther' },
  { id: 'g2', time: '08:15', players_count: 3, players_info: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], holes: 18, status: 'confirmed', user_id: 'uOther' },
  { id: 'g3', time: '15:00', players_count: 1, players_info: [{ name: 'D' }], holes: 9, status: 'confirmed', user_id: 'uOther' },
  { id: 'gFull', time: '08:00', players_count: 4, players_info: [], holes: 18, status: 'confirmed', user_id: 'uOther' },
  { id: 'gCancel', time: '08:00', players_count: 1, players_info: [], holes: 18, status: 'cancelled', user_id: 'uOther' },
  { id: 'gSelf', time: '08:30', players_count: 1, players_info: [], holes: 18, status: 'confirmed', user_id: 'uMe' },
]);

console.log('rankMergeable 單元測試');

t('去識別：輸出不含任何姓名/電話欄位', () => {
  const out = GM.rankMergeable(sample(), '08:00', peakA, peakB, 4, new Set());
  for (const g of out) {
    assert.deepEqual(Object.keys(g).sort(), ['booking_id', 'current_count', 'holes', 'peak', 'remaining', 'same_slot', 'time']);
    assert.ok(!('players_info' in g) && !('name' in g) && !('phone' in g));
  }
});

t('濾掉滿組(4人)與取消組', () => {
  const out = GM.rankMergeable(sample(), '08:00', peakA, peakB, 4, new Set());
  const ids = out.map(g => g.booking_id);
  assert.ok(!ids.includes('gFull'), '滿組不應出現');
  assert.ok(!ids.includes('gCancel'), '取消組不應出現');
});

t('排除自己的組（excludeBookingIds）', () => {
  const out = GM.rankMergeable(sample(), '08:00', peakA, peakB, 4, new Set(['gSelf']));
  assert.ok(!out.map(g => g.booking_id).includes('gSelf'));
});

t('排序：同時間 → 同 Peak → 其他', () => {
  const out = GM.rankMergeable(sample(), '08:00', peakA, peakB, 4, new Set(['gSelf']));
  // 想要 08:00（peak_a）：g1 同時間(0) → g2 同 peak_a(1) → g3 peak_b(2)
  assert.deepEqual(out.map(g => g.booking_id), ['g1', 'g2', 'g3']);
  assert.equal(out[0].same_slot, true);
  assert.equal(out[1].same_slot, false);
});

t('remaining 計算正確（上限 4）', () => {
  const out = GM.rankMergeable(sample(), '08:00', peakA, peakB, 4, new Set(['gSelf']));
  const g2 = out.find(g => g.booking_id === 'g2');
  assert.equal(g2.current_count, 3);
  assert.equal(g2.remaining, 1);
});

t('maxPerGroup=3 時，3人組視為滿、不列入', () => {
  const out = GM.rankMergeable(sample(), '08:00', peakA, peakB, 3, new Set(['gSelf']));
  assert.ok(!out.map(g => g.booking_id).includes('g2'), '3人組在上限3時應算滿');
});

console.log(`\n通過 ${passed} 項\n`);
