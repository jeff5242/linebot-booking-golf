const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const SETTINGS_KEY = 'booking_rules';

const DEFAULT_SETTINGS = {
    start_time: '05:30',
    end_time: '17:00',
    interval: 10, // 3, 5, 6, 10, 15
    min_group_size: 4,
    turn_time: 120,
    peak_a: { start: "05:30", end: "07:30", max_groups: 20, reserved: 5 },
    peak_b: { start: "11:30", "end": "12:30", max_groups: 15, reserved: 2 },
    is_peak_a_overflow: false,
    // 新增欄位
    booking_advance_days: 180,
    overflow_enabled: false,
    hop_mode: 'auto', // auto | manual
    hop_timeout_minutes: 120,
    weekday_mode: 'default', // default | separated
    member_guest_ratio: '3:1',
    fees: {
        electronic_fee: 50,
        off_peak_discount: true,
        caddie_fund_tiers: [
            { min: 0, max: 11, rate: 0 },
            { min: 12, max: 16, rate: 200 },
            { min: 17, max: 99, rate: 300 }
        ]
    },
    notifications: {
        cancellation_template: '您的預約已取消',
        waitlist_template: '候補通知：您的時段已開放'
    }
};

/**
 * Fetch system settings from DB or return default.
 */
async function getSettings() {
    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .single();

    if (error || !data) {
        // If not found, return default (and maybe init it)
        return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...data.value };
}

/**
 * Update system settings.
 * @param {Object} newSettings 
 */
async function updateSettings(newSettings) {
    // Validate interval
    const allowedIntervals = [3, 5, 6, 10, 15];
    if (newSettings.interval && !allowedIntervals.includes(parseInt(newSettings.interval))) {
        throw new Error(`Invalid interval. Allowed: ${allowedIntervals.join(', ')}`);
    }

    const { data, error } = await supabase
        .from('system_settings')
        .upsert({
            key: SETTINGS_KEY,
            value: newSettings,
            updated_at: new Date()
        })
        .select()
        .single();

    if (error) throw error;
    return data.value;
}

module.exports = {
    getSettings,
    updateSettings
};
