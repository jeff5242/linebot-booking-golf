/**
 * 果嶺券 Excel → vouchers_staging 暫存表匯入腳本
 *
 * 使用方式：
 *   node scripts/import_vouchers_staging.js
 *
 * 前置作業：
 *   先到 Supabase SQL Editor 執行 scripts/create_vouchers_staging.sql
 */

require('dotenv').config();
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EXCEL_PATH = '/Users/jef/Downloads/大衛營預收貨款.xlsx';

// 要匯入的果嶺券分頁
const SHEETS = [
  '11407月果嶺費',
  '11408月果嶺券',
  '11409果嶺券',
  '11410月果嶺券',
  '11411月果嶺券',
  '11412果嶺券',
];

/**
 * 民國年日期 → 西元年 Date
 * e.g. "114/07/04" → "2025-07-04"
 */
function rocToDate(rocStr) {
  if (!rocStr) return null;
  const parts = String(rocStr).trim().split('/');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0]) + 1911;
  const month = parts[1].padStart(2, '0');
  const day = parts[2].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 解析金額字串（移除逗號）
 */
function parseAmount(val) {
  if (val == null || val === '') return null;
  const num = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(num) ? null : num;
}

/**
 * 解析分錄備註，提取單價、張數、票號範圍
 * 例: "@200*15張 00766~00780"
 *     "200元18張@04309-04326"
 *     "200$*18 04981-04998"
 */
function parseMemo(memo) {
  if (!memo) return { unitPrice: null, quantity: null, ticketRange: null };

  const text = String(memo);

  // 提取單價
  let unitPrice = null;
  const priceMatch = text.match(/[@＠]?\s*(\d+)\s*[元$＄*×]?/);
  if (priceMatch) unitPrice = parseInt(priceMatch[1]);

  // 提取張數
  let quantity = null;
  const qtyMatch = text.match(/[*×]?\s*(\d{1,3})\s*張/);
  if (qtyMatch) quantity = parseInt(qtyMatch[1]);
  if (!quantity) {
    // 嘗試 "=18" 格式（如 200*05611705634=18）
    const eqMatch = text.match(/=\s*(\d{1,3})\b/);
    if (eqMatch) {
      quantity = parseInt(eqMatch[1]);
    } else {
      // 嘗試 "200$*18" 格式（限 1~3 位數，避免票號被當張數）
      const qtyMatch2 = text.match(/[*×]\s*(\d{1,3})\b/);
      if (qtyMatch2) quantity = parseInt(qtyMatch2[1]);
    }
  }

  // 提取票號範圍
  let ticketRange = null;
  const rangeMatch = text.match(/(\d{4,6})\s*[-~～至]\s*(\d{4,6})/);
  if (rangeMatch) ticketRange = `${rangeMatch[1]}-${rangeMatch[2]}`;

  return { unitPrice, quantity, ticketRange };
}

async function main() {
  console.log('讀取 Excel:', EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);

  let totalRows = 0;
  let totalInserted = 0;
  let totalErrors = 0;

  for (const sheetName of SHEETS) {
    console.log(`\n--- 處理分頁: ${sheetName} ---`);
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.log(`  ⚠️ 找不到分頁: ${sheetName}`);
      continue;
    }

    // 轉為 JSON（跳過前兩行標題）
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // 找到表頭行（含「單據日期」的行）
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      if (rows[i] && String(rows[i][0]).includes('單據日期')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      console.log('  ⚠️ 找不到表頭行');
      continue;
    }

    // 資料行從表頭下一行開始
    const dataRows = rows.slice(headerIdx + 1).filter(row => {
      // 過濾空行和合計行
      const first = String(row[0] || '').trim();
      return first && /^\d{3}\//.test(first); // 民國年日期格式
    });

    console.log(`  找到 ${dataRows.length} 筆資料`);
    totalRows += dataRows.length;

    // 批次插入（每批 50 筆）
    const batchSize = 50;
    for (let i = 0; i < dataRows.length; i += batchSize) {
      const batch = dataRows.slice(i, i + batchSize).map(row => {
        const memo = String(row[8] || '');
        const { unitPrice, quantity, ticketRange } = parseMemo(memo);

        // 根據月份推斷產品名稱
        let productName = '果嶺券';
        if (unitPrice) productName = `果嶺券 $${unitPrice}`;

        return {
          sheet_name: sheetName,
          purchase_date: rocToDate(row[0]),
          doc_number: String(row[1] || '').trim(),
          phone: String(row[2] || '').trim(),
          customer_name: String(row[3] || '').trim(),
          sales_person: String(row[4] || '').trim(),
          invoice_number: String(row[5] || '').trim(),
          product_amount: parseAmount(row[6]),
          tax_amount: parseAmount(row[7]),
          memo: memo.trim(),
          net_amount: parseAmount(row[9]),
          product_name: productName,
          unit_price: unitPrice,
          quantity: quantity,
          ticket_range: ticketRange,
          status: 'pending',
        };
      });

      const { error } = await supabase.from('vouchers_staging').insert(batch);
      if (error) {
        console.log(`  ❌ 批次 ${i + 1}-${i + batch.length} 失敗:`, error.message);
        totalErrors += batch.length;
      } else {
        totalInserted += batch.length;
      }
    }
    console.log(`  ✅ 已匯入`);
  }

  console.log('\n========== 匯入完成 ==========');
  console.log(`總資料筆數: ${totalRows}`);
  console.log(`成功匯入:   ${totalInserted}`);
  console.log(`失敗:       ${totalErrors}`);

  // 顯示匯入統計
  const { data: stats } = await supabase
    .from('vouchers_staging')
    .select('sheet_name')
    .then(({ data }) => {
      const counts = {};
      (data || []).forEach(r => {
        counts[r.sheet_name] = (counts[r.sheet_name] || 0) + 1;
      });
      return { data: counts };
    });

  console.log('\n各分頁匯入統計:');
  for (const [sheet, count] of Object.entries(stats || {})) {
    console.log(`  ${sheet}: ${count} 筆`);
  }
}

main().catch(err => {
  console.error('腳本執行失敗:', err);
  process.exit(1);
});
