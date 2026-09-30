// 單元測試：ExpiryReminder 純函式。node test/expiry_reminder/unit.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ER = require('../../services/ExpiryReminder.js');

let passed = 0;
const t = (n, fn) => { fn(); passed++; console.log('  ✓', n); };
console.log('ExpiryReminder 單元測試');

t('normalizeConfig：空 → 預設關閉、100天、窗7', () => {
  const c = ER.normalizeConfig(undefined);
  assert.equal(c.enabled, false);
  assert.equal(c.daysBefore, 100);
  assert.equal(c.windowDays, 7);
  assert.deepEqual(c.voucherTypes, ['果嶺券', '商品券']);
});
t('normalizeConfig：夾範圍、過濾非法券種', () => {
  const c = ER.normalizeConfig({ enabled: true, daysBefore: 999, windowDays: 0, runHour: 30, voucherTypes: ['果嶺券', 'X'] });
  assert.equal(c.daysBefore, 100); // 999 非法→預設
  assert.equal(c.windowDays, 7);
  assert.equal(c.runHour, 10);
  assert.deepEqual(c.voucherTypes, ['果嶺券']);
});

t('daysBetween / daysUntil：正確天數', () => {
  assert.equal(ER.daysBetween('2026-09-30', '2027-01-08'), 100);
  assert.equal(ER.daysUntil('2027-01-08T00:00:00+00:00', '2026-09-30'), 100);
});

t('isDue：100天窗7 → 100..94 觸發、101 與 93 不觸發', () => {
  const c = ER.normalizeConfig({ daysBefore: 100, windowDays: 7 });
  assert.equal(ER.isDue(100, c), true);
  assert.equal(ER.isDue(94, c), true);
  assert.equal(ER.isDue(101, c), false);
  assert.equal(ER.isDue(93, c), false);
  assert.equal(ER.isDue(50, c), false);
});

t('buildMessage：填入 name/date/days/count', () => {
  const c = ER.normalizeConfig({ template: '{name}/{date}/{days}/{count}' });
  const msg = ER.buildMessage({ name: '王小明', validUntil: '2027-01-08T00:00:00Z', daysLeft: 100, count: 18 }, c);
  assert.equal(msg, '王小明/2027-01-08/100/18');
});

t('selectDue：只挑觸發窗內、有LINE、未提醒過', () => {
  const c = ER.normalizeConfig({ daysBefore: 100, windowDays: 7 });
  const today = '2026-09-30';
  const batches = [
    { user_id: 'u1', name: 'A', line_user_id: 'L1', valid_until: '2027-01-08', count: 18 }, // 100天 → 挑
    { user_id: 'u2', name: 'B', line_user_id: 'L2', valid_until: '2027-01-02', count: 9 },  // 94天 → 挑
    { user_id: 'u3', name: 'C', line_user_id: 'L3', valid_until: '2027-01-09', count: 5 },  // 101天 → 不挑
    { user_id: 'u4', name: 'D', line_user_id: null, valid_until: '2027-01-08', count: 4 },  // 無LINE → 不挑
    { user_id: 'u5', name: 'E', line_user_id: 'L5', valid_until: '2027-01-08', count: 3 },  // 100天但已提醒過 → 不挑
  ];
  const sent = new Set([ER.sentKey('u5', '2027-01-08')]);
  const due = ER.selectDue(batches, today, c, sent);
  assert.deepEqual(due.map(d => d.user_id).sort(), ['u1', 'u2']);
  assert.equal(due.find(d => d.user_id === 'u1').daysLeft, 100);
});

t('selectDue：首次啟用不會回頭洗整批（剩50天者不發）', () => {
  const c = ER.normalizeConfig({ daysBefore: 100, windowDays: 7 });
  const batches = [{ user_id: 'x', name: 'X', line_user_id: 'L', valid_until: '2026-11-19', count: 10 }]; // 50天
  assert.equal(ER.selectDue(batches, '2026-09-30', c, new Set()).length, 0);
});

console.log(`\n通過 ${passed} 項\n`);
