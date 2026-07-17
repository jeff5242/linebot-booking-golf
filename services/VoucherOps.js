'use strict';

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const VOUCHER_TYPES = {
  green_fee: { product_name: '果嶺券', default_price: 200 },
  product: { product_name: '商品券', default_price: 100 },
};

const SETTINGS_KEY = 'voucher_issue_settings';

// 會員轉贈功能開關設定
const TRANSFER_CONFIG_KEY = 'voucher_transfer_config';
const TRANSFER_MODES = ['off', 'test', 'on']; // 關閉 / 僅測試人員 / 開放全部會員
// 預設：僅測試人員可用，公開端關閉（一上線不會直接對全體開放）
const DEFAULT_TRANSFER_CONFIG = { mode: 'test', testPhones: ['0936923912'] };

/** 手機號正規化：去非數字 */
function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

// 套本可續約的最短間隔（距上次購買起算），與前端 PackageIssueSection 一致
const MIN_RENEWAL_MONTHS = 9;

const DEFAULT_ISSUE_SETTINGS = {
  green_fee: { default_quantity: 10, unit_price: 200 },
  product: { default_quantity: 10, unit_price: 100 },
  packages: [
    { name: 'A 套本 $6,600', price: 6600, green_fee: 18, product: 30 },
    { name: 'B 套本 $2,800', price: 2800, green_fee: 9, product: 10 },
  ],
  validity_years: 1,
};

