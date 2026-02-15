const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const MITAKE_API_URL = process.env.MITAKE_API_URL || 'https://smsapi.mitake.com.tw/api/mtk/SmSend';
const MITAKE_USERNAME = process.env.MITAKE_USERNAME;
const MITAKE_PASSWORD = process.env.MITAKE_PASSWORD;

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
 * 透過三竹簡訊 HTTP API 發送簡訊
 * @param {string} phone - 手機號碼 (例: 0912345678)
 * @param {string} message - 簡訊內容
 * @param {object} options - 額外選項
 * @param {string} options.otpCode - OTP 驗證碼（供記錄用）
 * @param {string} options.purpose - 用途 ('registration' | 'rebind' | 'notification')
 * @returns {{ success: boolean, msgId?: string, statusCode?: string, accountPoint?: string, error?: string }}
 */
async function sendSms(phone, message, options = {}) {
    const { otpCode, purpose } = options;

    // Dev 模式：未設定三竹帳號時，僅 log 到 console
    if (!MITAKE_USERNAME || !MITAKE_PASSWORD) {
        console.log('=== [SMS Dev Mode] ===');
        console.log(`To: ${phone}`);
        console.log(`Message: ${message}`);
        console.log('======================');

        await logSms({
            phone, message, otpCode, purpose,
            msgId: 'dev_mode', statusCode: '1', status: 'success',
            accountPoint: null, errorMessage: null,
        });

        return { success: true, msgId: 'dev_mode', statusCode: '1' };
    }

    try {
        // 三竹 HTTP API: CharsetURL 必須放在 URL query string，不能放在 POST body
        const apiUrlWithCharset = `${MITAKE_API_URL}?CharsetURL=UTF-8`;

        const params = new URLSearchParams();
        params.append('username', MITAKE_USERNAME);
        params.append('password', MITAKE_PASSWORD);
        params.append('dstaddr', phone);
        params.append('smbody', message);

        const response = await axios.post(apiUrlWithCharset, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
            timeout: 10000,
        });

        // 三竹回應格式：每行 key=value
        const responseText = response.data || '';
        const lines = responseText.split('\n');
        const result = {};
        for (const line of lines) {
            const [key, ...valueParts] = line.split('=');
            if (key) {
                result[key.trim()] = valueParts.join('=').trim();
            }
        }

        // statuscode: 1=成功, 其他=失敗
        const statusCode = result.statuscode || result.StatusCode || '';
        const msgId = result.msgid || result.MsgId || '';
        const accountPoint = result.AccountPoint || result.accountpoint || '';

        if (statusCode === '1' || statusCode === '0') {
            console.log(`[SMS] 發送成功 → ${phone}, msgId: ${msgId}, 剩餘點數: ${accountPoint}`);

            await logSms({
                phone, message, otpCode, purpose,
                msgId, statusCode, status: 'success',
                accountPoint, errorMessage: null,
            });

            return { success: true, msgId, statusCode, accountPoint };
        } else {
            console.error(`[SMS] 發送失敗 → ${phone}, statusCode: ${statusCode}, response: ${responseText}`);

            await logSms({
                phone, message, otpCode, purpose,
                msgId, statusCode, status: 'failed',
                accountPoint, errorMessage: `簡訊發送失敗 (${statusCode})`,
            });

            return { success: false, statusCode, error: `簡訊發送失敗 (${statusCode})` };
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
