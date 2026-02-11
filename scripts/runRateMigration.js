const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('開始執行費率管理資料庫 Migration...');
    
    const migrationSQL = fs.readFileSync(
        path.join(__dirname, '../migrations/create_rate_management.sql'),
        'utf8'
    );

    try {
        // 執行 SQL（需要使用 PostgreSQL 直接執行，因為 Supabase SDK 不支援直接執行多語句 SQL）
        console.log('請手動在 Supabase Dashboard 執行以下 SQL:');
        console.log('1. 前往 Supabase Dashboard > SQL Editor');
        console.log('2. 複製貼上 migrations/create_rate_management.sql 的內容');
        console.log('3. 點擊 Run');
        console.log('\n或者使用以下指令（如果有安裝 psql）：');
        console.log(`psql ${process.env.SUPABASE_URL} < migrations/create_rate_management.sql`);
        
    } catch (error) {
        console.error('Migration 失敗:', error.message);
        process.exit(1);
    }
}

runMigration();
