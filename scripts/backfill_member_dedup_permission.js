/**
 * 補權限：把 member_dedup 加進 super_admin 角色
 *
 * 背景：新增「會員去重」分頁（tab key / requireAuth 皆為 member_dedup）。
 * 權限來自 roles.permissions 陣列，super_admin 不是自動全開，需補上此 key
 * 才看得到分頁、才能呼叫 /api/members/merge。預設只補 super_admin；
 * 其他角色若要開放，之後在後台「角色權限」自行勾選即可。
 *
 * 使用方式：
 *   node scripts/backfill_member_dedup_permission.js --dry-run   # 只列出將變更的角色
 *   node scripts/backfill_member_dedup_permission.js             # 實際寫入
 *
 * 補上後：該角色的人需「重新登入」權限才會進 JWT 生效。
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN = process.argv.includes('--dry-run');
const PERMISSION = 'member_dedup';
const TARGET_ROLES = ['super_admin'];

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
    return TARGET_ROLES.includes(r.name) && !perms.includes(PERMISSION);
  });

  if (toUpdate.length === 0) {
    console.log(`沒有需要補權限的角色（${TARGET_ROLES.join(', ')} 已有 ${PERMISSION} 或不存在）。`);
    return;
  }

  console.log(`找到 ${toUpdate.length} 個角色需要補上 ${PERMISSION}：`);
  for (const r of toUpdate) console.log(`  - ${r.name} (id=${r.id})`);

  if (DRY_RUN) {
    console.log('\n[dry-run] 未寫入任何資料。移除 --dry-run 以實際執行。');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const r of toUpdate) {
    const perms = Array.isArray(r.permissions) ? r.permissions : [];
    const updated = [...perms, PERMISSION];
    const { error: upErr } = await supabase
      .from('roles')
      .update({ permissions: updated })
      .eq('id', r.id);
    if (upErr) {
      console.error(`  ✗ ${r.name}: ${upErr.message}`);
      fail++;
    } else {
      console.log(`  ✓ ${r.name} 已補上 ${PERMISSION}`);
      ok++;
    }
  }

  console.log(`\n完成：成功 ${ok}，失敗 ${fail}`);
  console.log('提醒：super_admin 帳號需重新登入，權限才會進 JWT 生效。');
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
