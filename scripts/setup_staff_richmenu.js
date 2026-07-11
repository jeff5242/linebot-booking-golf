#!/usr/bin/env node
/**
 * 員工核銷站 Rich Menu 一鍵設定（雙選單自動切換）。
 *
 * 建立兩張選單並上傳圖：
 *   A 未綁定（單鈕「員工驗證」）→ 設為全體預設（user/all）
 *   B 已綁定（核銷 / 查詢券 / 我的紀錄）→ 印出 richMenuId 供後端環境變數使用
 *
 * 後端在「綁定成功」時會把該用戶切到 B、「解除綁定」時切回 A（見 services/StaffRichMenu.js）。
 *
 * 用法：
 *   STAFF_LINE_MESSAGING_TOKEN=xxxx node scripts/setup_staff_richmenu.js
 *   或  node scripts/setup_staff_richmenu.js <token>
 * 可選環境變數：
 *   STAFF_LIFF_BASE  預設 https://liff.line.me/2010669108-BSpoNkiG
 *
 * 完成後把輸出的兩個值設到後端 Render 環境變數：
 *   STAFF_LINE_MESSAGING_TOKEN = <你的 token>
 *   STAFF_RICHMENU_BOUND_ID    = <輸出的 已綁定選單 ID>
 * 再手動 Deploy 後端即生效。
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.STAFF_LINE_MESSAGING_TOKEN || process.argv[2];
const LIFF_BASE = (process.env.STAFF_LIFF_BASE || 'https://liff.line.me/2010669108-BSpoNkiG').replace(/\/$/, '');
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const NAME_UNBOUND = '員工核銷-未綁定';
const NAME_BOUND = '員工核銷-已綁定';

if (!TOKEN) {
  console.error('❌ 缺少 token。用法：STAFF_LINE_MESSAGING_TOKEN=xxx node scripts/setup_staff_richmenu.js');
  process.exit(1);
}

const SIZE = { width: 2500, height: 843 };
const uri = (view) => `${LIFF_BASE}?view=${view}`;

const menuUnbound = {
  size: SIZE, selected: true, name: NAME_UNBOUND, chatBarText: '員工核銷',
  areas: [
    { bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: 'uri', label: '員工驗證', uri: uri('redeem') } },
  ],
};
const menuBound = {
  size: SIZE, selected: true, name: NAME_BOUND, chatBarText: '核銷選單',
  areas: [
    { bounds: { x: 0, y: 0, width: 834, height: 843 }, action: { type: 'uri', label: '核銷', uri: uri('redeem') } },
    { bounds: { x: 834, y: 0, width: 833, height: 843 }, action: { type: 'uri', label: '查詢券', uri: uri('lookup') } },
    { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: 'uri', label: '我的紀錄', uri: uri('my') } },
  ],
};

async function deleteExisting() {
  const { data } = await axios.get('https://api.line.me/v2/bot/richmenu/list', { headers: H, validateStatus: () => true });
  const list = data?.richmenus || [];
  for (const m of list) {
    if (m.name === NAME_UNBOUND || m.name === NAME_BOUND) {
      await axios.delete(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { headers: H, validateStatus: () => true });
      console.log(`  🗑  刪除舊選單 ${m.name} (${m.richMenuId})`);
    }
  }
}

async function createMenu(def, imgFile) {
  const create = await axios.post('https://api.line.me/v2/bot/richmenu', def, { headers: H, validateStatus: () => true });
  if (create.status !== 200 || !create.data?.richMenuId) {
    throw new Error(`建立「${def.name}」失敗：${create.status} ${JSON.stringify(create.data)}`);
  }
  const id = create.data.richMenuId;
  const img = fs.readFileSync(path.join(__dirname, 'richmenu', imgFile));
  const up = await axios.post(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, img, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' },
    maxBodyLength: Infinity, validateStatus: () => true,
  });
  if (up.status !== 200) throw new Error(`上傳「${def.name}」圖失敗：${up.status} ${JSON.stringify(up.data)}`);
  console.log(`  ✅ 建立 ${def.name}  ${id}`);
  return id;
}

(async () => {
  try {
    console.log('LIFF 連結基底：', LIFF_BASE);
    console.log('清除同名舊選單…');
    await deleteExisting();
    console.log('建立選單…');
    const unboundId = await createMenu(menuUnbound, 'menu-unbound.png');
    const boundId = await createMenu(menuBound, 'menu-bound.png');

    // 未綁定選單設為全體預設
    const setDefault = await axios.post(`https://api.line.me/v2/bot/user/all/richmenu/${unboundId}`, null, { headers: H, validateStatus: () => true });
    if (setDefault.status !== 200) throw new Error(`設定預設選單失敗：${setDefault.status} ${JSON.stringify(setDefault.data)}`);
    console.log('  ✅ 已把「未綁定」設為全體預設選單');

    console.log('\n========== 完成，請到後端 Render 設定環境變數 ==========');
    console.log('STAFF_LINE_MESSAGING_TOKEN =（你這次用的 token）');
    console.log('STAFF_RICHMENU_BOUND_ID    =', boundId);
    console.log('設好後手動 Deploy 後端即生效。之後：新加入的人看到「員工驗證」，綁定成功自動切換成核銷選單。');
  } catch (e) {
    console.error('\n💥 失敗：', e.message);
    process.exit(1);
  }
})();
