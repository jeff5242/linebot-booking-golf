// 單元測試：報到看板「已出發」與「全員到齊後自動移除」。node test/checkin_board/departed.test.mjs
import assert from 'node:assert/strict';
import { buildBoard, groupLastCheckinAt } from '../../client/src/utils/playerCheckin.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  ✓', name); }

const peaks = { peak_b: { start: '12:00' } };
const MORNING = 9 * 60;
const at = (hhmmss) => `2026-11-28T${hhmmss}.000Z`;
const ms = (hhmmss) => Date.parse(at(hhmmss));

const group = (id, time, players, over = {}) => ({
  id, time, holes: 18, players_count: players.length, status: 'confirmed', checkin_time: null,
  players_info: players, ...over,
});
const inAt = (name, hhmmss) => ({ name, checked_in_at: at(hhmmss) });
const out = (name) => ({ name });

console.log('已出發 / 自動移除');

t('groupLastCheckinAt：全員到齊時取最後一位的報到時間', () => {
  const b = group('a', '07:00:00', [inAt('甲', '01:00:00'), inAt('乙', '01:05:00')], { status: 'checked_in', checkin_time: at('01:00:00') });
  assert.equal(groupLastCheckinAt(b), at('01:05:00'));
});

t('groupLastCheckinAt：有人沒到 → null', () => {
  const b = group('a', '07:00:00', [inAt('甲', '01:00:00'), out('乙')], { status: 'checked_in' });
  assert.equal(groupLastCheckinAt(b), null);
});

t('groupLastCheckinAt：舊資料（整組報到、沒有個別紀錄）用整組報到時間', () => {
  const b = group('a', '07:00:00', [out('甲'), out('乙')], { status: 'checked_in', checkin_time: at('01:02:00') });
  assert.equal(groupLastCheckinAt(b), at('01:02:00'));
});

const day = [
  group('g1', '07:00:00', [inAt('甲', '01:00:00'), inAt('乙', '01:00:10')], { status: 'checked_in' }),
  group('g2', '07:10:00', [inAt('丙', '01:00:00'), out('丁')], { status: 'checked_in' }),
  group('g3', '07:20:00', [out('戊')]),
];

t('按「已出發」的組從看板拿掉，其他組的組號不變', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING, departed: { g1: at('01:10:00') }, autoHideSeconds: 0, nowMs: ms('01:20:00') });
  assert.deepEqual(board.groups.map(g => [g.id, g.no]), [['g2', 2], ['g3', 3]]);
  assert.equal(board.departedGroups, 1);
  assert.equal(board.totalGroups, 3);
});

t('拿掉後重新分頁', () => {
  const many = Array.from({ length: 7 }, (_, i) => group(`m${i}`, `07:${String(i).padStart(2, '0')}:00`, [out('x')]));
  const board = buildBoard(many, { settings: peaks, nowMinutes: MORNING, departed: { m0: at('01:00:00') }, autoHideSeconds: 0, nowMs: ms('01:00:00'), perPage: 6 });
  assert.equal(board.pages.length, 1);
  assert.equal(board.pages[0].length, 6);
});

t('已出發的組仍算進「已報到 x / y 人」', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING, departed: { g1: at('01:10:00') }, autoHideSeconds: 0, nowMs: ms('01:20:00') });
  assert.equal(board.checkedPlayers, 3);
  assert.equal(board.totalPlayers, 5); // g1 2 人 + g2 2 人 + g3 1 人
});

t('自動移除：全員到齊後超過設定秒數就拿掉', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING, departed: {}, autoHideSeconds: 30, nowMs: ms('01:00:40') });
  assert.deepEqual(board.groups.map(g => g.id), ['g2', 'g3']);
  assert.equal(board.departedGroups, 1);
});

t('自動移除：還沒到時間 → 留在看板並顯示剩幾秒', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING, departed: {}, autoHideSeconds: 30, nowMs: ms('01:00:20') });
  const g1 = board.groups.find(g => g.id === 'g1');
  assert.ok(g1);
  assert.equal(g1.hideInSeconds, 20);
});

t('自動移除關閉（0）→ 全員到齊也不拿掉，hideInSeconds 為 null', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING, departed: {}, autoHideSeconds: 0, nowMs: ms('05:00:00') });
  assert.equal(board.groups.length, 3);
  assert.equal(board.groups[0].hideInSeconds, null);
});

t('自動移除：有人沒到的組永遠不會自動拿掉', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING, departed: {}, autoHideSeconds: 30, nowMs: ms('09:00:00') });
  assert.ok(board.groups.some(g => g.id === 'g2'));
  assert.ok(board.groups.some(g => g.id === 'g3'));
});

t('組卡帶 departedAt：沒出發的組是 null', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING });
  assert.equal(board.groups.length, 3);
  assert.ok(board.groups.every(g => g.departedAt === null));
});

t('沒傳 departed / autoHideSeconds 時，行為和原本一樣', () => {
  const board = buildBoard(day, { settings: peaks, nowMinutes: MORNING });
  assert.equal(board.departedGroups, 0);
  assert.equal(board.groups.length, 3);
});

console.log(`\n通過 ${passed} 項`);
