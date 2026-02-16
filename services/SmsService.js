const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// MilkIdea SMS API 設定
const MILKIDEA_API_URL = process.env.MILKIDEA_API_URL || 'http://sms.milkidea.com/api/api-sms-send.sms';
const MILKIDEA_TOKEN = process.env.MILKIDEA_TOKEN || '8e940972d4ecec9bcdbbdebf8658a012504';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * 將 SMS 發送記錄寫入 sms_logs 表
 */
async function logSms({ phone, message, otpCode, purpose, msgId, statusCode, status, accountPoint, errorMessage }) {
    try {
        await supabase.from('sms_logs').insert({
            phone,
            message,
            otp_code: otpCode || null,
            purpose: purpose || null,
            msg_id: msgId || null,
            status_code: statusCode || null,
            status,
            account_point: accountPoint ? parseInt(accountPoint, 10) : null,
            error_message: errorMessage || null,
        });
    } catch (err) {
        console.error('[SMS Log] 寫入失敗:', err.message);
    }
}

/**
 * 透過 MilkIdea SMS API 發送簡訊
 *
 * API 回傳格式： {"Error":{"code":0,"description":""}}
 *   - code 0 = 成功
 *   - code 非 0 = 失敗，description 為錯誤說明
 *
 * @param {string} phone - 手機號碼 (例: 0912345678)
 * @param {string} message - 簡訊內容
 * @param {object} options - 額外選項
 * @param {string} options.otpCode - OTP 驗證碼（供記錄用）
 * @param {string} options.purpose - 用途 ('registration' | 'rebind' | 'notification')
 * @returns {{ success: boolean, error?: string }}
 */
async function sendSms(phone, message, options = {}) {
    const { otpCode, purpose } = options;

    try {
        console.log(`[SMS] Sending to ${phone} via MilkIdea`);

        const params = new URLSearchParams();
        params.append('token', MILKIDEA_TOKEN);
        params.append('dstAddr', phone);
        params.append('smbody', message);

        const response = await axios.post(MILKIDEA_API_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000,
        });

        console.log('[SMS] Response:', JSON.stringify(response.data));

        // MilkIdea 回傳格式: {"Error":{"code":0,"description":""}}
        const resData = response.data;
        const errorCode = resData?.Error?.code;
        const errorDesc = resData?.Error?.description || '';

        if (errorCode === 0) {
            // 成功
            console.log(`[SMS] 發送成功 → ${phone}`);

            await logSms({
                phone, message, otpCode, purpose,
                msgId: null,
                statusCode: '0',
                status: 'success',
                accountPoint: null,
                errorMessage: null,
            });

            return { success: true };
        } else {
            // 失敗
            const errMsg = `MilkIdea 簡訊發送失敗 (code: ${errorCode}, desc: ${errorDesc})`;
            console.error(`[SMS] ${errMsg}`);

            await logSms({
                phone, message, otpCode, purpose,
                msgId: null,
                statusCode: String(errorCode),
                status: 'failed',
                accountPoint: null,
                errorMessage: errMsg,
            });

            return { success: false, error: errMsg };
        }
    } catch (error) {
        console.error(`[SMS] 發送例外 → ${phone}:`, error.message);

        await logSms({
            phone, message, otpCode, purpose,
            msgId: null, statusCode: null, status: 'failed',
            accountPoint: null, errorMessage: error.message,
        });

        return { success: false, error: error.message };
    }
}

module.exports = { sendSms };
