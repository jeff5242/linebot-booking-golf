/**
 * 補權限：把 paper_report 加進所有已有 voucher_report 的角色
 *
 * 背景：紙券報表原本掛在 voucher_report 權限底下，後來拆成獨立的
 * paper_report tab / requireAuth('paper_report')。既有角色的 roles.permissions
 * 陣列裡沒有 paper_report，會導致原本看得到紙券報表的人看不到。
 * 這支腳本對所有 permissions 含 voucher_report 但缺 paper_report 的角色補上。
 *
 * 使用方式：
 *   node scripts/backfill_paper_report_permission.js --dry-run   # 只列出將變更的角色
 *   node scripts/backfill_paper_report_permission.js             # 實際寫入
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數');
    process.exit(1);
  }

  const { data: roles, error } = await supabase
    .from('roles')
    .select('id, name, permissions');
  if (error) {
    console.error('讀取 roles 失敗：', error.message);
    process.exit(1);
  }

  const toUpdate = (roles || []).filter(r => {
    const perms = Array.isArray(r.permissions) ? r.permissions : [];
    return perms.includes('voucher_report') && !perms.includes('paper_report');
  });

  if (toUpdate.length === 0) {
    console.log('沒有需要補權限的角色，全部已同步。');
    return;
  }

  console.log(`找到 ${toUpdate.length} 個角色需要補上 paper_report：`);
  for (const r of toUpdate) {
    console.log(`  - ${r.name} (id=${r.id})`);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] 未寫入任何資料。移除 --dry-run 以實際執行。');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const r of toUpdate) {
    const perms = Array.isArray(r.permissions) ? r.permissions : [];
    const updated = [...perms, 'paper_report'];
    const { error: upErr } = await supabase
      .from('roles')
      .update({ permissions: updated })
      .eq('id', r.id);
    if (upErr) {
      console.error(`  ✗ ${r.name}: ${upErr.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${r.name} 已補上 paper_report`);
      ok++;
    }
  }

  console.log(`\n完成：成功 ${ok}，失敗 ${fail}`);
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
