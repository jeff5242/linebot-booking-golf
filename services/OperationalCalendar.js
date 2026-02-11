/**
 * 營運日曆服務 - 後端業務邏輯
 *
 * 功能：
 * 1. 日期覆蓋設定管理
 * 2. 批次操作
 * 3. 衝突檢查
 * 4. 日期狀態判定
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * ============================================
 * 日期狀態判定
 * ============================================
 */

/**
 * 取得指定日期的營運設定
 * @param {string} date - 日期 (YYYY-MM-DD)
 * @param {object} globalSettings - 全域設定（從 SystemSettings 取得）
 * @returns {Promise<object>} 該日的完整營運設定
 */
async function getDateOperationalStatus(date, globalSettings = null) {
    // 1. 查詢是否有覆蓋設定
    const { data: override, error } = await supabase
        .from('operational_calendar')
        .select('*')
        .eq('date', date)
        .single();

    // 2. 如果沒有覆蓋設定，返回全域設定
    if (error || !override) {
        // 取得全域設定（如果未提供）
        if (!globalSettings) {
            const SystemSettings = require('./SystemSettings');
            globalSettings = await SystemSettings.getSettings();
        }

        return {
            date,
            status: 'normal',
            start_time: globalSettings.start_time || '05:30',
            end_time: globalSettings.end_time || '17:00',
            interval: globalSettings.interval || 10,
            peak_periods: [globalSettings.peak_a, globalSettings.peak_b],
            source: 'global_template'
        };
    }

    // 3. 有覆蓋設定，合併設定
    if (!globalSettings) {
        const SystemSettings = require('./SystemSettings');
        globalSettings = await SystemSettings.getSettings();
    }

    return {
        date,
        status: override.status,
        start_time: override.custom_start_time || globalSettings.start_time || '05:30',
        end_time: override.custom_end_time || globalSettings.end_time || '17:00',
        interval: override.custom_interval || globalSettings.interval || 10,
        peak_periods: override.custom_peak_periods || [globalSettings.peak_a, globalSettings.peak_b],
        max_bookings: override.custom_max_bookings,
        notes: override.notes,
        closure_reason: override.closure_reason,
        source: 'calendar_override'
    };
}

/**
 * ============================================
 * CRUD 操作
 * ============================================
 */

/**
 * 取得單日覆蓋設定
 */
async function getDateOverride(date) {
    const { data, error } = await supabase
        .from('operational_calendar')
        .select('*')
        .eq('date', date)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = 找不到資料
        throw new Error(`讀取設定失敗: ${error.message}`);
    }

    return data;
}

/**
 * 取得日期區間的覆蓋設定
 */
async function getDateRangeOverrides(startDate, endDate) {
    const { data, error } = await supabase
        .from('operational_calendar')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

    if (error) {
        throw new Error(`讀取區間設定失敗: ${error.message}`);
    }

    return data || [];
}

/**
 * 建立或更新單日覆蓋設定
 */
async function upsertDateOverride(dateOverride, performedBy) {
    // 驗證必要欄位
    if (!dateOverride.date) {
        throw new Error('日期為必填');
    }

    if (!dateOverride.status) {
        throw new Error('狀態為必填');
    }

    // 如果是休場，必須提供原因
    if ((dateOverride.status === 'closed' || dateOverride.status === 'emergency_closed') &&
        !dateOverride.closure_reason) {
        throw new Error('休場時必須提供原因');
    }

    // 檢查是否有衝突的預約
    const conflicts = await checkBookingConflicts(dateOverride.date, dateOverride.status);

    const { data, error } = await supabase
        .from('operational_calendar')
        .upsert({
            date: dateOverride.date,
            status: dateOverride.status,
            custom_start_time: dateOverride.custom_start_time,
            custom_end_time: dateOverride.custom_end_time,
            custom_interval: dateOverride.custom_interval,
            custom_peak_periods: dateOverride.custom_peak_periods,
            custom_max_bookings: dateOverride.custom_max_bookings,
            notes: dateOverride.notes,
            closure_reason: dateOverride.closure_reason,
            affected_booking_count: conflicts.count,
            created_by: performedBy,
            updated_by: performedBy,
            updated_at: new Date()
        }, { onConflict: 'date' })
        .select()
        .single();

    if (error) {
        throw new Error(`儲存設定失敗: ${error.message}`);
    }

    return {
        success: true,
        data,
        conflicts
    };
}

/**
 * 刪除覆蓋設定（恢復全域範本）
 */
async function deleteDateOverride(date) {
    const { error } = await supabase
        .from('operational_calendar')
        .delete()
        .eq('date', date);

    if (error) {
        throw new Error(`刪除設定失敗: ${error.message}`);
    }

    return { success: true, message: '已恢復全域範本' };
}

/**
 * ============================================
 * 批次操作
 * ============================================
 */

