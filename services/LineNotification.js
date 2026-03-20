const line = require('@line/bot-sdk');
require('dotenv').config();

const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

/**
 * 發送 LINE Push 訊息
 * @param {string} lineUserId - LINE User ID
 * @param {Array} messages - LINE 訊息陣列
 */
async function sendPushMessage(lineUserId, messages) {
    if (!lineUserId) {
        return { success: false, reason: 'no_line_id' };
    }

    try {
        await client.pushMessage({
            to: lineUserId,
            messages: messages,
        });
        return { success: true };
    } catch (error) {
        console.error(`LINE Push 失敗 (${lineUserId}):`, error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * 組建收費卡通知訊息
 * @param {Object} params
 * @param {string} params.playerName - 球員姓名
 * @param {string} params.caddyName - 桿弟姓名
 * @param {string} params.caddyNumber - 桿弟編號
 * @param {string} params.departureTime - 出發時間
 * @param {string} params.date - 日期
 */
function buildChargeCardMessage({ playerName, caddyName, caddyNumber, departureTime, date }) {
    const text = [
        '🔔 大衛營球場 - 出發通知',
        '',
        `親愛的 ${playerName} 您好：`,
        '您的收費卡已準備完成！',
        '',
        `⛳️ 服務桿弟：${caddyName} / 編號 ${caddyNumber}`,
        `📅 日期：${date}`,
        departureTime ? `🕐 出發時間：${departureTime}` : '',
        '🚩 集合地點：請前往出發台找您的服務桿弟報到',
        '',
        '預祝您今日擊球愉快！',
    ].filter(Boolean).join('\n');

    return [{ type: 'text', text }];
}

/**
 * 廣播訊息給所有 LINE 好友
 * @param {Array} messages - LINE 訊息陣列
 */
async function broadcastLineMessage(messages) {
    try {
        await client.broadcast({ messages });
        return { success: true };
    } catch (error) {
        console.error('LINE Broadcast 失敗:', error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * 群發訊息給指定的 LINE 使用者（自動分批，每批 500 人）
 * @param {string[]} lineUserIds - LINE User ID 陣列
 * @param {Array} messages - LINE 訊息陣列
 */
async function multicastLineMessages(lineUserIds, messages) {
    const BATCH_SIZE = 500;
    let sent = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < lineUserIds.length; i += BATCH_SIZE) {
        const chunk = lineUserIds.slice(i, i + BATCH_SIZE);
        try {
            await client.multicast({ to: chunk, messages });
            sent += chunk.length;
        } catch (error) {
            console.error(`LINE Multicast 失敗 (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error.message);
            failed += chunk.length;
            errors.push(error.message);
        }
    }

    return { success: failed === 0, sent, failed, errors };
}

module.exports = {
    sendPushMessage,
    buildChargeCardMessage,
    broadcastLineMessage,
    multicastLineMessages
};
