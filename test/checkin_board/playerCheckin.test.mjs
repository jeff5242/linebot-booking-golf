// 單元測試：組員分開報到 + 報到看板資料。node test/checkin_board/playerCheckin.test.mjs
import assert from 'node:assert/strict';
import {
  isPlayerCheckedIn,
  togglePlayerCheckin,
  checkInWholeGroup,
  boardSession,
  buildBoard,
} from '../../client/src/utils/playerCheckin.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  ✓', name); }

const NOW = '2026-11-28T07:05:00.000Z';
const EARLIER = '2026-11-28T06:50:00.000Z';

const booking = (over = {}) => ({
  id: 'b1', time: '07:00:00', holes: 18, players_count: 3, status: 'confirmed', checkin_time: null,
  players_info: [{ name: '甲', phone: '0911111111' }, { name: '乙', phone: null }, { name: '丙', phone: null }],
  ...over,
});

console.log('組員分開報到');

t('未報到的預約：每位組員都是未報到', () => {
  const b = booking();
  assert.deepEqual([0, 1, 2].map(i => isPlayerCheckedIn(b, i)), [false, false, false]);
});

t('舊資料：整組已報到、組員沒有個別紀錄 → 每位都算已報到', () => {
  const b = booking({ status: 'checked_in', checkin_time: EARLIER });
  assert.deepEqual([0, 1, 2].map(i => isPlayerCheckedIn(b, i)), [true, true, true]);
});

t('第一位報到：該位變已報到，整組改成 checked_in 並記報到時間', () => {
  const patch = togglePlayerCheckin(booking(), 1, NOW);
  assert.equal(patch.status, 'checked_in');
  assert.equal(patch.checkin_time, NOW);
  assert.equal(patch.players_info[1].checked_in_at, NOW);
  assert.ok(!('checked_in_at' in patch.players_info[0]));
  assert.ok(!('checked_in_at' in patch.players_info[2]));
  const after = { ...booking(), ...patch };
  assert.deepEqual([0, 1, 2].map(i => isPlayerCheckedIn(after, i)), [false, true, false]);
});

t('不改動原本的預約物件（不可變）', () => {
  const b = booking();
  const snapshot = JSON.stringify(b);
  togglePlayerCheckin(b, 0, NOW);
  assert.equal(JSON.stringify(b), snapshot);
});

t('第二位報到：整組報到時間維持第一位的時間', () => {
  const first = { ...booking(), ...togglePlayerCheckin(booking(), 0, EARLIER) };
  const patch = togglePlayerCheckin(first, 2, NOW);
  assert.equal(patch.status, 'checked_in');
  assert.equal(patch.checkin_time, EARLIER);
  assert.equal(patch.players_info[0].checked_in_at, EARLIER);
  assert.equal(patch.players_info[2].checked_in_at, NOW);
});

t('按錯取消：已報到的組員再按一次變回未報到，其他人不變', () => {
  let b = { ...booking(), ...togglePlayerCheckin(booking(), 0, EARLIER) };
  b = { ...b, ...togglePlayerCheckin(b, 1, NOW) };
  const patch = togglePlayerCheckin(b, 1, NOW);
  assert.equal(patch.status, 'checked_in');
  assert.ok(!('checked_in_at' in patch.players_info[1]));
  assert.equal(patch.players_info[0].checked_in_at, EARLIER);
});

t('取消到一個都不剩：整組改回 confirmed、報到時間清空', () => {
  const b = { ...booking(), ...togglePlayerCheckin(booking(), 0, EARLIER) };
  const patch = togglePlayerCheckin(b, 0, NOW);
  assert.equal(patch.status, 'confirmed');
  assert.equal(patch.checkin_time, null);
});

t('已產生收費卡時，不能取消最後一位的報到', () => {
  const b = { ...booking(), ...togglePlayerCheckin(booking(), 0, EARLIER) };
  assert.throws(() => togglePlayerCheckin(b, 0, NOW, { hasActiveChargeCard: true }), /收費卡/);
});

t('舊資料取消其中一位：其他人保留整組報到時間，只取消這一位', () => {
  const b = booking({ status: 'checked_in', checkin_time: EARLIER });
  const patch = togglePlayerCheckin(b, 2, NOW);
  assert.equal(patch.status, 'checked_in');
  assert.equal(patch.checkin_time, EARLIER);
  assert.equal(patch.players_info[0].checked_in_at, EARLIER);
  assert.equal(patch.players_info[1].checked_in_at, EARLIER);
  assert.ok(!('checked_in_at' in patch.players_info[2]));
});