/** 日期字串加 N 年，回傳 YYYY-MM-DD */
function addYears(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** 取得客戶目前 active 的套本（最多一筆），無則回 null */
async function getActivePackage(userId) {
  const { data, error } = await supabase
    .from('voucher_packages')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

/**
 * 判斷 active 套本是否已到可續約期（距 valid_from 起算滿 MIN_RENEWAL_MONTHS 個月）
 * @returns {{ ok: boolean, reason?: string, renewableDate?: string }}
 */
function isRenewalEligible(activePkg) {
  const basis = activePkg.valid_from || activePkg.created_at;
  if (!basis) return { ok: true };
  const renewable = new Date(basis);
  renewable.setMonth(renewable.getMonth() + MIN_RENEWAL_MONTHS);
  const renewableDate = renewable.toISOString().slice(0, 10);
  if (new Date() < renewable) {
    return { ok: false, reason: `尚未到續約期（可續約日 ${renewableDate}）`, renewableDate };
  }
  return { ok: true, renewableDate };
}

/**
 * 取得客戶的套本購買狀態（給前端判斷可否發套本 / 是否續約 / 建議起始日）
 */
async function getPackageStatus(userId) {
  const active = await getActivePackage(userId);
  if (!active) {
    return {
      hasActive: false,
      canIssue: true,
      isRenewal: false,
      suggestedStartDate: new Date().toISOString().slice(0, 10),
    };
  }
  const eligible = isRenewalEligible(active);
  return {
    hasActive: true,
    activePackage: {
      package_name: active.package_name,
      valid_from: active.valid_from,
      valid_until: active.valid_until,
    },
    canIssue: eligible.ok,
    isRenewal: eligible.ok,
    reason: eligible.ok ? null : eligible.reason,
    renewableDate: eligible.renewableDate,
    suggestedStartDate: eligible.ok
      ? (active.valid_until || new Date().toISOString().slice(0, 10))
      : null,
  };
}

function generateCode(voucherType) {
  const prefix = voucherType === 'green_fee' ? 'GF' : 'PD';
  const hash = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${hash}`;
}

async function getIssueSettings() {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  return data?.value || DEFAULT_ISSUE_SETTINGS;
}

async function updateIssueSettings(settings) {
  const { data, error } = await supabase
    .from('system_settings')
    .upsert({ key: SETTINGS_KEY, value: settings, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data.value;
}

/** 取得轉贈功能設定（含預設合併） */
async function getTransferConfig() {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', TRANSFER_CONFIG_KEY)
    .maybeSingle();
  const saved = data?.value || {};
  const mode = TRANSFER_MODES.includes(saved.mode) ? saved.mode : DEFAULT_TRANSFER_CONFIG.mode;
  const testPhones = Array.isArray(saved.testPhones) ? saved.testPhones : DEFAULT_TRANSFER_CONFIG.testPhones;
  return { mode, testPhones };
}

/** 更新轉贈功能設定（驗證 mode、正規化並去重手機清單） */
async function updateTransferConfig(config) {
  const mode = TRANSFER_MODES.includes(config?.mode) ? config.mode : 'off';
  const rawPhones = Array.isArray(config?.testPhones) ? config.testPhones : [];
  const testPhones = [...new Set(
    rawPhones.map(normalizePhone).filter(p => /^09\d{8}$/.test(p))
  )];
  const value = { mode, testPhones };
  const { data, error } = await supabase
    .from('system_settings')
    .upsert({ key: TRANSFER_CONFIG_KEY, value, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data.value;
}

/** 依設定判斷某手機是否可使用轉贈功能 */
function isTransferAllowed(config, phone) {
  if (!config || config.mode === 'off') return false;
  if (config.mode === 'on') return true;
  // test 模式：僅清單內手機
  return (config.testPhones || []).includes(normalizePhone(phone));
}

async function issueVouchers({ userId, voucherType, quantity, operatorName, validFrom, validUntil, invoiceNumber }) {
  if (!VOUCHER_TYPES[voucherType]) {
    throw new Error('無效的券種');
  }
  if (!quantity || quantity < 1 || quantity > 200) {
    throw new Error('張數必須在 1-200 之間');
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, display_name, phone')
    .eq('id', userId)
    .single();
  if (userError || !user) throw new Error('找不到該用戶');

  const settings = await getIssueSettings();
  const typeSettings = settings[voucherType] || {};
  const unitPrice = typeSettings.unit_price || VOUCHER_TYPES[voucherType].default_price;
  const productName = VOUCHER_TYPES[voucherType].product_name;

  const vouchers = [];
  for (let i = 0; i < quantity; i++) {
    const row = {
      code: generateCode(voucherType),
      product_id: 0,
      product_name: productName,
      user_id: userId,
      status: 'active',
      source_type: 'digital_purchase',
      price: unitPrice,
      purchase_date: new Date().toISOString().slice(0, 10),
    };
    if (validFrom) row.valid_from = validFrom;
    if (validUntil) row.valid_until = validUntil;
    if (invoiceNumber) row.invoice_number = invoiceNumber;
    vouchers.push(row);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('vouchers')
    .insert(vouchers)
    .select();
  if (insertError) throw insertError;

  const logEntries = inserted.map(v => ({
    voucher_id: v.id,
    action: 'issued',
    operator_name: operatorName,
    memo: `櫃檯發券 ${productName} x1 (${user.display_name || user.phone})`,
  }));
  await supabase.from('voucher_logs').insert(logEntries);

  return { vouchers: inserted, user };
}

async function issuePackage({ userId, packageIndex, operatorName, validFrom, invoiceNumber }) {
  const settings = await getIssueSettings();
  const packages = settings.packages || DEFAULT_ISSUE_SETTINGS.packages;
  const pkg = packages[packageIndex];
  if (!pkg) throw new Error('無效的套本');

  // 電子發票號碼必填（賣套本時輸入，蓋到本次每張券上供對帳）
  const invoice = String(invoiceNumber || '').trim();
  if (!invoice) throw new Error('請輸入電子發票號碼');

  const validityYears = settings.validity_years || 1;
  const today = new Date().toISOString().slice(0, 10);

  // 檢查是否已有 active 套本：擋重複購買，或判斷為續約
  const active = await getActivePackage(userId);
  let startDate;
  let isRenewal = false;
  if (active) {
    const eligible = isRenewalEligible(active);
    if (!eligible.ok) {
      throw new Error(`客戶已購買套本「${active.package_name}」，${eligible.reason}。如需更換請先全部退券。`);
    }
    // 續約：新券從舊套本到期日起算；若舊券已過期則改從今天起算，避免新券一發即過期
    isRenewal = true;
    startDate = (active.valid_until && active.valid_until > today) ? active.valid_until : today;
  } else {
    startDate = validFrom || today;
  }
  const endDate = addYears(startDate, validityYears);

  // 續約時先釋放舊 active 名額（配合 partial unique index），失敗即中止
  if (active) {
    const { error: renewErr } = await supabase
      .from('voucher_packages')
      .update({ status: 'renewed' })
      .eq('id', active.id)
      .eq('status', 'active');
    if (renewErr) throw renewErr;
  }

  // 先佔用套本名額（在發券之前）：靠 partial unique index 擋併發/重複點擊。
  // 若此步失敗代表已有 active 套本，此時尚未發任何券，不會產生孤兒券。
  const { data: pkgRow, error: pkgErr } = await supabase
    .from('voucher_packages')
    .insert({
      user_id: userId,
      package_index: packageIndex,
      package_name: pkg.name,
      price: pkg.price || 0,
      green_fee_count: pkg.green_fee,
      product_count: pkg.product,
      valid_from: startDate,
      valid_until: endDate,
      is_renewal: isRenewal,
      status: 'active',
      operator_name: operatorName,
    })
    .select()
    .single();
  if (pkgErr) {
    // 佔位失敗：若剛把舊套本改成 renewed，補償還原成 active
    if (active) {
      await supabase.from('voucher_packages').update({ status: 'active' }).eq('id', active.id);
    }
    throw new Error('已有進行中的套本或發券衝突，請重新整理後再試');
  }

  // 佔位成功才真正發券；發券失敗則補償刪除本次套本紀錄並還原舊套本
  try {
    const greenResult = await issueVouchers({
      userId, voucherType: 'green_fee', quantity: pkg.green_fee,
      operatorName, validFrom: startDate, validUntil: endDate, invoiceNumber: invoice,
    });
    const productResult = await issueVouchers({
      userId, voucherType: 'product', quantity: pkg.product,
      operatorName, validFrom: startDate, validUntil: endDate, invoiceNumber: invoice,
    });

    return {
      package: pkg,
      green_fee: { count: greenResult.vouchers.length },
      product: { count: productResult.vouchers.length },
      validFrom: startDate,
      validUntil: endDate,
      isRenewal,
    };
  } catch (err) {
    await supabase.from('voucher_packages').delete().eq('id', pkgRow.id);
    if (active) {
      await supabase.from('voucher_packages').update({ status: 'active' }).eq('id', active.id);
    }
    throw err;
  }
}

async function getLastPurchaseDate(userId) {
  const { data } = await supabase
    .from('vouchers')
    .select('purchase_date')
    .eq('user_id', userId)
    .not('purchase_date', 'is', null)
    .order('purchase_date', { ascending: false })
    .limit(1);
  return data?.[0]?.purchase_date || null;
}

async function redeemVouchers({ userId, voucherType, quantity, operatorName }) {
  if (!VOUCHER_TYPES[voucherType]) {
    throw new Error('無效的券種');
  }
  if (!quantity || quantity < 1) throw new Error('請輸入使用張數');

  const productName = VOUCHER_TYPES[voucherType].product_name;
  // 只操作線上電子票券，紙券轉入的走實體紙券流程（與 getCustomerVouchers 顯示邏輯一致）
  const { data: active, error } = await supabase
    .from('vouchers')
    .select('id')
    .eq('user_id', userId)
    .eq('product_name', productName)
    .eq('status', 'active')
    .neq('source_type', 'paper_converted')
    .order('created_at', { ascending: true })
    .limit(quantity);
  if (error) throw error;
  if (!active || active.length < quantity) {
    throw new Error(`可用${productName}不足，目前僅剩 ${active?.length || 0} 張`);
  }
  const toRedeem = active.map(v => v.id);

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('vouchers')
    .update({ status: 'redeemed', redeemed_at: now, redeemed_by: operatorName })
    .in('id', toRedeem);
  if (updateError) throw updateError;

  const logEntries = toRedeem.map(id => ({
    voucher_id: id,
    action: 'redeemed',
    operator_name: operatorName,
    memo: `櫃檯核銷 ${VOUCHER_TYPES[voucherType].product_name}`,
  }));
  await supabase.from('voucher_logs').insert(logEntries);

  return { redeemed: toRedeem.length };
}

/**
 * 現場掃碼核銷單張券（依 voucher id）。
 * 依券種控管：果嶺券需 allowGreenFee 為 true（呼叫端依操作者權限帶入）。
 * 記錄真正的操作人，供對帳追溯。
 */
async function scanRedeemVoucher({ voucherId, operatorName, allowGreenFee }) {
  if (!voucherId) throw new Error('缺少票券 id');

  const { data: voucher, error: fetchErr } = await supabase
    .from('vouchers')
    .select('id, code, product_name, price, status, user_id')
    .eq('id', voucherId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!voucher) throw new Error('找不到此票券');
  if (voucher.status !== 'active') throw new Error('此票券非可用狀態，無法核銷');

  // 券種控管：果嶺券只有具權限者（發球台/管理）能核
  if (voucher.product_name === '果嶺券' && !allowGreenFee) {
    throw new Error('此帳號無果嶺券核銷權限，果嶺券僅限發球台核銷');
  }

  // 條件式更新（status 仍為 active 才更新），避免併發重複核銷
  const { data: updated, error: updErr } = await supabase
    .from('vouchers')
    .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
    .eq('id', voucherId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (updErr) throw updErr;
  if (!updated) throw new Error('此票券已被核銷或狀態已變更');

  await supabase.from('voucher_logs').insert([{
    voucher_id: voucherId,
    action: 'redeemed',
    operator_name: operatorName || 'Admin',
    memo: `現場掃碼核銷 ${voucher.product_name}`,
  }]);

  return { redeemed: 1, code: voucher.code, productName: voucher.product_name, price: voucher.price };
}

async function voidVouchers({ voucherIds, reason, operatorName }) {
  if (!voucherIds || voucherIds.length === 0) throw new Error('請選擇要作廢的券');

  const { data: updated, error } = await supabase
    .from('vouchers')
    .update({ status: 'void' })
    .in('id', voucherIds)
    .in('status', ['active', 'redeemed'])
    .select('id');
  if (error) throw error;

  const voidedIds = (updated || []).map(v => v.id);
  if (voidedIds.length > 0) {
    const logEntries = voidedIds.map(id => ({
      voucher_id: id,
      action: 'voided',
      operator_name: operatorName,
      memo: reason || '作廢',
    }));
    await supabase.from('voucher_logs').insert(logEntries);
  }

  return { voided: voidedIds.length };
}

async function reverseRedeem({ userId, voucherType, quantity, operatorName, reason }) {
  if (!VOUCHER_TYPES[voucherType]) throw new Error('無效的券種');
  if (!quantity || quantity < 1) throw new Error('請輸入張數');

  const productName = VOUCHER_TYPES[voucherType].product_name;
  // 只操作線上電子票券，紙券轉入的走實體紙券流程（與 getCustomerVouchers 顯示邏輯一致）
  const { data: redeemed, error } = await supabase
    .from('vouchers')
    .select('id')
    .eq('user_id', userId)
    .eq('product_name', productName)
    .eq('status', 'redeemed')
    .neq('source_type', 'paper_converted')
    .order('redeemed_at', { ascending: false })
    .limit(quantity);
  if (error) throw error;
  if (!redeemed || redeemed.length < quantity) {
    throw new Error(`已核銷的${productName}不足，目前僅有 ${redeemed?.length || 0} 張`);
  }

  const toReverse = redeemed.map(v => v.id);
  const { error: updateError } = await supabase
    .from('vouchers')
    .update({ status: 'active', redeemed_at: null, redeemed_by: null })
    .in('id', toReverse);
  if (updateError) throw updateError;

  const logEntries = toReverse.map(id => ({
    voucher_id: id,
    action: 'reversed',
    operator_name: operatorName,
    memo: reason || `撤銷核銷 ${productName}`,
  }));
  await supabase.from('voucher_logs').insert(logEntries);

  return { reversed: toReverse.length };
}

/**
 * 會員自轉：把 fromUserId 名下未使用的電子券，轉 quantity 張某券種給手機號為 toPhone 的會員。
 * 只轉 status=active 且 source_type=digital_purchase（與會員端顯示一致，排除紙券轉入）。
 * 不影響 voucher_packages。每次轉贈寫入 voucher_transfers 供追蹤來源。
 */
async function transferVouchers({ fromUserId, toPhone, voucherType, quantity }) {
  if (!VOUCHER_TYPES[voucherType]) throw new Error('無效的券種');
  const qty = parseInt(quantity, 10);
  if (!qty || qty < 1) throw new Error('請輸入轉贈張數');
  if (qty > 100) throw new Error('單次轉贈上限 100 張');
  const cleanPhone = String(toPhone || '').replace(/[^0-9]/g, '');
  if (!/^09\d{8}$/.test(cleanPhone)) throw new Error('請輸入正確的對方手機號碼');

  const productName = VOUCHER_TYPES[voucherType].product_name;

  // 來源會員
  const { data: fromUser, error: fromErr } = await supabase
    .from('users')
    .select('id, display_name, phone')
    .eq('id', fromUserId)
    .maybeSingle();
  if (fromErr || !fromUser) throw new Error('找不到會員資料');

  // 轉贈功能開關（後端強制，不信任前端）
  const transferConfig = await getTransferConfig();
  if (!isTransferAllowed(transferConfig, fromUser.phone)) {
    if (transferConfig.mode === 'test') throw new Error('轉贈功能目前僅開放測試人員使用');
    throw new Error('轉贈功能尚未開放');
  }

  if (cleanPhone === fromUser.phone) throw new Error('不能轉贈給自己');

  // 收禮會員（依手機號）
  const { data: toUser, error: toErr } = await supabase
    .from('users')
    .select('id, display_name, phone')
    .eq('phone', cleanPhone)
    .maybeSingle();
  if (toErr) throw toErr;
  if (!toUser) throw new Error('查無此手機號碼的會員，請對方先完成 LINE 登錄綁定後再轉贈');
  if (toUser.id === fromUser.id) throw new Error('不能轉贈給自己');

  // 原子性轉贈：鎖券 → 改綁 → 寫紀錄 → 寫 log 全在同一交易（避免併發超轉/孤兒轉贈）
  const { data, error } = await supabase.rpc('transfer_member_vouchers', {
    p_from_user: fromUser.id,
    p_to_user: toUser.id,
    p_voucher_type: voucherType,
    p_product_name: productName,
    p_qty: qty,
    p_from_name: fromUser.display_name,
    p_from_phone: fromUser.phone,
    p_to_name: toUser.display_name,
    p_to_phone: toUser.phone,
  });
  if (error) {
    if (error.message && error.message.includes('INSUFFICIENT')) {
      const have = (error.message.split('INSUFFICIENT:')[1] || '0').trim();
      throw new Error(`可轉贈的${productName}不足，目前僅有 ${have} 張`);
    }
    throw error;
  }

  return {
    transferred: data?.transferred ?? qty,
    productName,
    to: { name: toUser.display_name, phone: toUser.phone },
  };
}

async function cancelAllVouchers({ userId, reason, operatorName }) {
  // 只退線上電子票券，紙券轉入的走實體紙券流程（與 getCustomerVouchers 顯示邏輯一致）
  const { data: vouchers, error } = await supabase
    .from('vouchers')
    .select('id, product_name, status')
    .eq('user_id', userId)
    .in('product_name', ['果嶺券', '商品券'])
    .neq('source_type', 'paper_converted')
    .in('status', ['active', 'redeemed']);
  if (error) throw error;

  // 先解除套本綁定（不論有無可退券都要做，避免套本卡在 active 無法再購買）
  const { data: cancelledPkgs } = await supabase
    .from('voucher_packages')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active')
    .select('id');
  const packagesReleased = (cancelledPkgs || []).length;

  const ids = (vouchers || []).map(v => v.id);
  // 沒有可退券、也沒有套本可解除 → 視為無效操作
  if (ids.length === 0 && packagesReleased === 0) {
    throw new Error('該用戶沒有可退的券');
  }

  if (ids.length > 0) {
    const { error: updateError } = await supabase
      .from('vouchers')
      .update({ status: 'void' })
      .in('id', ids);
    if (updateError) throw updateError;

    const logEntries = ids.map(id => ({
      voucher_id: id,
      action: 'voided',
      operator_name: operatorName,
      memo: reason || '全部退券',
    }));
    await supabase.from('voucher_logs').insert(logEntries);
  }

  const activeCount = (vouchers || []).filter(v => v.status === 'active').length;
  const redeemedCount = (vouchers || []).filter(v => v.status === 'redeemed').length;
  return { voided: ids.length, activeCount, redeemedCount, packagesReleased };
}

async function getCustomerVouchers(userId) {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, display_name, phone, member_no, member_valid_until')
    .eq('id', userId)
    .single();
  if (userError || !user) throw new Error('找不到該用戶');

  const { data: vouchers, error } = await supabase
    .from('vouchers')
    .select('id, code, product_name, price, status, source_type, valid_from, valid_until, created_at, redeemed_at, redeemed_by')
    .eq('user_id', userId)
    .in('product_name', ['果嶺券', '商品券'])
    .neq('source_type', 'paper_converted')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const all = vouchers || [];
  const summary = {
    green_fee: { active: 0, redeemed: 0, voided: 0, total: 0 },
    product: { active: 0, redeemed: 0, voided: 0, total: 0 },
  };
  let validUntil = null;
  let validFrom = null;
  for (const v of all) {
    const key = v.product_name === '果嶺券' ? 'green_fee' : 'product';
    summary[key].total++;
    if (v.status === 'active') summary[key].active++;
    else if (v.status === 'redeemed') summary[key].redeemed++;
    else if (v.status === 'void') summary[key].voided++;
    if (v.status !== 'void') {
      if (v.valid_until && (!validUntil || v.valid_until > validUntil)) validUntil = v.valid_until;
      if (v.valid_from && (!validFrom || v.valid_from < validFrom)) validFrom = v.valid_from;
    }
  }

  return { user, summary, vouchers: all, validUntil, validFrom };
}

async function updateVoucherExpiry({ userId, validFrom, validUntil, operatorName, reason }) {
  if (!validFrom && !validUntil) throw new Error('請至少選擇啟用日或到期日');
  // 兩者都給時，啟用日不可晚於到期日（只比對日期部分）
  if (validFrom && validUntil && String(validFrom).slice(0, 10) > String(validUntil).slice(0, 10)) {
    throw new Error('啟用日不可晚於到期日');
  }

  const { data: vouchers, error } = await supabase
    .from('vouchers')
    .select('id')
    .eq('user_id', userId)
    .in('product_name', ['果嶺券', '商品券'])
    .neq('source_type', 'paper_converted')
    .in('status', ['active', 'redeemed']);
  if (error) throw error;
  if (!vouchers || vouchers.length === 0) throw new Error('該用戶沒有可修改的券');

  const ids = vouchers.map(v => v.id);
  const patch = {};
  if (validFrom) patch.valid_from = validFrom;
  if (validUntil) patch.valid_until = validUntil;

  const { error: updateError } = await supabase
    .from('vouchers')
    .update(patch)
    .in('id', ids);
  if (updateError) throw updateError;

  const changes = [];
  if (validFrom) changes.push(`啟用日→${String(validFrom).slice(0, 10)}`);
  if (validUntil) changes.push(`到期日→${String(validUntil).slice(0, 10)}`);
  const logEntries = ids.map(id => ({
    voucher_id: id,
    action: 'extended',
    operator_name: operatorName,
    memo: reason || `修改效期（${changes.join('、')}）`,
  }));
  await supabase.from('voucher_logs').insert(logEntries);

  return { updated: ids.length, validFrom, validUntil };
}

// 手動修改會員有效期限（後台櫃檯用）。輸入西元 YYYY-MM-DD，存成民國字串 0YYY-MM-DD（與現有資料一致）。
async function updateMemberExpiry({ userId, validUntil, operatorName }) {
  const iso = String(validUntil || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('請選擇正確的到期日');
  const [y, m, d] = iso.split('-');
  const rocYear = Number(y) - 1911;
  if (rocYear < 1 || rocYear > 999) throw new Error('年份超出範圍');
  const rocStr = `${String(rocYear).padStart(4, '0')}-${m}-${d}`;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, display_name, member_valid_until')
    .eq('id', userId)
    .single();
  if (error || !user) throw new Error('找不到該用戶');

  const { error: upErr } = await supabase
    .from('users')
    .update({ member_valid_until: rocStr })
    .eq('id', userId);
  if (upErr) throw upErr;

  return { member_valid_until: rocStr, previous: user.member_valid_until || null, operatorName: operatorName || 'Admin' };
}

async function getPaperVoucherExpiry(userId) {
  const { data } = await supabase
    .from('vouchers')
    .select('valid_until')
    .eq('user_id', userId)
    .eq('source_type', 'paper_converted')
    .not('valid_until', 'is', null)
    .order('valid_until', { ascending: false })
    .limit(1);
  return data?.[0]?.valid_until || null;
}

async function searchUsers(query) {
  if (!query || query.trim().length < 1) return [];
  const q = query.trim();

  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, phone, member_no')
    .or(`display_name.ilike.%${q}%,phone.ilike.%${q}%,member_no.ilike.%${q}%`)
    .order('display_name')
    .limit(20);
  if (error) throw error;
  return data || [];
}

async function getHistory({ userId, voucherType, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  let query = supabase
    .from('voucher_logs')
    .select('*, vouchers!inner(code, product_name, price, user_id, invoice_number, users(display_name, phone))', { count: 'exact' });

  if (userId) {
    query = query.eq('vouchers.user_id', userId);
  }
  if (voucherType && VOUCHER_TYPES[voucherType]) {
    query = query.eq('vouchers.product_name', VOUCHER_TYPES[voucherType].product_name);
  }

  query = query
    .in('action', ['issued', 'redeemed', 'voided', 'reversed', 'extended', 'transferred'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return { logs: data || [], total: count || 0 };
}

module.exports = {
  getIssueSettings,
  updateIssueSettings,
  issueVouchers,
  redeemVouchers,
  scanRedeemVoucher,
  voidVouchers,
  reverseRedeem,
  cancelAllVouchers,
  getCustomerVouchers,
  updateVoucherExpiry,
  updateMemberExpiry,
  getPaperVoucherExpiry,
  searchUsers,
  getHistory,
  issuePackage,
  getLastPurchaseDate,
  getPackageStatus,
  transferVouchers,
  getTransferConfig,
  updateTransferConfig,
  isTransferAllowed,
};
