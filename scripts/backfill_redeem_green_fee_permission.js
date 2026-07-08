/**
 * 補權限：把 redeem_green_fee 加進「目前已可核銷」的既有角色
 *
 * 背景：新增了「果嶺券核銷」細權限（redeem_green_fee）。核銷端點與掃碼核銷
 * 現在會檢查：核銷果嶺券需要此權限。既有角色的 permissions 陣列裡沒有它，
 * 會導致原本能核果嶺券的發球台/管理突然被擋。
 *
 * 策略：對所有 permissions 含 scan 或 voucher_ops（＝目前能核銷）的角色補上
 * redeem_green_fee，維持現況行為。之後新建的「業務」角色只給 scan、不含此權限，
 * 即達成「業務只能核商品券、果嶺券只有發球台/管理能核」。
 *
 * 使用方式：
 *   node scripts/backfill_redeem_green_fee_permission.js --dry-run   # 只列出將變更的角色
 *   node scripts/backfill_redeem_green_fee_permission.js             # 實際寫入
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');
const NEW_PERM = 'redeem_green_fee';
const SOURCE_PERMS = ['scan', 'voucher_ops']; // 目前能核銷的權限
// 排除的角色 name：業務/銷售人員不該有果嶺券核銷（依規則果嶺券僅發球台/管理）
const EXCLUDE_ROLE_NAMES = ['front_desk'];

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 環境變數');
    process.exit(1);
  }

  const { data: roles, error } = await supabase
    .from('roles')
    .select('id, name, label, permissions');
  if (error) {
    console.error('讀取 roles 失敗：', error.message);
    process.exit(1);
  }

  const toUpdate = (roles || []).filter(r => {
    const perms = Array.isArray(r.permissions) ? r.permissions : [];
    if (EXCLUDE_ROLE_NAMES.includes(r.name)) return false; // 業務/銷售人員排除
    return SOURCE_PERMS.some(p => perms.includes(p)) && !perms.includes(NEW_PERM);
  });

  const excluded = (roles || []).filter(r => EXCLUDE_ROLE_NAMES.includes(r.name));
  if (excluded.length > 0) {
    console.log('已排除（不給果嶺券核銷）：', excluded.map(r => `${r.label || r.name}`).join(', '));
  }

  if (toUpdate.length === 0) {
    console.log('沒有需要補權限的角色，全部已同步。');
    return;
  }

  console.log(`找到 ${toUpdate.length} 個角色需要補上 ${NEW_PERM}：`);
  for (const r of toUpdate) {
    console.log(`  - ${r.label || r.name} (id=${r.id})`);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] 未寫入任何資料。移除 --dry-run 以實際執行。');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const r of toUpdate) {
    const perms = Array.isArray(r.permissions) ? r.permissions : [];
    const updated = [...perms, NEW_PERM];
    const { error: upErr } = await supabase
      .from('roles')
      .update({ permissions: updated })
      .eq('id', r.id);
    if (upErr) {
      console.error(`  ✗ ${r.label || r.name}: ${upErr.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${r.label || r.name} 已補上 ${NEW_PERM}`);
      ok++;
    }
  }

  console.log(`\n完成：成功 ${ok}，失敗 ${fail}`);
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
