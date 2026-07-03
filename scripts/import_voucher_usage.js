/**
 * 抵用券使用明細 Excel → voucher_usage_log 匯入腳本
 *
 * 使用方式：
 *   node scripts/import_voucher_usage.js              # 全部清除重匯
 *   node scripts/import_voucher_usage.js --dry-run    # 只解析不寫入
 */

require('dotenv').config();
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXCEL_PATH = '/Users/jef/Downloads/jeff及會計師券使用明細.xlsx';
const DRY_RUN = process.argv.includes('--dry-run');

// 分頁設定：name 必須與 Excel sheet name 完全一致（含空格）
const SHEETS = [
  { name: '07月商品券使用明細ok',      type: 'product',   month: '114年07月' },
  { name: '07月果嶺券使用明細ok ',     type: 'green_fee', month: '114年07月' },
  { name: '08月商品券使用明細  ok',    type: 'product',   month: '114年08月' },
  { name: '08月果嶺券使用明細 Ok',     type: 'green_fee', month: '114年08月' },
  { name: '09月商品券使用明細ok ',     type: 'product',   month: '114年09月' },
  { name: '09月果嶺券使用明細ok ',     type: 'green_fee', month: '114年09月' },
  { name: '10月商品券使用明細 OK ',    type: 'product',   month: '114年10月' },
  { name: '10月果嶺券使用明細ok  ',    type: 'green_fee', month: '114年10月' },
  { name: '11月商品券使用明細  ok',    type: 'product',   month: '114年11月' },
  { name: '11月果嶺券使用明細ok ',     type: 'green_fee', month: '114年11月' },
  { name: '12月商品券使用明細ok',      type: 'product',   month: '114年12月' },
  { name: '12月果嶺券使用明細 ok',     type: 'green_fee', month: '114年12月' },
];

/**
 * 民國年日期 1140714 → 2025-07-14
 */
