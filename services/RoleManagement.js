const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

/**
 * 取得所有角色
 */
async function getAllRoles() {
    const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: true });
    if (error) throw new Error(`讀取角色失敗: ${error.message}`);
    return data;
}

/**
 * 建立角色
 */
async function createRole({ name, label, permissions }) {
    if (!name || !label) throw new Error('角色名稱和顯示名稱為必填');
    if (!/^[a-z_]+$/.test(name)) {
        throw new Error('角色名稱只能使用小寫英文和底線');
    }

    const { data, error } = await supabase
        .from('roles')
        .insert({ name, label, permissions: permissions || [], is_system: false })
        .select()
        .single();

    if (error) {
        if (error.message.includes('duplicate key')) throw new Error(`角色 ${name} 已存在`);
        throw new Error(`建立角色失敗: ${error.message}`);
    }
    return data;
}

/**
 * 更新角色
 */
async function updateRole(id, { label, permissions }) {
    const updateData = { updated_at: new Date() };
    if (label !== undefined) updateData.label = label;
    if (permissions !== undefined) updateData.permissions = permissions;

    const { data, error } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
    if (error) throw new Error(`更新角色失敗: ${error.message}`);
    return data;
}

/**
 * 刪除角色（系統角色不可刪除）
 */
async function deleteRole(id) {
    const { data: role } = await supabase.from('roles').select('is_system, name').eq('id', id).single();
    if (role?.is_system) throw new Error('無法刪除系統預設角色');

    // 檢查是否有管理員正在使用
    const { data: adminsUsingRole } = await supabase
        .from('admins')
        .select('id')
        .eq('role', role.name);
    if (adminsUsingRole && adminsUsingRole.length > 0) {
        throw new Error(`仍有 ${adminsUsingRole.length} 位管理員使用此角色，請先更換`);
    }

    const { error } = await supabase.from('roles').delete().eq('id', id);
    if (error) throw new Error(`刪除角色失敗: ${error.message}`);
    return { success: true };
}

module.exports = { getAllRoles, createRole, updateRole, deleteRole };
