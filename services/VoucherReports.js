'use strict';

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const PRODUCT_NAMES = ['果嶺券', '商品券'];

// PostgREST 單次查詢預設上限 1000 筆；對帳明細不可截斷，故分頁撈完整。
// buildQuery: 每次呼叫回傳一個「尚未加 range」的 query builder（含 select/filter/order）。
const PAGE_SIZE = 1000;
async function fetchAllRows(buildQuery) {
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function getSalesReport({ startDate, endDate, voucherType, userId }) {
  const buildQuery = () => {
    let query = supabase
      .from('voucher_logs')
      .select('id, action, created_at, operator_name, memo, vouchers!inner(id, code, product_name, price, user_id, source_type, valid_from, valid_until, users!inner(display_name, phone, member_no))')
      .eq('action', 'issued')
      .in('vouchers.product_name', PRODUCT_NAMES)
      .eq('vouchers.source_type', 'digital_purchase')
      .order('created_at', { ascending: false });

    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
    if (voucherType === 'green_fee') query = query.eq('vouchers.product_name', '果嶺券');
    if (voucherType === 'product') query = query.eq('vouchers.product_name', '商品券');
    if (userId) query = query.eq('vouchers.user_id', userId);
    return query;
  };

  const logs = await fetchAllRows(buildQuery);

  const grouped = {};
  for (const log of logs) {
    const v = log.vouchers;
    const key = `${v.user_id}_${v.product_name}_${log.created_at.slice(0, 10)}`;
    if (!grouped[key]) {
      grouped[key] = {
        date: log.created_at.slice(0, 10),
        customer_name: v.users.display_name || '',
        phone: v.users.phone || '',
        member_no: v.users.member_no || '',
        product_name: v.product_name,
        unit_price: v.price,
        quantity: 0,
        total_amount: 0,
        valid_from: v.valid_from,
        valid_until: v.valid_until,
        operator_name: log.operator_name || '',
      };
    }
    grouped[key].quantity += 1;
    grouped[key].total_amount += v.price;
  }

  const rows = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));

  const summary = {
    totalRecords: rows.length,
    totalQuantity: rows.reduce((s, r) => s + r.quantity, 0),
    totalAmount: rows.reduce((s, r) => s + r.total_amount, 0),
    greenFeeQty: rows.filter(r => r.product_name === '果嶺券').reduce((s, r) => s + r.quantity, 0),
    productQty: rows.filter(r => r.product_name === '商品券').reduce((s, r) => s + r.quantity, 0),
  };

  return { rows, summary };
}

async function getRedemptionReport({ startDate, endDate, granularity = 'daily' }) {
  const buildQuery = () => {
    let query = supabase
      .from('voucher_logs')
      .select('id, action, created_at, operator_name, vouchers!inner(id, product_name, price, source_type)')
      .eq('action', 'redeemed')
      .in('vouchers.product_name', PRODUCT_NAMES)
      .eq('vouchers.source_type', 'digital_purchase')
      .order('created_at', { ascending: true });

    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
    return query;
  };

  const logs = await fetchAllRows(buildQuery);

  const buckets = {};
  for (const log of logs) {
    const dt = log.created_at.slice(0, 10);
    let key;
    if (granularity === 'yearly') key = dt.slice(0, 4);
    else if (granularity === 'monthly') key = dt.slice(0, 7);
    else key = dt;

    if (!buckets[key]) {
      buckets[key] = { period: key, green_fee_qty: 0, green_fee_amount: 0, product_qty: 0, product_amount: 0, total_qty: 0, total_amount: 0 };
    }

    const b = buckets[key];
    const v = log.vouchers;
    if (v.product_name === '果嶺券') {
      b.green_fee_qty += 1;
      b.green_fee_amount += v.price;
    } else {
      b.product_qty += 1;
      b.product_amount += v.price;
    }
    b.total_qty += 1;
    b.total_amount += v.price;
  }

  const rows = Object.values(buckets).sort((a, b) =>
    granularity === 'daily' ? b.period.localeCompare(a.period) : a.period.localeCompare(b.period)
  );

  const summary = {
    totalQuantity: logs.length,
    totalAmount: logs.reduce((s, l) => s + (l.vouchers?.price || 0), 0),
    greenFeeQty: logs.filter(l => l.vouchers?.product_name === '果嶺券').length,
    productQty: logs.filter(l => l.vouchers?.product_name === '商品券').length,
  };

  return { rows, summary, granularity };
}

