// 組員報到的讀寫（Supabase）。邏輯在 playerCheckin.js，這裡只負責「讀最新 → 算 → 寫回」。
import { supabase } from '../supabase';
import { togglePlayerCheckin, checkInWholeGroup } from './playerCheckin';

const FRESH_FIELDS = 'id, status, checkin_time, players_info, charge_cards(id, status)';

async function readFresh(bookingId) {
    const { data, error } = await supabase.from('bookings').select(FRESH_FIELDS).eq('id', bookingId).maybeSingle();
    if (error) throw new Error(`讀取預約失敗：${error.message}`);
    if (!data) throw new Error('找不到這筆預約');
    return data;
}

async function writePatch(bookingId, patch) {
    const { error } = await supabase
        .from('bookings')
        .update(patch)
        .eq('id', bookingId)
        .neq('status', 'cancelled');
    if (error) throw new Error(`儲存報到失敗：${error.message}`);
    return patch;
}

const hasActiveChargeCard = (b) => (b.charge_cards || []).some(c => c && c.status !== 'voided');

/** 切換一位組員的報到（每次先讀最新資料，避免蓋掉別台裝置剛按的報到） */
export async function savePlayerToggle(bookingId, index) {
    const fresh = await readFresh(bookingId);
    const patch = togglePlayerCheckin(fresh, index, new Date().toISOString(), {
        hasActiveChargeCard: hasActiveChargeCard(fresh),
    });
    return writePatch(bookingId, patch);
}

/** 全組報到 */
export async function saveWholeGroup(bookingId) {
    const fresh = await readFresh(bookingId);
    return writePatch(bookingId, checkInWholeGroup(fresh, new Date().toISOString()));
}
