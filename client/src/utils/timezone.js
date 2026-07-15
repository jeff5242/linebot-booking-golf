// 全站時區：DB 時間存 UTC，顯示前一律加上「設定的位移」再取字串。
// 位移來源：後端 /api/config/timezone（預設台灣 +480 分）。以 localStorage 快取，
// 首次載入即用上次值（或預設 480），initTimezone() 再向後端更新。
const API = import.meta.env.VITE_API_URL || '';
const CACHE_KEY = 'app_tz_offset';
const DEFAULT_OFFSET = 480; // 台灣 UTC+8

let offsetMinutes = DEFAULT_OFFSET;
try {
    const cached = Number(localStorage.getItem(CACHE_KEY));
    if (Number.isFinite(cached)) offsetMinutes = cached;
} catch { /* localStorage 不可用時用預設 */ }

export function getTzOffsetMinutes() {
    return offsetMinutes;
}

export function setTzOffsetMinutes(min) {
    if (!Number.isFinite(min)) return;
    offsetMinutes = min;
    try { localStorage.setItem(CACHE_KEY, String(min)); } catch { /* ignore */ }
}

// 向後端讀取目前時區設定並更新（回傳 { offsetMinutes, label } 或 null）
export async function initTimezone() {
    try {
        const res = await fetch(`${API}/api/config/timezone`);
        if (!res.ok) return null;
        const d = await res.json();
        if (Number.isFinite(d?.offsetMinutes)) setTzOffsetMinutes(d.offsetMinutes);
        return d;
    } catch {
        return null;
    }
}

function shift(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getTime() + offsetMinutes * 60000).toISOString();
}

// YYYY-MM-DD HH:MM（設定時區）
export function formatTWDateTime(iso) {
    if (!iso) return '';
    const s = shift(iso);
    return s ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : String(iso);
}

// YYYY-MM-DD（設定時區）
export function formatTWDate(iso) {
    if (!iso) return '';
    const s = shift(iso);
    return s ? s.slice(0, 10) : String(iso).slice(0, 10);
}

// HH:MM（設定時區）
export function formatTWTime(iso) {
    if (!iso) return '-';
    const s = shift(iso);
    return s ? s.slice(11, 16) : String(iso).slice(11, 16);
}

// 模組載入時自動向後端更新一次（fire-and-forget），讓各頁沿用最新時區設定
initTimezone();
