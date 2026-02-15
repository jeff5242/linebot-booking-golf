const { createClient } = require('@supabase/supabase-js');
const { sendSms } = require('./SmsService');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_DAILY_LIMIT = 10;
const OTP_MAX_ATTEMPTS = 5;

/**
 * 產生並發送 OTP 驗證碼
 * @param {string} phone - 手機號碼
 * @param {string} purpose - 用途 ('registration' | 'rebind')
 * @returns {{ success: boolean, message: string, expiresIn?: number }}
 */
async function sendOtp(phone, purpose = 'registration') {
    // 1. 冷卻期檢查：60 秒內不可重發
    const cooldownTime = new Date(Date.now() - OTP_COOLDOWN_SECONDS * 1000).toISOString();
    const { data: recentOtp } = await supabase
        .from('otp_codes')
        .select('id')
        .eq('phone', phone)
        .gte('created_at', cooldownTime)
        .limit(1)
        .maybeSingle();

    if (recentOtp) {
        return { success: false, message: '請稍候再試，每 60 秒只能發送一次驗證碼', code: 'COOLDOWN' };
    }

    // 2. 每日上限檢查
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
        .from('otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .gte('created_at', todayStart.toISOString());

    if (count >= OTP_DAILY_LIMIT) {
        return { success: false, message: '今日驗證碼發送次數已達上限，請明天再試', code: 'LIMIT_REACHED' };
    }

    // 3. 產生 6 位數 OTP
    const code = Math.floor(Math.pow(10, OTP_LENGTH - 1) + Math.random() * 9 * Math.pow(10, OTP_LENGTH - 1)).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // 4. 儲存到 DB
    const { error: insertError } = await supabase
        .from('otp_codes')
        .insert({
            phone,
            code,
            purpose,
            expires_at: expiresAt.toISOString(),
        });

    if (insertError) {
        console.error('[OTP] 儲存失敗:', insertError.message);
        return { success: false, message: '系統錯誤，請稍後再試', code: 'DB_ERROR' };
    }

    // 5. 發送簡訊（帶入 OTP code 和 purpose 供記錄）
    const smsResult = await sendSms(
        phone,
        `【大衛營球場】您的驗證碼為 ${code}，${OTP_EXPIRY_MINUTES}分鐘內有效。請勿將驗證碼提供給他人。`,
        { otpCode: code, purpose }
    );

    if (!smsResult.success) {
        console.error('[OTP] 簡訊發送失敗:', smsResult.error);
        return { success: false, message: '簡訊發送失敗，請確認手機號碼是否正確', code: 'SMS_FAILED' };
    }

    return {
        success: true,
        message: '驗證碼已發送至您的手機',
        expiresIn: OTP_EXPIRY_MINUTES * 60,
    };
}

/**
 * 驗證 OTP
 * @param {string} phone - 手機號碼
 * @param {string} code - 驗證碼
 * @returns {{ success: boolean, message: string }}
 */
async function verifyOtp(phone, code) {
    // 查詢最新的未驗證、未過期 OTP
    const { data: otpRecord, error } = await supabase
        .from('otp_codes')
        .select('*')
        .eq('phone', phone)
        .eq('verified', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !otpRecord) {
        return { success: false, message: '驗證碼已過期或不存在，請重新發送' };
    }

    // 檢查嘗試次數
    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
        return { success: false, message: '驗證碼嘗試次數過多，請重新發送' };
    }

    // 比對驗證碼
    if (otpRecord.code !== code) {
        // 增加嘗試次數
        await supabase
            .from('otp_codes')
            .update({ attempts: otpRecord.attempts + 1 })
            .eq('id', otpRecord.id);

        const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
        return {
            success: false,
            message: remaining > 0
                ? `驗證碼錯誤，還剩 ${remaining} 次機會`
                : '驗證碼嘗試次數過多，請重新發送',
        };
    }

    // 驗證成功
    await supabase
        .from('otp_codes')
        .update({ verified: true })
        .eq('id', otpRecord.id);

    return { success: true, message: '驗證成功' };
}

module.exports = { sendOtp, verifyOtp };
