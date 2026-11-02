// 單元測試：MemberNameEdit 純函式＋同步組資料。node test/member_name_edit/unit.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const MNE = require('../../services/MemberNameEdit.js');
const { buildUserRow } = require('../../scripts/syncUsers.js');

let passed = 0;
const t = (n, fn) => { fn(); passed++; console.log('  ✓', n); };
console.log('MemberNameEdit 單元測試');

t('normalizeName：去頭尾空白、連續空白縮成一個', () => {
  assert.deepEqual(MNE.normalizeName('  王 　 貴玲 '), { ok: true, name: '王 貴玲' });
});
t('normalizeName：空白、非字串 → 錯誤', () => {
  assert.equal(MNE.normalizeName('   ').ok, false);
  assert.equal(MNE.normalizeName(undefined).ok, false);
  assert.equal(MNE.normalizeName(123).ok, false);
});
t('normalizeName：超過長度上限 → 錯誤；剛好上限 → 通過', () => {
  assert.equal(MNE.normalizeName('一'.repeat(MNE.MAX_NAME_LENGTH + 1)).ok, false);
  assert.equal(MNE.normalizeName('一'.repeat(MNE.MAX_NAME_LENGTH)).ok, true);
});
t('normalizeName：含控制字元 → 錯誤', () => {
  assert.equal(MNE.normalizeName('王\u0000貴玲').ok, false);
});
t('appendEdit：不修改原物件、同一會員累加', () => {
  const log = { u1: [{ to: 'A' }] };
  const next = MNE.appendEdit(log, 'u1', { to: 'B' });
  assert.deepEqual(log, { u1: [{ to: 'A' }] });
  assert.deepEqual(next.u1, [{ to: 'A' }, { to: 'B' }]);
  assert.deepEqual(MNE.appendEdit(undefined, 'u2', { to: 'C' }), { u2: [{ to: 'C' }] });
});
t('flattenLog：攤平並以時間新→舊排序、帶 userId', () => {
  const rows = MNE.flattenLog({
    u1: [{ to: 'A', at: '2026-10-01T00:00:00Z' }, { to: 'B', at: '2026-10-03T00:00:00Z' }],
    u2: [{ to: 'C', at: '2026-10-02T00:00:00Z' }],
    bad: 'x',
  });
  assert.deepEqual(rows.map(r => `${r.userId}:${r.to}`), ['u1:B', 'u2:C', 'u1:A']);
});
t('buildUserRow：一般會員帶 display_name', () => {
  const row = buildUserRow({ phone: '0911', name: '試算表名', memberNo: 'A1' }, new Set());
  assert.equal(row.display_name, '試算表名');
  assert.equal(row.member_no, 'A1');
});
t('buildUserRow：手動改過名字的電話不帶 display_name（其他欄位照常）', () => {
  const row = buildUserRow({ phone: '0911', name: '試算表名', memberNo: 'A1', golferType: '白金會員' }, new Set(['0911']));
  assert.equal('display_name' in row, false);
  assert.equal(row.member_no, 'A1');
  assert.equal(row.golfer_type, '白金會員');
});

console.log(`\n${passed} 項通過`);
