/**
 * 員工核銷站 per-user Rich Menu 切換。
 *
 * 設計原則：所有操作皆「盡力而為」——任何失敗只記 log、回傳結果物件，
 * 絕不 throw，絕不影響呼叫端（綁定/解綁）的主流程。未設定環境變數時直接跳過。
 *
 * 需要的環境變數（設在後端 Render）：
 *   STAFF_LINE_MESSAGING_TOKEN  核銷 OA 的 Messaging API channel access token
 *   STAFF_RICHMENU_BOUND_ID     「已綁定」功能選單的 richMenuId（由 setup 腳本產生）
 *
 * 預設「未綁定」選單以 setup 腳本設為全體預設（user/all）；綁定成功後把該用戶
 * 個別切到功能選單，解除綁定時取消個別選單、回到預設。
 */
const axios = require('axios');

const API = 'https://api.line.me/v2/bot';
const TIMEOUT = 8000;

const token = () => process.env.STAFF_LINE_MESSAGING_TOKEN || '';
const boundMenuId = () => process.env.STAFF_RICHMENU_BOUND_ID || '';

/**
 * 綁定成功後：把該 LINE 用戶切到「已綁定」功能選單。
 * @param {string} lineUserId
 * @returns {Promise<{ok:boolean, skipped?:boolean, status?:number, error?:string}>}
 */
async function linkBoundMenu(lineUserId) {
  const t = token();
  const menu = boundMenuId();
  if (!t || !menu || !lineUserId) return { ok: false, skipped: true };
  try {
    const resp = await axios.post(`${API}/user/${lineUserId}/richmenu/${menu}`, null, {
      headers: { Authorization: `Bearer ${t}` },
      validateStatus: () => true,
      timeout: TIMEOUT,
    });
    if (resp.status >= 200 && resp.status < 300) return { ok: true, status: resp.status };
    console.error('[StaffRichMenu] linkBoundMenu 非 2xx:', resp.status, JSON.stringify(resp.data));
    return { ok: false, status: resp.status, error: resp.data?.message };
  } catch (e) {
    console.error('[StaffRichMenu] linkBoundMenu 例外:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * 解除綁定後：取消該用戶的個別選單，回到預設（未綁定）選單。
 * @param {string} lineUserId
 * @returns {Promise<{ok:boolean, skipped?:boolean, status?:number, error?:string}>}
 */
async function unlinkMenu(lineUserId) {
  const t = token();
  if (!t || !lineUserId) return { ok: false, skipped: true };
  try {
    const resp = await axios.delete(`${API}/user/${lineUserId}/richmenu`, {
      headers: { Authorization: `Bearer ${t}` },
      validateStatus: () => true,
      timeout: TIMEOUT,
    });
    if (resp.status >= 200 && resp.status < 300) return { ok: true, status: resp.status };
    console.error('[StaffRichMenu] unlinkMenu 非 2xx:', resp.status, JSON.stringify(resp.data));
    return { ok: false, status: resp.status, error: resp.data?.message };
  } catch (e) {
    console.error('[StaffRichMenu] unlinkMenu 例外:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { linkBoundMenu, unlinkMenu };
