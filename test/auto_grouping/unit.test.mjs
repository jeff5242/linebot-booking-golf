// 單元測試：GroupMatching 純函式（不需 DB/env）。跑法：node test/auto_grouping/unit.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const GM = require('../../services/GroupMatching.js');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  ✓', name); }

console.log('GroupMatching 單元測試');

// ── normalizeConfig ──
t('normalizeConfig：空值 → 預設全關', () => {
  const c = GM.normalizeConfig(undefined);
  assert.equal(c.enabled, false);
  assert.deepEqual(c.enabledWeekdays, []);
  assert.deepEqual(c.enabledDates, []);
  assert.equal(c.force, false);
  assert.equal(c.maxPerGroup, 4);
});
t('normalizeConfig：過濾非法 weekday / date，maxPerGroup 夾在 2..4', () => {
  const c = GM.normalizeConfig({ enabled: true, enabledWeekdays: [6, 0, 9, 'x'], enabledDates: ['2026-10-25', 'bad'], maxPerGroup: 99 });
  assert.deepEqual(c.enabledWeekdays.sort(), [0, 6]);
  assert.deepEqual(c.enabledDates, ['2026-10-25']);
  assert.equal(c.maxPerGroup, 4); // 99 非法 → 回預設
});

// ── isActiveOn（零影響保證的核心）──
t('isActiveOn：enabled=false 一律 false（即使當天是啟用星期/日期）', () => {
  const c = GM.normalizeConfig({ enabled: false, enabledWeekdays: [0,1,2,3,4,5,6], enabledDates: ['2026-10-25'] });
  assert.equal(GM.isActiveOn('2026-10-25', c), false);
});
t('isActiveOn：啟用星期命中（2026-10-25 為週日=0）', () => {
  const c = GM.normalizeConfig({ enabled: true, enabledWeekdays: [0, 6] });
  assert.equal(GM.isActiveOn('2026-10-25', c), true);  // 週日
  assert.equal(GM.isActiveOn('2026-10-24', c), true);  // 週六
  assert.equal(GM.isActiveOn('2026-10-26', c), false); // 週一
});
t('isActiveOn：指定日期命中（非啟用星期也算）', () => {
  const c = GM.normalizeConfig({ enabled: true, enabledWeekdays: [], enabledDates: ['2026-10-26'] });
  assert.equal(GM.isActiveOn('2026-10-26', c), true);  // 週一但被指定
  assert.equal(GM.isActiveOn('2026-10-27', c), false);
});
t('isActiveOn：非法日期字串 → false', () => {
  const c = GM.normalizeConfig({ enabled: true, enabledWeekdays: [0,1,2,3,4,5,6] });
  assert.equal(GM.isActiveOn('', c), false);
  assert.equal(GM.isActiveOn('2026/10/25', c), false);
});
t('isActiveOn：台灣日界（週六 00:00 不被 UTC 位移算成週五）', () => {
  const c = GM.normalizeConfig({ enabled: true, enabledWeekdays: [6] });
  assert.equal(GM.isActiveOn('2026-10-24', c), true); // 週六
});

// ── peakType ──
t('peakType：落在 peak_a / peak_b / 離峰', () => {
  const a = { start: '06:00', end: '09:00' };
  const b = { start: '14:00', end: '17:00' };
  assert.equal(GM.peakType('07:30', a, b), 'peak_a');
  assert.equal(GM.peakType('15:00', a, b), 'peak_b');
  assert.equal(GM.peakType('11:00', a, b), null);
  assert.equal(GM.peakType('06:00:00', a, b), 'peak_a'); // 邊界含端點、吃 HH:mm:ss
  assert.equal(GM.peakType('', a, b), null);
});

console.log(`\n通過 ${passed} 項\n`);
