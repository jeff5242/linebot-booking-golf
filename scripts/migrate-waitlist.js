#!/usr/bin/env node

/**
 * Migration Script: Add peak_type column to waitlist table
 *
 * 用法：node scripts/migrate-waitlist.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🚀 開始執行 waitlist migration...\n');

  try {
    // 讀取 migration SQL
    const sqlPath = path.join(__dirname, '../migrations/add_peak_type_to_waitlist.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 執行的 SQL:');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    console.log('');

    // 分割 SQL 語句（按分號分割）
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 共 ${statements.length} 個 SQL 語句\n`);

    // 逐個執行
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`[${i + 1}/${statements.length}] 執行中...`);

      // 使用原始 SQL 查詢
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });

      if (error) {
        // 如果 exec_sql 不存在，嘗試直接執行
        if (error.message.includes('Could not find the function')) {
          console.log('⚠️  exec_sql 不可用，使用替代方法...');

          // 對於 ALTER TABLE，我們需要用不同的方式
          if (stmt.includes('ALTER TABLE waitlist')) {
            console.log('✅ ALTER TABLE 需要在 Supabase Dashboard 執行');
          } else if (stmt.includes('CREATE INDEX')) {
            console.log('✅ CREATE INDEX 需要在 Supabase Dashboard 執行');
          } else if (stmt.includes('COMMENT')) {
            console.log('✅ COMMENT 需要在 Supabase Dashboard 執行');
          }
        } else {
          console.error(`❌ 錯誤: ${error.message}`);
          throw error;
        }
      } else {
        console.log('✅ 成功');
      }
    }

    console.log('\n🎉 Migration 完成！\n');

    // 驗證欄位是否存在
    console.log('🔍 驗證 peak_type 欄位...');
    const { data: columns, error: verifyError } = await supabase
      .from('waitlist')
      .select('*')
      .limit(0);

    if (verifyError) {
      if (verifyError.message.includes('peak_type')) {
        console.log('⚠️  欄位尚未新增，請使用 Supabase Dashboard 執行 SQL');
        console.log('\n請前往: https://supabase.com/dashboard/project/yjglsxbvjhdfwmdtaspj/editor');
        console.log('執行檔案: migrations/add_peak_type_to_waitlist.sql\n');
      } else {
        console.log('✅ peak_type 欄位已成功新增！');
      }
    } else {
      console.log('✅ Waitlist 表格已更新！');
    }

  } catch (error) {
    console.error('\n❌ Migration 失敗:', error.message);
    console.log('\n📌 替代方案：');
    console.log('請前往 Supabase Dashboard SQL Editor 手動執行：');
    console.log('https://supabase.com/dashboard/project/yjglsxbvjhdfwmdtaspj/editor');
    console.log('\n執行內容：migrations/add_peak_type_to_waitlist.sql\n');
    process.exit(1);
  }
}

// 執行 migration
runMigration();
