#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testPeakType() {
  console.log('🔍 驗證 peak_type 欄位...\n');

  // 取得一個測試用戶
  const { data: users } = await supabase.from('users').select('id').limit(1);

  if (!users || users.length === 0) {
    console.log('❌ 找不到測試用戶');
    process.exit(1);
  }

  // 嘗試插入包含 peak_type 的候補記錄
  const testData = {
    user_id: users[0].id,
    date: '2026-02-15',
    desired_time_start: '06:00',
    desired_time_end: '07:30',
    players_count: 4,
    status: 'queued',
    peak_type: 'peak_a'
  };

  const { data, error } = await supabase
    .from('waitlist')
    .insert([testData])
    .select();

  if (error) {
    console.log('❌ 測試失敗:', error.message);
    process.exit(1);
  }

  console.log('✅ Migration 成功！peak_type 欄位已就緒');
  console.log('📝 測試資料:');
  console.log(`   - ID: ${data[0].id}`);
  console.log(`   - Date: ${data[0].date}`);
  console.log(`   - Peak Type: ${data[0].peak_type}`);
  console.log(`   - Players: ${data[0].players_count}`);

  // 清理測試資料
  await supabase.from('waitlist').delete().eq('id', data[0].id);
  console.log('\n🧹 測試資料已清理');

  console.log('\n✨ 候補系統完全就緒！');
}

testPeakType().catch(console.error);