// 逐張銷售明細（會計對帳用）：每張售出的電子券一列，含卷號
async function getSalesDetailReport({ startDate, endDate, voucherType, userId }) {
  const buildQuery = () => {
    let query = supabase
      .from('voucher_logs')
      .select('id, created_at, operator_name, vouchers!inner(id, code, product_name, price, user_id, source_type, valid_from, valid_until, invoice_number, users!inner(display_name, phone, member_no))')
      .eq('action', 'issued')
      .in('vouchers.product_name', PRODUCT_NAMES)
      .eq('vouchers.source_type', 'digital_purchase')
      .order('created_at', { ascending: true });

    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
    if (voucherType === 'green_fee') query = query.eq('vouchers.product_name', '果嶺券');
    if (voucherType === 'product') query = query.eq('vouchers.product_name', '商品券');
    if (userId) query = query.eq('vouchers.user_id', userId);
    return query;
  };

  const data = await fetchAllRows(buildQuery);

  const rows = data.map(log => {
    const v = log.vouchers;
    return {
      sold_at: log.created_at,
      code: v.code,
      product_name: v.product_name,
      price: v.price,
      invoice_number: v.invoice_number || '',
      customer_name: v.users.display_name || '',
      phone: v.users.phone || '',
      member_no: v.users.member_no || '',
      valid_from: v.valid_from,
      valid_until: v.valid_until,
      operator_name: log.operator_name || '',
    };
  });

  const summary = {
    totalCount: rows.length,
    totalAmount: rows.reduce((s, r) => s + (r.price || 0), 0),
    greenFeeCount: rows.filter(r => r.product_name === '果嶺券').length,
    productCount: rows.filter(r => r.product_name === '商品券').length,
  };

  return { rows, summary };
}

// 銷售交易列表：以「一筆套票交易」為單位（一張電子發票=一筆；舊資料無發票號則以「客戶+效期起訖」歸類）。
// 每筆含核銷進度（發券↔用券關聯）與逐張明細供展開。
async function getSalesTransactions({ startDate, endDate, page = 1, limit = 15, missingInvoice = false }) {
  const buildQuery = () => supabase
    .from('vouchers')
    .select('id, code, product_name, price, status, valid_from, valid_until, invoice_number, user_id, created_at, redeemed_at, users(display_name, phone, member_no)')
    .in('product_name', PRODUCT_NAMES)
    .eq('source_type', 'digital_purchase')
    .in('status', ['active', 'redeemed'])
    .order('created_at', { ascending: false });

  const vouchers = await fetchAllRows(buildQuery);

  const groups = {};
  for (const v of vouchers) {
    const vf = (v.valid_from || '').slice(0, 10);
    const vu = (v.valid_until || '').slice(0, 10);
    const key = v.invoice_number ? `inv:${v.invoice_number}` : `pkg:${v.user_id}:${vf}:${vu}`;
    if (!groups[key]) {
      groups[key] = {
        key,
        invoice_number: v.invoice_number || '',
        user_id: v.user_id,
        customer_name: v.users?.display_name || '',
        phone: v.users?.phone || '',
        member_no: v.users?.member_no || '',
        sale_time: v.created_at,
        valid_from: vf,
        valid_until: vu,
        green_fee_total: 0, green_fee_redeemed: 0,
        product_total: 0, product_redeemed: 0,
        amount: 0,
        vouchers: [],
      };
    }
    const t = groups[key];
    if (v.created_at < t.sale_time) t.sale_time = v.created_at;
    const isGreen = v.product_name === '果嶺券';
    if (isGreen) { t.green_fee_total += 1; if (v.status === 'redeemed') t.green_fee_redeemed += 1; }
    else { t.product_total += 1; if (v.status === 'redeemed') t.product_redeemed += 1; }
    t.amount += v.price || 0;
    t.vouchers.push({ code: v.code, product_name: v.product_name, status: v.status, redeemed_at: v.redeemed_at || null });
  }

  let all = Object.values(groups);
  // 依售出時間過濾（可選）
  if (startDate) all = all.filter(t => t.sale_time.slice(0, 10) >= startDate);
  if (endDate) all = all.filter(t => t.sale_time.slice(0, 10) <= endDate);
  if (missingInvoice) all = all.filter(t => !t.invoice_number); // 只看尚未填發票號
  all.sort((a, b) => b.sale_time.localeCompare(a.sale_time));

  const total = all.length;
  const offset = (page - 1) * limit;
  const rows = all.slice(offset, offset + limit);

  const summary = {
    totalTransactions: total,
    withInvoice: all.filter(t => t.invoice_number).length,
    withoutInvoice: all.filter(t => !t.invoice_number).length,
  };

  return { rows, total, summary };
}

// 逐張核銷明細（會計對帳用）：每張核銷的電子券一列，含卷號
async function getRedemptionDetailReport({ startDate, endDate, voucherType }) {
  const buildQuery = () => {
    let query = supabase
      .from('voucher_logs')
      .select('id, created_at, operator_name, vouchers!inner(id, code, product_name, price, source_type, users(display_name, phone, member_no))')
      .eq('action', 'redeemed')
      .in('vouchers.product_name', PRODUCT_NAMES)
      .eq('vouchers.source_type', 'digital_purchase')
      .order('created_at', { ascending: true });

    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
    if (voucherType === 'green_fee') query = query.eq('vouchers.product_name', '果嶺券');
    if (voucherType === 'product') query = query.eq('vouchers.product_name', '商品券');
    return query;
  };

  const data = await fetchAllRows(buildQuery);

  const rows = data.map(log => {
    const v = log.vouchers;
    const u = v.users || {};
    return {
      redeemed_at: log.created_at,
      code: v.code,
      product_name: v.product_name,
      price: v.price,
      customer_name: u.display_name || '',
      phone: u.phone || '',
      member_no: u.member_no || '',
      operator_name: log.operator_name || '',
    };
  });

  const summary = {
    totalCount: rows.length,
    totalAmount: rows.reduce((s, r) => s + (r.price || 0), 0),
    greenFeeCount: rows.filter(r => r.product_name === '果嶺券').length,
    productCount: rows.filter(r => r.product_name === '商品券').length,
  };

  return { rows, summary };
}