function rocDateToISO(val) {
  if (!val) return null;
  let str = String(val).trim().replace(/\//g, '');
  // 處理 6 位數的情況（如 114027 → 可能是 1140X27，根據 source_month 補月份）
  // 先嘗試正常 7 位數解析
  if (str.length < 7) {
    // 6 位數且前 3 碼是民國年：嘗試補 0（如 114027 → 可能缺月份前導零）
    if (str.length === 6) {
      const rocYear = parseInt(str.substring(0, 3));
      if (rocYear >= 110 && rocYear <= 120) {
        // 嘗試解析為 YYY + M + DD（單位數月份）
        const m = str.substring(3, 4);
        const d = str.substring(4, 6);
        const tryDate = `${rocYear + 1911}-0${m}-${d}`;
        if (!isNaN(new Date(tryDate).getTime())) return tryDate;
      }
    }
    return null;
  }
  const rocYear = parseInt(str.substring(0, 3));
  const month = str.substring(3, 5);
  const day = str.substring(5, 7);
  if (isNaN(rocYear) || !month || !day) return null;
  const year = rocYear + 1911;
  const dateStr = `${year}-${month}-${day}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return dateStr;
}

/**
 * 解析金額
 */
function parseAmount(val) {
  if (val == null || val === '') return null;
  const num = parseFloat(String(val).replace(/,/g, '').trim());
  return isNaN(num) ? null : num;
}

async function main() {
  if (DRY_RUN) console.log('🔍 DRY RUN 模式：只解析不寫入\n');

  console.log('讀取 Excel:', EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);

  // 清除舊資料再重匯（避免重複）
  if (!DRY_RUN) {
    console.log('\n🗑️  清除 voucher_usage_log 舊資料...');
    const { error: delErr } = await supabase
      .from('voucher_usage_log')
      .delete()
      .gte('id', 0); // delete all rows
    if (delErr) {
      console.error('❌ 清除失敗:', delErr.message);
      process.exit(1);
    }
    console.log('✅ 舊資料已清除');
  }

  let totalRows = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const sheetConfig of SHEETS) {
    const label = sheetConfig.name.trim();
    console.log(`\n--- 處理分頁: ${label} (${sheetConfig.type}) ---`);
    const ws = wb.Sheets[sheetConfig.name];
    if (!ws) {
      console.log(`  ⚠️ 找不到分頁: "${sheetConfig.name}"`);
      continue;
    }

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // 找表頭行
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i] && String(rows[i][0]).includes('序號')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      console.log('  ⚠️ 找不到表頭行');
      continue;
    }

    const dataRows = rows.slice(headerIdx + 1);
    const records = [];
    let lastLeftDate = null;
    let lastRightDate = null;

    for (const row of dataRows) {
      // 左半邊：col 0-4 (序號, 消費日期, 客戶編號, 使用券號, 抵用金額)
      const leftSeq = parseInt(row[0]);
      const leftDate = rocDateToISO(row[1]);
      const leftTicket = String(row[3] || '').trim();
      const leftAmount = parseAmount(row[4]);

      if (leftDate) lastLeftDate = leftDate;
      const effectiveLeftDate = leftDate || lastLeftDate;

      if (leftSeq && effectiveLeftDate && leftTicket && leftAmount != null) {
        if (!leftDate) console.log(`  ⚠️ 左側序號 ${leftSeq} 日期為空，以前一筆日期 ${effectiveLeftDate} 補上`);
        records.push({
          sheet_name: label,
          voucher_type: sheetConfig.type,
          seq_number: leftSeq,
          usage_date: effectiveLeftDate,
          ticket_number: leftTicket,
          amount: leftAmount,
          source_month: sheetConfig.month,
        });
      }

      // 右半邊：col 5-9 (序號, 消費日期, 客戶編號, 使用券號, 抵用金額)
      const rightSeq = parseInt(row[5]);
      const rightDate = rocDateToISO(row[6]);
      const rightTicket = String(row[8] || '').trim();
      const rightAmount = parseAmount(row[9]);

      if (rightDate) lastRightDate = rightDate;
      const effectiveRightDate = rightDate || lastRightDate;

      if (rightSeq && effectiveRightDate && rightTicket && rightAmount != null) {
        if (!rightDate) console.log(`  ⚠️ 右側序號 ${rightSeq} 日期為空，以前一筆日期 ${effectiveRightDate} 補上`);
        records.push({
          sheet_name: label,
          voucher_type: sheetConfig.type,
          seq_number: rightSeq,
          usage_date: effectiveRightDate,
          ticket_number: rightTicket,
          amount: rightAmount,
          source_month: sheetConfig.month,
        });
      }
    }

    const validRecords = records.filter(r => r.usage_date && r.ticket_number);
    const skipped = records.length - validRecords.length;
    totalSkipped += skipped;
    totalRows += validRecords.length;

    console.log(`  解析到 ${validRecords.length} 筆有效資料${skipped > 0 ? `（跳過 ${skipped} 筆不完整）` : ''}`);

    if (DRY_RUN) continue;

    // 批次插入
    const batchSize = 50;
    for (let i = 0; i < validRecords.length; i += batchSize) {
      const batch = validRecords.slice(i, i + batchSize);
      const { error } = await supabase.from('voucher_usage_log').insert(batch);
      if (error) {
        console.log(`  ❌ 批次 ${i + 1}-${i + batch.length} 失敗:`, error.message);
      } else {
        totalInserted += batch.length;
      }
    }
    console.log(`  ✅ 已匯入`);
  }

  console.log('\n========== 匯入完成 ==========');
  console.log(`有效資料: ${totalRows}`);
  if (!DRY_RUN) console.log(`成功匯入: ${totalInserted}`);
  console.log(`跳過不完整: ${totalSkipped}`);

  if (DRY_RUN) return;

  // 統計
  const { data } = await supabase
    .from('voucher_usage_log')
    .select('voucher_type, source_month');

  const stats = {};
  for (const r of (data || [])) {
    const key = `${r.source_month} ${r.voucher_type}`;
    stats[key] = (stats[key] || 0) + 1;
  }
  console.log('\n各分頁統計:');
  for (const [k, v] of Object.entries(stats).sort()) {
    const label = k.includes('product') ? '商品券' : '果嶺券';
    console.log(`  ${k.split(' ')[0]} ${label}: ${v} 筆`);
  }
}

main().catch(err => {
  console.error('腳本執行失敗:', err);
  process.exit(1);
});