/**
 * 批次設定營運日曆
 * @param {object} batchConfig - 批次設定參數
 * @param {string} batchConfig.start_date - 開始日期
 * @param {string} batchConfig.end_date - 結束日期
 * @param {string} batchConfig.operation_type - 操作類型 (apply_template, bulk_close, bulk_override)
 * @param {object} batchConfig.settings - 套用的設定
 * @param {array} batchConfig.exclude_weekdays - 排除的星期 (0-6, 0=週日)
 * @param {string} performedBy - 執行者 ID
 */
async function applyBatchSettings(batchConfig, performedBy) {
    const { start_date, end_date, operation_type, settings, exclude_weekdays = [] } = batchConfig;

    // 生成日期列表
    const dates = generateDateRange(start_date, end_date);

    // 過濾排除的星期
    const affectedDates = dates.filter(date => {
        const dayOfWeek = new Date(date).getDay();
        return !exclude_weekdays.includes(dayOfWeek);
    });

    let operations = [];

    if (operation_type === 'apply_template') {
        // 刪除這些日期的覆蓋設定（恢復全域範本）
        const { error } = await supabase
            .from('operational_calendar')
            .delete()
            .in('date', affectedDates);

        if (error) {
            throw new Error(`批次刪除失敗: ${error.message}`);
        }

    } else if (operation_type === 'bulk_close') {
        // 批次設為休場
        operations = affectedDates.map(date => ({
            date,
            status: 'closed',
            closure_reason: settings.closure_reason || '球場維護',
            notes: settings.notes || '',
            created_by: performedBy,
            updated_by: performedBy,
            updated_at: new Date()
        }));

    } else if (operation_type === 'bulk_override') {
        // 批次自定義設定
        operations = affectedDates.map(date => ({
            date,
            status: 'normal',
            custom_start_time: settings.custom_start_time,
            custom_end_time: settings.custom_end_time,
            custom_interval: settings.custom_interval,
            custom_max_bookings: settings.custom_max_bookings,
            notes: settings.notes || '',
            created_by: performedBy,
            updated_by: performedBy,
            updated_at: new Date()
        }));
    }

    // 批次插入或更新
    if (operations.length > 0) {
        const { error } = await supabase
            .from('operational_calendar')
            .upsert(operations, { onConflict: 'date' });

        if (error) {
            throw new Error(`批次設定失敗: ${error.message}`);
        }
    }

    // 記錄批次操作
    await supabase.from('calendar_batch_operations').insert({
        operation_type,
        start_date,
        end_date,
        settings,
        affected_dates_count: affectedDates.length,
        performed_by: performedBy
    });

    return {
        success: true,
        affectedCount: affectedDates.length,
        message: `已成功處理 ${affectedDates.length} 個日期`
    };
}

/**
 * 生成日期區間列表
 */
function generateDateRange(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }

    return dates;
}

/**
 * ============================================
 * 衝突檢查
 * ============================================
 */

/**
 * 檢查該日是否有預約衝突
 */
async function checkBookingConflicts(date, newStatus) {
    // 只有休場或臨時關閉才需要檢查衝突
    if (newStatus !== 'closed' && newStatus !== 'emergency_closed') {
        return {
            hasConflicts: false,
            count: 0,
            affectedBookings: []
        };
    }

    // 查詢該日的所有有效預約
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('date', date)
        .in('status', ['confirmed', 'checked_in', 'pending']);

    if (error) {
        throw new Error(`衝突檢查失敗: ${error.message}`);
    }

    return {
        hasConflicts: bookings && bookings.length > 0,
        count: bookings ? bookings.length : 0,
        affectedBookings: bookings || []
    };
}

/**
 * ============================================
 * 通知功能
 * ============================================
 */

/**
 * 發送休場通知給受影響用戶
 */
async function sendClosureNotifications(date, affectedBookings, closureReason) {
    // TODO: 整合 LINE 訊息 API
    // 這裡需要根據專案的 LINE Bot 實作來發送通知

    const message = `您好，因${closureReason}，您於${date}的預約需要調整。請聯繫客服重新安排時間。`;

    // 模擬發送通知
    console.log(`發送通知給 ${affectedBookings.length} 位用戶`);
    console.log(`訊息內容: ${message}`);

    // 更新通知狀態
    await supabase
        .from('operational_calendar')
        .update({
            notify_existing_bookings: true,
            notification_sent_at: new Date()
        })
        .eq('date', date);

    return {
        success: true,
        notified: affectedBookings.length
    };
}

/**
 * ============================================
 * 匯出
 * ============================================
 */
module.exports = {
    // 狀態判定
    getDateOperationalStatus,

    // CRUD
    getDateOverride,
    getDateRangeOverrides,
    upsertDateOverride,
    deleteDateOverride,

    // 批次操作
    applyBatchSettings,

    // 衝突檢查
    checkBookingConflicts,

    // 通知
    sendClosureNotifications
};
