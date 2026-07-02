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

const DEFAULT_ISSUE_SETTINGS = {
  green_fee: { default_quantity: 10, unit_price: 200 },
  product: { default_quantity: 10, unit_price: 100 },
  packages: [
    { name: 'A 套本 $6,600', price: 6600, green_fee: 18, product: 30 },
    { name: 'B 套本 $2,800', price: 2800, green_fee: 9, product: 10 },
  ],
  validity_years: 2,
};

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

async function issueVouchers({ userId, voucherType, quantity, operatorName, validFrom, validUntil }) {
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

async function issuePackage({ userId, packageIndex, operatorName, validFrom }) {
  const settings = await getIssueSettings();
  const packages = settings.packages || DEFAULT_ISSUE_SETTINGS.packages;
  const pkg = packages[packageIndex];
  if (!pkg) throw new Error('無效的套本');

  const validityYears = settings.validity_years || 2;
  const startDate = validFrom || new Date().toISOString().slice(0, 10);
  const endDate = new Date(new Date(startDate).getTime() + validityYears * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const greenResult = await issueVouchers({
    userId, voucherType: 'green_fee', quantity: pkg.green_fee,
    operatorName, validFrom: startDate, validUntil: endDate,
  });
  const productResult = await issueVouchers({
    userId, voucherType: 'product', quantity: pkg.product,
    operatorName, validFrom: startDate, validUntil: endDate,
  });

  return {
    package: pkg,
    green_fee: { count: greenResult.vouchers.length },
    product: { count: productResult.vouchers.length },
    validFrom: startDate,
    validUntil: endDate,
  };
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
  const { data: active, error } = await supabase
    .from('vouchers')
    .select('id')
    .eq('user_id', userId)
    .eq('product_name', productName)
    .eq('status', 'active')
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
  const { data: redeemed, error } = await supabase
    .from('vouchers')
    .select('id')
    .eq('user_id', userId)
    .eq('product_name', productName)
    .eq('status', 'redeemed')
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

async function cancelAllVouchers({ userId, reason, operatorName }) {
  const { data: vouchers, error } = await supabase
    .from('vouchers')
    .select('id, product_name, status')
    .eq('user_id', userId)
    .in('product_name', ['果嶺券', '商品券'])
    .in('status', ['active', 'redeemed']);
  if (error) throw error;
  if (!vouchers || vouchers.length === 0) throw new Error('該用戶沒有可退的券');

  const ids = vouchers.map(v => v.id);
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

  const activeCount = vouchers.filter(v => v.status === 'active').length;
  const redeemedCount = vouchers.filter(v => v.status === 'redeemed').length;
  return { voided: ids.length, activeCount, redeemedCount };
}

async function getCustomerVouchers(userId) {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, display_name, phone, member_no')
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
  for (const v of all) {
    const key = v.product_name === '果嶺券' ? 'green_fee' : 'product';
    summary[key].total++;
    if (v.status === 'active') summary[key].active++;
    else if (v.status === 'redeemed') summary[key].redeemed++;
    else if (v.status === 'void') summary[key].voided++;
    if (v.valid_until && (!validUntil || v.valid_until > validUntil)) {
      validUntil = v.valid_until;
    }
  }

  return { user, summary, vouchers: all, validUntil };
}

async function updateVoucherExpiry({ userId, validUntil, operatorName, reason }) {
  if (!validUntil) throw new Error('請選擇到期日');

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
  const { error: updateError } = await supabase
    .from('vouchers')
    .update({ valid_until: validUntil })
    .in('id', ids);
  if (updateError) throw updateError;

  const logEntries = ids.map(id => ({
    voucher_id: id,
    action: 'extended',
    operator_name: operatorName,
    memo: reason || `修改到期日為 ${validUntil}`,
  }));
  await supabase.from('voucher_logs').insert(logEntries);

  return { updated: ids.length, validUntil };
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
    .select('*, vouchers!inner(code, product_name, price, user_id, users(display_name, phone))', { count: 'exact' });

  if (userId) {
    query = query.eq('vouchers.user_id', userId);
  }
  if (voucherType && VOUCHER_TYPES[voucherType]) {
    query = query.eq('vouchers.product_name', VOUCHER_TYPES[voucherType].product_name);
  }

  query = query
    .in('action', ['issued', 'redeemed', 'voided', 'reversed', 'extended'])
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
  voidVouchers,
  reverseRedeem,
  cancelAllVouchers,
  getCustomerVouchers,
  updateVoucherExpiry,
  getPaperVoucherExpiry,
  searchUsers,
  getHistory,
  issuePackage,
  getLastPurchaseDate,
};