async function getBalanceReport() {
  const vouchers = await fetchAllRows(() => supabase
    .from('vouchers')
    .select('user_id, product_name, price, status, valid_until, source_type, users!inner(display_name, phone, member_no)')
    .in('product_name', PRODUCT_NAMES)
    .eq('source_type', 'digital_purchase')
    .in('status', ['active', 'redeemed'])
    .order('user_id', { ascending: true }));
  const userMap = {};

  for (const v of vouchers) {
    if (!userMap[v.user_id]) {
      userMap[v.user_id] = {
        user_id: v.user_id,
        customer_name: v.users.display_name || '',
        phone: v.users.phone || '',
        member_no: v.users.member_no || '',
        green_fee_active: 0,
        green_fee_redeemed: 0,
        green_fee_total: 0,
        product_active: 0,
        product_redeemed: 0,
        product_total: 0,
        valid_until: null,
        total_active_value: 0,
      };
    }

    const u = userMap[v.user_id];
    const isGreen = v.product_name === '果嶺券';

    if (isGreen) {
      u.green_fee_total += 1;
      if (v.status === 'active') { u.green_fee_active += 1; u.total_active_value += v.price; }
      else u.green_fee_redeemed += 1;
    } else {
      u.product_total += 1;
      if (v.status === 'active') { u.product_active += 1; u.total_active_value += v.price; }
      else u.product_redeemed += 1;
    }

    if (v.valid_until && (!u.valid_until || v.valid_until > u.valid_until)) {
      u.valid_until = v.valid_until;
    }
  }

  const rows = Object.values(userMap)
    .filter(u => u.green_fee_active > 0 || u.product_active > 0)
    .sort((a, b) => (b.green_fee_active + b.product_active) - (a.green_fee_active + a.product_active));

  const summary = {
    totalCustomers: rows.length,
    totalActiveGreenFee: rows.reduce((s, r) => s + r.green_fee_active, 0),
    totalActiveProduct: rows.reduce((s, r) => s + r.product_active, 0),
    totalActiveValue: rows.reduce((s, r) => s + r.total_active_value, 0),
  };

  return { rows, summary };
}

async function getExpiryWarningReport({ daysThreshold = 30 }) {
  const today = new Date();
  const thresholdDate = new Date(today);
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
  const todayStr = today.toISOString().slice(0, 10);
  const thresholdStr = thresholdDate.toISOString().slice(0, 10);

  const vouchers = await fetchAllRows(() => supabase
    .from('vouchers')
    .select('user_id, product_name, price, status, valid_until, source_type, users!inner(display_name, phone, member_no)')
    .in('product_name', PRODUCT_NAMES)
    .eq('source_type', 'digital_purchase')
    .eq('status', 'active')
    .gte('valid_until', todayStr)
    .lte('valid_until', thresholdStr)
    .order('valid_until', { ascending: true }));

  const userMap = {};

  for (const v of vouchers) {
    if (!userMap[v.user_id]) {
      userMap[v.user_id] = {
        user_id: v.user_id,
        customer_name: v.users.display_name || '',
        phone: v.users.phone || '',
        member_no: v.users.member_no || '',
        green_fee_count: 0,
        product_count: 0,
        total_value: 0,
        valid_until: v.valid_until,
      };
    }

    const u = userMap[v.user_id];
    if (v.product_name === '果嶺券') u.green_fee_count += 1;
    else u.product_count += 1;
    u.total_value += v.price;

    if (v.valid_until < u.valid_until) u.valid_until = v.valid_until;
  }

  const rows = Object.values(userMap).sort((a, b) => a.valid_until.localeCompare(b.valid_until));

  const daysRemaining = (dateStr) => {
    const diff = new Date(dateStr) - today;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const rowsWithDays = rows.map(r => ({ ...r, days_remaining: daysRemaining(r.valid_until) }));

  const summary = {
    totalCustomers: rows.length,
    totalVouchers: vouchers.length,
    totalValue: vouchers.reduce((s, v) => s + v.price, 0),
    urgentCount: rowsWithDays.filter(r => r.days_remaining <= 7).length,
  };

  return { rows: rowsWithDays, summary, daysThreshold };
}

module.exports = {
  getSalesReport,
  getRedemptionReport,
  getSalesDetailReport,
  getRedemptionDetailReport,
  getSalesTransactions,
  getBalanceReport,
  getExpiryWarningReport,
};
