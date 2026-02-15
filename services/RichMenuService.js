/**
 * Rich Menu 切換服務
 *
 * 用途：用戶註冊後，將 Rich Menu 從「登入前」切換為「登入後」
 */
'use strict';
require('dotenv').config();
const { messagingApi } = require('@line/bot-sdk');

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const RICH_MENU_AFTER_LOGIN = process.env.RICH_MENU_AFTER_LOGIN;
const RICH_MENU_BEFORE_LOGIN = process.env.RICH_MENU_BEFORE_LOGIN;

let client;
try {
    client = new messagingApi.MessagingApiClient({ channelAccessToken });
} catch (err) {
    console.warn('[RichMenu] LINE SDK 初始化失敗:', err.message);
}

/**
 * 將用戶的 Rich Menu 切換為「登入後」版本
 * @param {string} lineUserId - LINE 用戶 ID
 */
async function switchToMemberMenu(lineUserId) {
    if (!client || !RICH_MENU_AFTER_LOGIN) {
        console.log('[RichMenu] 跳過切換：未設定 RICH_MENU_AFTER_LOGIN');
        return;
    }

    try {
        await client.linkRichMenuIdToUser(lineUserId, RICH_MENU_AFTER_LOGIN);
        console.log(`[RichMenu] 已切換用戶 ${lineUserId} 至會員 Rich Menu`);
    } catch (err) {
        console.error(`[RichMenu] 切換失敗 (${lineUserId}):`, err.message);
    }
}

/**
 * 將用戶的 Rich Menu 切換回「登入前」版本
 * @param {string} lineUserId - LINE 用戶 ID
 */
async function switchToDefaultMenu(lineUserId) {
    if (!client || !RICH_MENU_BEFORE_LOGIN) {
        console.log('[RichMenu] 跳過切換：未設定 RICH_MENU_BEFORE_LOGIN');
        return;
    }

    try {
        await client.linkRichMenuIdToUser(lineUserId, RICH_MENU_BEFORE_LOGIN);
        console.log(`[RichMenu] 已切換用戶 ${lineUserId} 至預設 Rich Menu`);
    } catch (err) {
        console.error(`[RichMenu] 切換失敗 (${lineUserId}):`, err.message);
    }
}

module.exports = { switchToMemberMenu, switchToDefaultMenu };
