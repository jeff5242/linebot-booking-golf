const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * 取得 JWT Token
 */
export function getAdminToken() {
    return sessionStorage.getItem('admin_jwt');
}

/**
 * 取得管理員權限列表
 */
export function getAdminPermissions() {
    const perms = sessionStorage.getItem('admin_permissions');
    return perms ? JSON.parse(perms) : [];
}

/**
 * 取得管理員資訊
 */
export function getAdminInfo() {
    const info = sessionStorage.getItem('admin_info');
    return info ? JSON.parse(info) : null;
}

/**
 * 檢查是否有特定權限
 */
export function hasPermission(tabKey) {
    return getAdminPermissions().includes(tabKey);
}

/**
 * 帶認證的 fetch 包裝器
 * 自動加上 JWT Authorization header，401 時自動導向登入頁
 */
export async function adminFetch(path, options = {}) {
    const token = getAdminToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
    });

    // 401: Token 過期或無效
    if (res.status === 401) {
        sessionStorage.clear();
        window.location.href = '/admin/login';
        throw new Error('登入已過期');
    }

    return res;
}

/**
 * 儲存登入結果
 */
export function storeLoginResult({ token, admin, permissions }) {
    sessionStorage.setItem('admin_jwt', token);
    sessionStorage.setItem('admin_token', 'true'); // 向下相容
    sessionStorage.setItem('admin_name', admin.name);
    sessionStorage.setItem('admin_permissions', JSON.stringify(permissions));
    sessionStorage.setItem('admin_info', JSON.stringify(admin));
}

/**
 * 清除管理員 session
 */
export function clearAdminSession() {
    sessionStorage.clear();
}