t('組員序號不合法時丟出錯誤', () => {
  assert.throws(() => togglePlayerCheckin(booking(), 3, NOW), /組員/);
  assert.throws(() => togglePlayerCheckin(booking(), -1, NOW), /組員/);
});

t('已取消的預約不能報到', () => {
  assert.throws(() => togglePlayerCheckin(booking({ status: 'cancelled' }), 0, NOW), /取消/);
});

t('全組報到：沒報到的人補上時間，已報到的人時間不變', () => {
  const b = { ...booking(), ...togglePlayerCheckin(booking(), 1, EARLIER) };
  const patch = checkInWholeGroup(b, NOW);
  assert.equal(patch.status, 'checked_in');
  assert.equal(patch.checkin_time, EARLIER);
  assert.deepEqual(patch.players_info.map(p => p.checked_in_at), [NOW, EARLIER, NOW]);
});

console.log('\n報到看板');

t('11:00 前是上午場，11:00 起是下午場', () => {
  assert.equal(boardSession(10 * 60 + 59), 'am');
  assert.equal(boardSession(10 * 60), 'am');
  assert.equal(boardSession(11 * 60), 'pm');
  assert.equal(boardSession(15 * 60), 'pm');
});

const day = [
  booking({ id: 'a2', time: '06:37:00' }),
  booking({ id: 'a1', time: '06:30:00', status: 'checked_in', checkin_time: EARLIER }),
  booking({ id: 'x', time: '06:44:00', status: 'cancelled' }),
  booking({ id: 'p1', time: '12:30:00', players_count: 2, players_info: [{ name: '丁' }, { name: '戊', checked_in_at: NOW }], status: 'checked_in', checkin_time: NOW }),
  booking({ id: 'p2', time: '12:37:00' }),
];
const peaks = { peak_a: { start: '06:00', end: '09:00' }, peak_b: { start: '12:00', end: '14:00' } };

t('上午場只列下午 B 時段開始前的組，排除取消，組號照開球時間從 1 開始', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: 9 * 60 });
  assert.equal(board.session, 'am');
  assert.deepEqual(board.groups.map(g => [g.no, g.id]), [[1, 'a1'], [2, 'a2']]);
});

t('下午場只列下午 B 時段開始後的組，組號從 1 重新開始', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: 13 * 60 });
  assert.equal(board.session, 'pm');
  assert.deepEqual(board.groups.map(g => [g.no, g.id]), [[1, 'p1'], [2, 'p2']]);
});

t('每組固定 4 格：組員之後補空位，報到狀態逐人計算', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: 13 * 60 });
  const g = board.groups[0];
  assert.deepEqual(g.seats.map(s => s.empty ? '空位' : `${s.name}:${s.checked ? '到' : '未'}`), ['丁:未', '戊:到', '空位', '空位']);
  assert.equal(g.inCount, 1);
  assert.equal(g.size, 2);
});

t('人數統計只算這一場', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: 9 * 60 });
  assert.equal(board.totalGroups, 2);
  assert.equal(board.totalPlayers, 6);
  assert.equal(board.checkedPlayers, 3);
});

t('每頁 6 組：13 組分成 3 頁', () => {
  const many = Array.from({ length: 13 }, (_, i) => booking({ id: `m${i}`, time: `07:${String(i * 3).padStart(2, '0')}:00` }));
  const board = buildBoard(many, { settings: peaks, nowMinutes: 9 * 60 });
  assert.equal(board.pages.length, 3);
  assert.deepEqual(board.pages.map(p => p.length), [6, 6, 1]);
});

t('後台沒設定下午 B 時段時，用 12:00 分上下午', () => {
  const board = buildBoard(day, { settings: {}, nowMinutes: 13 * 60 });
  assert.deepEqual(board.groups.map(g => g.id), ['p1', 'p2']);
});

t('組員名字空白時顯示「球友 N」', () => {
  const b = booking({ players_info: [{ name: '甲' }, { name: '' }, {}] });
  const board = buildBoard([b], { settings: peaks, nowMinutes: 9 * 60 });
  assert.deepEqual(board.groups[0].seats.slice(0, 3).map(s => s.name), ['甲', '球友 2', '球友 3']);
});

console.log(`\n通過 ${passed} 項\n`);
