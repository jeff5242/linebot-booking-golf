/**
 * Rich Menu 建立腳本
 *
 * 建立兩組 Rich Menu：
 * 1. 登入前（預設）：2 格 — 升級會員 / 運勢卡、球場資訊
 * 2. 登入後（會員）：3 格 — 會員專區、運勢卡、球場資訊
 *
 * 使用方式：
 *   node scripts/setupRichMenus.js
 *
 * 前置需求：
 *   1. 準備兩張 1200x405 的 Rich Menu 圖片：
 *      - images/richmenu-before-login.png (2 格版)
 *      - images/richmenu-after-login.png  (3 格版)
 *   2. .env 中已設定 LINE_CHANNEL_ACCESS_TOKEN
 */

'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { messagingApi } = require('@line/bot-sdk');

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_ID = '2008898874-4qus3SyN';
const LIFF_BASE_URL = `https://liff.line.me/${LIFF_ID}`;

const client = new messagingApi.MessagingApiClient({ channelAccessToken });
const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken });

// ============================
// Rich Menu 定義
// ============================

// 登入前 Rich Menu — 2 格 (1200 x 405)
const beforeLoginMenu = {
    size: { width: 1200, height: 405 },
    selected: true,
    name: 'richmenu-before-login',
    chatBarText: '選單',
    areas: [
        {
            // 左邊：升級會員 / 運勢卡
            bounds: { x: 0, y: 0, width: 600, height: 405 },
            action: {
                type: 'uri',
                label: '升級會員 / 運勢卡',
                uri: `${LIFF_BASE_URL}/register`,
            },
        },
        {
            // 右邊：球場資訊
            bounds: { x: 600, y: 0, width: 600, height: 405 },
            action: {
                type: 'uri',
                label: '球場資訊',
                uri: `${LIFF_BASE_URL}/course-info`,
            },
        },
    ],
};

// 登入後 Rich Menu — 3 格 (1200 x 405)
const afterLoginMenu = {
    size: { width: 1200, height: 405 },
    selected: true,
    name: 'richmenu-after-login',
    chatBarText: '選單',
    areas: [
        {
            // 左：會員專區
            bounds: { x: 0, y: 0, width: 400, height: 405 },
            action: {
                type: 'uri',
                label: '會員專區',
                uri: `${LIFF_BASE_URL}/member`,
            },
        },
        {
            // 中：運勢卡
            bounds: { x: 400, y: 0, width: 400, height: 405 },
            action: {
                type: 'uri',
                label: '運勢卡',
                uri: `${LIFF_BASE_URL}/fortune`,
            },
        },
        {
            // 右：球場資訊
            bounds: { x: 800, y: 0, width: 400, height: 405 },
            action: {
                type: 'uri',
                label: '球場資訊',
                uri: `${LIFF_BASE_URL}/course-info`,
            },
        },
    ],
};

// ============================
// 執行
// ============================

async function main() {
    console.log('=== Rich Menu 設定工具 ===\n');

    // 1. 列出並刪除現有 Rich Menu（避免累積空殼）
    console.log('📋 列出現有 Rich Menu...');
    const existing = await client.getRichMenuList();
    if (existing.richmenus && existing.richmenus.length > 0) {
        console.log(`  找到 ${existing.richmenus.length} 個 Rich Menu:`);
        for (const rm of existing.richmenus) {
            console.log(`  - ${rm.richMenuId}: ${rm.name}`);
        }
        console.log('🗑️  刪除舊 Rich Menu...');
        for (const rm of existing.richmenus) {
            await client.deleteRichMenu(rm.richMenuId);
            console.log(`  ✅ 已刪除: ${rm.richMenuId}`);
        }
        console.log('');
    } else {
        console.log('  目前沒有 Rich Menu\n');
    }

    // 2. 建立「登入前」Rich Menu
    console.log('📝 建立「登入前」Rich Menu...');
    const beforeResult = await client.createRichMenu(beforeLoginMenu);
    const beforeMenuId = beforeResult.richMenuId;
    console.log(`  ✅ 建立成功: ${beforeMenuId}`);

    // 3. 建立「登入後」Rich Menu
    console.log('📝 建立「登入後」Rich Menu...');
    const afterResult = await client.createRichMenu(afterLoginMenu);
    const afterMenuId = afterResult.richMenuId;
    console.log(`  ✅ 建立成功: ${afterMenuId}`);

    // 4. 上傳圖片
    const beforeImagePath = path.join(__dirname, '..', 'images', 'richmenu-before-login.png');
    const afterImagePath = path.join(__dirname, '..', 'images', 'richmenu-after-login.png');

    if (fs.existsSync(beforeImagePath)) {
        console.log('🖼️  上傳「登入前」圖片...');
        const beforeImage = fs.readFileSync(beforeImagePath);
        const beforeBlob = new Blob([beforeImage], { type: 'image/png' });
        await blobClient.setRichMenuImage(beforeMenuId, beforeBlob);
        console.log('  ✅ 上傳成功');
    } else {
        console.log(`  ⚠️  找不到圖片: ${beforeImagePath}`);
        console.log('  請準備 1200x405 的 PNG 圖片後放到 images/richmenu-before-login.png');
    }

    if (fs.existsSync(afterImagePath)) {
        console.log('🖼️  上傳「登入後」圖片...');
        const afterImage = fs.readFileSync(afterImagePath);
        const afterBlob = new Blob([afterImage], { type: 'image/png' });
        await blobClient.setRichMenuImage(afterMenuId, afterBlob);
        console.log('  ✅ 上傳成功');
    } else {
        console.log(`  ⚠️  找不到圖片: ${afterImagePath}`);
        console.log('  請準備 1200x405 的 PNG 圖片後放到 images/richmenu-after-login.png');
    }

    // 5. 設定「登入前」為預設 Rich Menu
    console.log('\n🔧 設定「登入前」為預設 Rich Menu...');
    await client.setDefaultRichMenu(beforeMenuId);
    console.log('  ✅ 預設 Rich Menu 設定完成');

    // 6. 輸出結果
    console.log('\n=== 完成 ===');
    console.log(`登入前 Rich Menu ID: ${beforeMenuId}`);
    console.log(`登入後 Rich Menu ID: ${afterMenuId}`);
    console.log('\n請將以下內容加入 .env：');
    console.log(`RICH_MENU_BEFORE_LOGIN=${beforeMenuId}`);
    console.log(`RICH_MENU_AFTER_LOGIN=${afterMenuId}`);
    console.log('\n圖片規格：');
    console.log('  - 尺寸：1200 x 405 px');
    console.log('  - 格式：PNG 或 JPEG');
    console.log('  - 大小：< 1 MB');
    console.log('  - images/richmenu-before-login.png (2 格版)');
    console.log('  - images/richmenu-after-login.png  (3 格版)');
}

main().catch(err => {
    console.error('❌ 錯誤:', err.message);
    process.exit(1);
});
