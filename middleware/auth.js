const { verifyToken } = require('../services/AuthService');

/**
 * Express middleware: 驗證 JWT 並檢查權限
 *
 * @param {string} [requiredPermission] - 所需的權限 tab key（可選）
 *
 * 使用方式：
 *   app.get('/api/settings', requireAuth('settings'), handler)
 *   app.get('/api/admin/me', requireAuth(), handler)  // 僅需登入
 */
function requireAuth(requiredPermission) {
    return (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: '未登入或 Token 無效' });
            }

            const token = authHeader.split(' ')[1];
            const decoded = verifyToken(token);

            req.admin = decoded;

            // 檢查權限
            if (requiredPermission) {
                const permissions = decoded.permissions || [];
                if (!permissions.includes(requiredPermission)) {
                    return res.status(403).json({
                        error: '權限不足',
                        required: requiredPermission,
                    });
                }
            }

            next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token 已過期，請重新登入' });
            }
            return res.status(401).json({ error: '驗證失敗' });
        }
    };
}

/**
 * 可選驗證：有 JWT 就解析，沒有也不擋
 * 用於公開端點（如 /api/rates/active 同時服務前台和後台）
 */
function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            req.admin = verifyToken(token);
        }
    } catch (err) {
        // 靜默忽略
    }
    next();
}

module.exports = { requireAuth, optionalAuth };
