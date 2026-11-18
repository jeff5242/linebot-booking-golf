'use strict';

/**
 * 會員身分變更：白金會員停權後買 B 套本＝加入金卡會員。
 *
 * - 停權判斷與前端 VoucherOpsPanel PackageIssueSection 一致：
 *   上次購買日 + EXPIRY_MONTHS（13）個月過期，再 + GRACE_MONTHS（2）個月寬限，之後即停權。
 * - 停權的白金會員發 B 套本時，golfer_type 自動改為「金卡會員」（影響預約價格）。
 * - 每次變更留紀錄：system_settings.key='member_tier_changes'
 *   結構：{ [userId]: [{ from, to, phone, operator, reason, at }, ...] }
 * - 有紀錄的會員：Google 試算表同步（scripts/syncUsers.js）不再覆蓋其會員身分。
 */

const UserSettingsLog = require('./UserSettingsLog');

const { sb } = UserSettingsLog;
const LOG_KEY = 'member_tier_changes';
const EXPIRY_MONTHS = 13;
const GRACE_MONTHS = 2;
const PLATINUM = '白金會員';
const GOLD = '金卡會員';
// 停權會員可買的套本（B 套本 $2,800＝金卡方案），須與前端 VoucherOpsPanel 的 LAPSED_ALLOWED_PACKAGE_INDEX 一致
const GOLD_PACKAGE_INDEX = 1;

/** 日期加 N 個月（與前端 addMonths 相同語意） */
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** 依上次購買日判斷是否已停權（寬限期已過）。沒有購買紀錄＝不算停權 */
function isLapsed(lastPurchaseDate, now = new Date()) {
  if (!lastPurchaseDate) return false;
  const last = new Date(lastPurchaseDate);
  if (Number.isNaN(last.getTime())) return false;
  return now >= addMonths(last, EXPIRY_MONTHS + GRACE_MONTHS);
}

/** 停權會員是否可以買這個套本 */
function isPackageAllowedWhenLapsed(packageIndex) {
  return Number(packageIndex) === GOLD_PACKAGE_INDEX;
}

/**
 * 發套本時要不要改會員身分（純函式）。
 * @returns {{ from: string, to: string } | null}
 */
function planTierChange({ packageIndex, golferType, lastPurchaseDate, now = new Date() }) {
  if (!isPackageAllowedWhenLapsed(packageIndex)) return null;
  if (golferType !== PLATINUM) return null;
  if (!isLapsed(lastPurchaseDate, now)) return null;
  return { from: PLATINUM, to: GOLD };
}

/**
 * 改會員身分並留紀錄。只在身分仍是 from 時才改（避免蓋掉別人同時做的修改）。
 * 紀錄寫入失敗時把身分改回原值，確保「改了就一定有紀錄、同步不會蓋掉」。
 * @returns {Promise<{ changed: boolean, entry?: object }>}
 */
async function applyTierChange({ userId, from, to, operator, reason }) {
  const { data: updated, error } = await sb().from('users')
    .update({ golfer_type: to })
    .eq('id', userId).eq('golfer_type', from)
    .select('id, phone');
  if (error) throw error;
  if (!updated || !updated.length) return { changed: false };

  const entry = {
    from,
    to,
    phone: updated[0].phone,
    operator: operator || '未知',
    reason: reason || '',
    at: new Date().toISOString(),
  };
  try {
    await UserSettingsLog.saveEntry(LOG_KEY, userId, entry);
  } catch (logErr) {
    console.error('[MemberTierChange] 紀錄寫入失敗，身分改回原值:', logErr);
    await sb().from('users').update({ golfer_type: from }).eq('id', userId).eq('golfer_type', to);
    throw new Error('會員身分紀錄寫入失敗，身分未變更');
  }
  return { changed: true, entry };
}

const getTierLog = () => UserSettingsLog.getLog(LOG_KEY);

/** 系統內改過身分的會員電話（同步時不覆蓋這些人的會員身分） */
const getTierLockedPhones = () => UserSettingsLog.getLockedPhones(LOG_KEY);

module.exports = {
  LOG_KEY, EXPIRY_MONTHS, GRACE_MONTHS, PLATINUM, GOLD, GOLD_PACKAGE_INDEX,
  isLapsed, isPackageAllowedWhenLapsed, planTierChange,
  applyTierChange, getTierLog, getTierLockedPhones,
};
