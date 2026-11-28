// 報到看板「已出發」與自動移除設定的 API（後端存 system_settings）。
import { adminFetch } from './adminApi';

async function readJson(res, fallbackMessage) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || fallbackMessage);
    return data;
}

/**
 * 讀當天已出發的組與自動移除秒數。
 * @param {string} date YYYY-MM-DD
 * @returns {Promise<{departed: Object<string, string>, autoHideSeconds: number}>}
 */
export async function fetchBoardState(date) {
    const res = await adminFetch(`/api/checkin-board/state?date=${encodeURIComponent(date)}`);
    const data = await readJson(res, '讀取已出發紀錄失敗');
    return { departed: data.departed || {}, autoHideSeconds: Number(data.autoHideSeconds) || 0 };
}

/**
 * 標記「已出發」（departed=true）或「復原」（departed=false）。回傳當天最新的已出發對照表。
 * @param {string} date YYYY-MM-DD
 * @param {string} bookingId
 * @param {boolean} departed
 * @returns {Promise<Object<string, string>>}
 */
export async function saveDeparted(date, bookingId, departed) {
    const res = await adminFetch('/api/checkin-board/departed', {
        method: 'POST',
        body: JSON.stringify({ date, booking_id: bookingId, departed }),
    });
    const data = await readJson(res, departed ? '標記已出發失敗' : '復原失敗');
    return data.departed || {};
}

export async function fetchBoardSettings() {
    const res = await adminFetch('/api/checkin-board-settings');
    return readJson(res, '讀取報到看板設定失敗');
}

export async function saveBoardSettings(config) {
    const res = await adminFetch('/api/checkin-board-settings', { method: 'POST', body: JSON.stringify({ config }) });
    return readJson(res, '儲存報到看板設定失敗');
}
