const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * 取得所有啟用中的桿弟
 */
async function getAllCaddies() {
    const { data, error } = await supabase
        .from('caddies')
        .select('*')
        .eq('status', 'active')
        .order('caddy_number', { ascending: true });

    if (error) throw new Error(`讀取桿弟名冊失敗: ${error.message}`);
    return data;
}

/**
 * 新增桿弟
 */
async function createCaddy({ name, caddy_number, phone }) {
    if (!name || !caddy_number) {
        throw new Error('桿弟姓名和編號為必填');
    }

    const { data, error } = await supabase
        .from('caddies')
        .insert({ name, caddy_number, phone })
        .select()
        .single();

    if (error) {
        if (error.message.includes('duplicate key')) {
            throw new Error(`桿弟編號 ${caddy_number} 已存在`);
        }
        throw new Error(`新增桿弟失敗: ${error.message}`);
    }
    return data;
}

/**
 * 更新桿弟資料
 */
async function updateCaddy(id, data) {
    const { data: updated, error } = await supabase
        .from('caddies')
        .update({ ...data, updated_at: new Date() })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(`更新桿弟失敗: ${error.message}`);
    return updated;
}

/**
 * 停用桿弟（軟刪除）
 */
async function deactivateCaddy(id) {
    return updateCaddy(id, { status: 'inactive' });
}

module.exports = {
    getAllCaddies,
    createCaddy,
    updateCaddy,
    deactivateCaddy
};
