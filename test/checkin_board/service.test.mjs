// 單元測試：services/CheckinBoard.js（設定正規化、已出發紀錄讀寫，用假的 supabase，不連 DB）。
// node test/checkin_board/service.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CB = require('../../services/CheckinBoard.js');

let passed = 0;
async function t(name, fn) { await fn(); passed++; console.log('  ✓', name); }

// ── 假的 system_settings（只實作這個服務會用到的查詢）──
function fakeDb(initialRows = []) {
  const rows = initialRows.map(r => ({ ...r }));
  const hooks = { beforeUpdate: null };
  const match = (r, filters) => filters.every(f => f(r));
  function builder() {
    const q = { filters: [], op: 'select', payload: null, single: false };
    const api = {
      select() { return api; },
      eq(k, v) { q.filters.push(r => r[k] === v); return api; },
      like(k, pattern) { const p = pattern.replace(/%$/, ''); q.filters.push(r => String(r[k]).startsWith(p)); return api; },
      lt(k, v) { q.filters.push(r => String(r[k]) < v); return api; },
      maybeSingle() { q.single = true; return api; },
      insert(row) { q.op = 'insert'; q.payload = row; return api; },
      update(patch) { q.op = 'update'; q.payload = patch; return api; },
      delete() { q.op = 'delete'; return api; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    function run() {
      if (q.op === 'insert') {
        if (rows.some(r => r.key === q.payload.key)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        rows.push({ ...q.payload });
        return { data: null, error: null };
      }
      if (q.op === 'update') {
        if (hooks.beforeUpdate) { const h = hooks.beforeUpdate; hooks.beforeUpdate = null; h(rows); }
        const hit = rows.filter(r => match(r, q.filters));
        hit.forEach(r => Object.assign(r, q.payload));
        return { data: hit.map(r => ({ key: r.key })), error: null };
      }
      if (q.op === 'delete') {
        for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], q.filters)) rows.splice(i, 1);
        return { data: null, error: null };
      }
      const hit = rows.filter(r => match(r, q.filters)).map(r => ({ ...r }));
      return { data: q.single ? (hit[0] || null) : hit, error: null };
    }
    return api;
  }
  return { client: { from: () => builder() }, rows, hooks };
}

console.log('CheckinBoard 服務');

await t('normalizeConfig：空值 → 預設開啟、30 秒', () => {
  assert.deepEqual(CB.normalizeConfig(undefined), { autoHideEnabled: true, autoHideSeconds: 30 });
});

await t('normalizeConfig：只接受 30 / 60 / 180 / 300 秒', () => {
  assert.equal(CB.normalizeConfig({ autoHideEnabled: true, autoHideSeconds: 180 }).autoHideSeconds, 180);
  assert.equal(CB.normalizeConfig({ autoHideEnabled: true, autoHideSeconds: 7 }).autoHideSeconds, 30);
  assert.equal(CB.normalizeConfig({ autoHideEnabled: false, autoHideSeconds: 60 }).autoHideEnabled, false);
});

await t('effectiveAutoHideSeconds：關閉時回 0', () => {
  assert.equal(CB.effectiveAutoHideSeconds({ autoHideEnabled: false, autoHideSeconds: 60 }), 0);
  assert.equal(CB.effectiveAutoHideSeconds({ autoHideEnabled: true, autoHideSeconds: 60 }), 60);
});

await t('departedKey：日期格式錯誤時拋錯', () => {
  assert.equal(CB.departedKey('2026-11-28'), 'checkin_departed:2026-11-28');
  assert.throws(() => CB.departedKey('2026/11/28'), /日期/);
});

await t('applyDeparted：標記與取消，不改原本的物件', () => {
  const before = { a: '2026-11-28T01:00:00.000Z' };
  const added = CB.applyDeparted(before, 'b', true, '2026-11-28T02:00:00.000Z');
  assert.deepEqual(added, { a: '2026-11-28T01:00:00.000Z', b: '2026-11-28T02:00:00.000Z' });
  assert.deepEqual(before, { a: '2026-11-28T01:00:00.000Z' });
  const removed = CB.applyDeparted(added, 'a', false, 'x');
  assert.deepEqual(removed, { b: '2026-11-28T02:00:00.000Z' });
});

await t('applyDeparted：已出發的組再按一次，保留第一次的時間', () => {
  const m = CB.applyDeparted({ a: 'first' }, 'a', true, 'second');
  assert.equal(m.a, 'first');
});

await t('setDeparted：當天第一筆 → 新增一列', async () => {
  const db = fakeDb();
  const map = await CB.setDeparted({ date: '2026-11-28', bookingId: 'b1', departed: true, nowIso: 'T1' }, db.client);
  assert.deepEqual(map, { b1: 'T1' });
  assert.deepEqual(db.rows.find(r => r.key === 'checkin_departed:2026-11-28').value, { b1: 'T1' });
});

await t('setDeparted：同時有另一台寫入 → 重讀後合併，不會蓋掉對方', async () => {
  const db = fakeDb([{ key: 'checkin_departed:2026-11-28', value: { b1: 'T1' }, updated_at: '2026-11-28T01:00:00.000Z' }]);
  db.hooks.beforeUpdate = (rows) => {
    const r = rows.find(x => x.key === 'checkin_departed:2026-11-28');
    r.value = { ...r.value, b2: 'T2' };
    r.updated_at = '2026-11-28T01:00:00.500Z';
  };
  const map = await CB.setDeparted({ date: '2026-11-28', bookingId: 'b3', departed: true, nowIso: 'T3' }, db.client);
  assert.deepEqual(map, { b1: 'T1', b2: 'T2', b3: 'T3' });
});

await t('setDeparted：復原（departed=false）移除該組', async () => {
  const db = fakeDb([{ key: 'checkin_departed:2026-11-28', value: { b1: 'T1', b2: 'T2' }, updated_at: '2026-11-28T01:00:00.000Z' }]);
  const map = await CB.setDeparted({ date: '2026-11-28', bookingId: 'b1', departed: false, nowIso: 'T9' }, db.client);
  assert.deepEqual(map, { b2: 'T2' });
});

await t('getDeparted：沒有紀錄時回空物件', async () => {
  const db = fakeDb();
  assert.deepEqual(await CB.getDeparted('2026-11-28', db.client), {});
});

await t('pruneOldDeparted：只刪過期的已出發紀錄，不動其他設定', async () => {
  const db = fakeDb([
    { key: 'checkin_departed:2026-10-01', value: {}, updated_at: '2026-10-01T00:00:00.000Z' },
    { key: 'checkin_departed:2026-11-27', value: {}, updated_at: '2026-11-27T00:00:00.000Z' },
    { key: 'booking_rules', value: {}, updated_at: '2026-01-01T00:00:00.000Z' },
  ]);
  await CB.pruneOldDeparted('2026-11-14T00:00:00.000Z', db.client);
  assert.deepEqual(db.rows.map(r => r.key).sort(), ['booking_rules', 'checkin_departed:2026-11-27']);
});

console.log(`\n通過 ${passed} 項`);
