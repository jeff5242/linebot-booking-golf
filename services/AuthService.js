const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'golf-admin-default-secret-please-change';
const JWT_EXPIRES_IN = '8h';

/**
 * 管理員登入
 * @param {string} username
 * @param {string} password
 * @returns {{ token, admin, permissions }}
 */
async function login(username, password) {
    const { data: admin, error } = await supabase
        .from('admins')
        .select('*')
        .eq('username', username)
        .maybeSingle();

    if (error || !admin) {
        throw new Error('帳號或密碼錯誤');
    }

    // 驗證密碼（支援 bcrypt hash + 舊版明碼）
    let passwordValid = false;
    if (admin.password_hash) {
        passwordValid = await bcrypt.compare(password, admin.password_hash);
    } else {
        // 舊版明碼比對，成功後自動升級為 bcrypt
        passwordValid = (admin.password === password);
        if (passwordValid) {
            const hash = await bcrypt.hash(password, 10);
            await supabase.from('admins').update({ password_hash: hash }).eq('id', admin.id);
        }
    }

    if (!passwordValid) {
        throw new Error('帳號或密碼錯誤');
    }

    // 讀取角色權限
    const { data: role } = await supabase
        .from('roles')
        .select('permissions')
        .eq('name', admin.role || 'super_admin')
        .single();

    const permissions = role?.permissions || [];

    // 產生 JWT
    const token = jwt.sign(
        {
            adminId: admin.id,
            username: admin.username,
            name: admin.name,
            role: admin.role || 'super_admin',
            permissions,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    return {
        token,
        admin: {
            id: admin.id,
            name: admin.name,
            username: admin.username,
            role: admin.role || 'super_admin',
        },
        permissions,
    };
}

/**
 * 純發後台 JWT（呼叫端須自行完成身分驗證，切勿直接對外開放）。
 * @param {string} username
 * @returns {{ token, admin, permissions }}
 */
async function issueTokenForUsername(username) {
    const { data: admin, error } = await supabase
        .from('admins')
        .select('*')
        .eq('username', username)
        .maybeSingle();

    if (error || !admin) {
        throw new Error('此帳號不是管理員');
    }

    const { data: role } = await supabase
        .from('roles')
        .select('permissions')
        .eq('name', admin.role || 'super_admin')
        .single();

    const permissions = role?.permissions || [];

    const token = jwt.sign(
        {
            adminId: admin.id,
            username: admin.username,
            name: admin.name,
            role: admin.role || 'super_admin',
            permissions,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );

    return {
        token,
        admin: {
            id: admin.id,
            name: admin.name,
            username: admin.username,
            role: admin.role || 'super_admin',
        },
        permissions,
    };
}

/**
 * Email OTP 登入：以前端 Supabase Auth 驗證後取得的 access_token 為憑證，
 * 後端驗證該憑證有效、且其 email 對應到 username（管理員帳號），才發後台 JWT。
 * 修補：先前只憑 username 就發 token（無伺服器端驗證），任何人皆可偽造登入。
 * @param {string} username  管理員帳號（Email）
 * @param {string} accessToken  Supabase Auth session 的 access_token
 */
async function loginByOtp(username, accessToken) {
    if (!accessToken) {
        throw new Error('缺少驗證憑證，請重新完成 Email 驗證');
    }
    const { data: authData, error: authErr } = await supabase.auth.getUser(accessToken);
    if (authErr || !authData?.user) {
        throw new Error('驗證未通過或已過期，請重新登入');
    }
    const verifiedEmail = (authData.user.email || '').trim().toLowerCase();
    if (!verifiedEmail || verifiedEmail !== String(username || '').trim().toLowerCase()) {
        throw new Error('驗證身分與帳號不符');
    }
    return issueTokenForUsername(username);
}

/**
 * 驗證 JWT Token
 */
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = { login, loginByOtp, issueTokenForUsername, verifyToken };
