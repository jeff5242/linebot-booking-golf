// 組員分開報到 + 報到看板資料（純函式，前端與單元測試共用）。
//
// 資料：每位組員的報到時間存在 bookings.players_info[i].checked_in_at（不動 schema）。
// 整組狀態：任何一位報到 → bookings.status='checked_in'、checkin_time=第一位的時間；
//           全部取消 → 改回 'confirmed'、checkin_time=null。
// 舊資料：整組已報到（掃碼或舊的「報到」按鈕）但組員沒有個別紀錄 → 每位都算已報到。

export const SEATS_PER_GROUP = 4;
export const GROUPS_PER_PAGE = 6;
export const PM_SWITCH_MINUTES = 11 * 60; // 11:00 起看板改秀下午場
const DEFAULT_PM_START = '12:00';

const players = (booking) => (Array.isArray(booking?.players_info) ? booking.players_info : []);

/** 是否有任何組員帶個別報到紀錄（有欄位就算，值為 null 也算） */
function hasPlayerFlags(booking) {
    return players(booking).some(p => p && Object.prototype.hasOwnProperty.call(p, 'checked_in_at'));
}

/** 整組已報到、但組員沒有個別紀錄（舊資料） */
function isLegacyWholeGroup(booking) {
    return booking?.status === 'checked_in' && !hasPlayerFlags(booking);
}

/** 第 index 位組員是否已報到 */
export function isPlayerCheckedIn(booking, index) {
    const p = players(booking)[index];
    if (!p) return false;
    if (p.checked_in_at) return true;
    return isLegacyWholeGroup(booking);
}

function withoutCheckin(p) {
    const { checked_in_at, ...rest } = p || {};
    return rest;
}

/** 舊資料先展開成逐人紀錄（每人用整組報到時間），之後才能單獨取消某一位 */
function materialize(booking, nowIso) {
    if (!isLegacyWholeGroup(booking)) return players(booking).map(p => ({ ...p }));
    const at = booking.checkin_time || nowIso;
    return players(booking).map(p => ({ ...p, checked_in_at: at }));
}

function groupPatch(booking, nextPlayers, nowIso) {
    const anyIn = nextPlayers.some(p => p.checked_in_at);
    if (!anyIn) return { players_info: nextPlayers, status: 'confirmed', checkin_time: null };
    const wasIn = booking.status === 'checked_in';
    return {
        players_info: nextPlayers,
        status: 'checked_in',
        checkin_time: wasIn && booking.checkin_time ? booking.checkin_time : nowIso,
    };
}

function assertCheckable(booking) {
    if (!booking) throw new Error('找不到預約');
    if (booking.status === 'cancelled') throw new Error('這筆預約已取消，不能報到');
}

/**
 * 切換第 index 位組員的報到狀態。回傳要寫回 bookings 的欄位（新物件，不改原本的 booking）。
 * @param {object} booking 含 status, checkin_time, players_info
 * @param {number} index 組員序號（0 起算）
 * @param {string} nowIso 現在時間 ISO 字串
 * @param {{hasActiveChargeCard?: boolean}} [opts] 已產生收費卡時，不能把整組取消回未報到
 * @returns {{players_info: object[], status: string, checkin_time: string|null}}
 */
export function togglePlayerCheckin(booking, index, nowIso, opts = {}) {
    assertCheckable(booking);
    const list = players(booking);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
        throw new Error('找不到這位組員');
    }
    const base = materialize(booking, nowIso);
    const next = base.map((p, i) => {
        if (i !== index) return p;
        return p.checked_in_at ? withoutCheckin(p) : { ...p, checked_in_at: nowIso };
    });
    const patch = groupPatch(booking, next, nowIso);
    if (patch.status !== 'checked_in' && opts.hasActiveChargeCard) {
        throw new Error('這組已產生收費卡，不能取消最後一位的報到');
    }
    return patch;
}

/** 全組報到：沒報到的人補上現在時間，已報到的人保留原本時間 */
export function checkInWholeGroup(booking, nowIso) {
    assertCheckable(booking);
    const next = materialize(booking, nowIso).map(p => (p.checked_in_at ? p : { ...p, checked_in_at: nowIso }));
    return groupPatch(booking, next, nowIso);
}

/** 看板要秀哪一場：11:00 前上午，11:00 起下午 */
export function boardSession(nowMinutes) {
    return nowMinutes < PM_SWITCH_MINUTES ? 'am' : 'pm';
}

const hhmm = (t) => String(t || '').slice(0, 5);

/**
 * 組出報到看板的資料。
 * 上午 = 開球時間早於後台「下午 B 時段」開始時間；沒設定時用 12:00。
 * 組號每場照開球時間從 1 開始。
 * @param {object[]} bookings 當天預約
 * @param {{settings?: object, nowMinutes: number, perPage?: number}} opts
 */
export function buildBoard(bookings, { settings, nowMinutes, perPage = GROUPS_PER_PAGE }) {
    const session = boardSession(nowMinutes);
    const pmStart = hhmm(settings?.peak_b?.start) || DEFAULT_PM_START;
    const inSession = (b) => (session === 'am' ? hhmm(b.time) < pmStart : hhmm(b.time) >= pmStart);

    const groups = (Array.isArray(bookings) ? bookings : [])
        .filter(b => b && b.status !== 'cancelled' && inSession(b))
        .slice()
        .sort((a, b) => hhmm(a.time).localeCompare(hhmm(b.time)))
        .map((b, gi) => {
            const list = players(b);
            const seats = Array.from({ length: Math.max(SEATS_PER_GROUP, list.length) }, (_, i) => {
                if (i >= list.length) return { empty: true, checked: false, name: '' };
                const name = String(list[i]?.name || '').trim() || `球友 ${i + 1}`;
                return { empty: false, checked: isPlayerCheckedIn(b, i), name };
            });
            const inCount = seats.filter(s => s.checked).length;
            return {
                id: b.id, no: gi + 1, time: hhmm(b.time), holes: b.holes,
                seats, inCount, size: list.length, allIn: list.length > 0 && inCount === list.length,
            };
        });

    const pages = [];
    for (let i = 0; i < groups.length; i += perPage) pages.push(groups.slice(i, i + perPage));

    return {
        session,
        groups,
        pages,
        totalGroups: groups.length,
        totalPlayers: groups.reduce((n, g) => n + g.size, 0),
        checkedPlayers: groups.reduce((n, g) => n + g.inCount, 0),
    };
}
