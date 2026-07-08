import React, { useState } from 'react';
import { adminFetch } from '../utils/adminApi';

const ALL_TABS = [
    { key: 'starter', label: '出發台看板' },
    { key: 'waitlist', label: '候補監控' },
    { key: 'scan', label: '📷 掃碼 (報到/核銷)' },
    { key: 'checkin_list', label: '📋 報到清單' },
    { key: 'vouchers', label: '🎫 票券管理' },
    { key: 'users', label: '用戶管理' },
    { key: 'settings', label: '參數設定' },
    { key: 'operational_calendar', label: '📅 營運日曆' },
    { key: 'rate_management', label: '💰 費率管理' },
    { key: 'caddy_management', label: '🏌️ 桿弟管理' },
    { key: 'admins', label: '後台權限' },
    { key: 'broadcast', label: '📢 訊息推播' },
    { key: 'sms_logs', label: '簡訊紀錄' },
    { key: 'voucher_report', label: '📊 電子票券報表' },
    { key: 'paper_report', label: '紙券明細' },
    { key: 'voucher_ops', label: '🎟️ 發券/用券' },
    { key: 'redeem_green_fee', label: '⛳ 果嶺券核銷（限發球台）' },
];

export default function RolePermissionManager({ roles, onRolesChanged }) {
    const [saving, setSaving] = useState(null);
    const [showNewRole, setShowNewRole] = useState(false);
    const [newRole, setNewRole] = useState({ name: '', label: '' });
    const [error, setError] = useState('');

    const handleTogglePermission = async (role, tabKey) => {
        const current = role.permissions || [];
        const updated = current.includes(tabKey)
            ? current.filter(p => p !== tabKey)
            : [...current, tabKey];

        setSaving(role.id);
        try {
            const res = await adminFetch(`/api/roles/${role.id}`, {
                method: 'PUT',
                body: JSON.stringify({ permissions: updated }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            onRolesChanged();
        } catch (err) {
            alert('更新失敗: ' + err.message);
        } finally {
            setSaving(null);
        }
    };

    const handleCreateRole = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await adminFetch('/api/roles', {
                method: 'POST',
                body: JSON.stringify({ ...newRole, permissions: [] }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            setShowNewRole(false);
            setNewRole({ name: '', label: '' });
            onRolesChanged();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDeleteRole = async (role) => {
        if (!confirm(`確定刪除角色「${role.label}」？`)) return;
        try {
            const res = await adminFetch(`/api/roles/${role.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            onRolesChanged();
        } catch (err) {
            alert(err.message);
        }
    };

    const inputStyle = {
        padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd',
        fontSize: '14px', marginRight: '8px'
    };

    // 固定欄位順序：避免勾選後重抓 roles 時欄位跳動。
    // 系統角色 created_at 相同（同時種入）會平手、順序不保證，故用明確順序釘死；
    // 其餘角色排在系統角色之後，以 created_at→id 穩定定序。
    const SYSTEM_ROLE_ORDER = ['finance', 'super_admin', 'starter']; // 財會 → 球場管理 → 出發台
    const rank = (r) => {
        const i = SYSTEM_ROLE_ORDER.indexOf(r.name);
        return i === -1 ? 999 : i;
    };
    const sortedRoles = [...roles].sort((a, b) => {
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        const t = String(a.created_at || '').localeCompare(String(b.created_at || ''));
        if (t !== 0) return t;
        return String(a.id).localeCompare(String(b.id));
    });

    return (
        <div className="card" style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 className="title" style={{ fontSize: '1.1rem', margin: 0 }}>角色權限設定</h2>
                <button
                    onClick={() => { setShowNewRole(!showNewRole); setError(''); }}
                    style={{
                        padding: '6px 14px', borderRadius: '6px', border: 'none',
                        background: showNewRole ? '#6b7280' : '#2e7d32', color: '#fff',
                        cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
                    }}
                >
                    {showNewRole ? '取消' : '+ 新增自訂角色'}
                </button>
            </div>

            {/* 新增角色表單 */}
            {showNewRole && (
                <form onSubmit={handleCreateRole} style={{
                    padding: '12px', background: '#f9fafb', borderRadius: '8px', marginBottom: '16px',
                    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'
                }}>
                    <input
                        type="text"
                        placeholder="角色代碼 (如 front_desk)"
                        value={newRole.name}
                        onChange={e => setNewRole({ ...newRole, name: e.target.value })}
                        required
                        style={inputStyle}
                    />
                    <input
                        type="text"
                        placeholder="顯示名稱 (如 前台)"
                        value={newRole.label}
                        onChange={e => setNewRole({ ...newRole, label: e.target.value })}
                        required
                        style={inputStyle}
                    />
                    <button type="submit" style={{
                        padding: '8px 16px', borderRadius: '6px', border: 'none',
                        background: '#1976d2', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
                    }}>
                        建立
                    </button>
                    {error && <span style={{ color: 'red', fontSize: '13px' }}>{error}</span>}
                </form>
            )}

            {/* 權限矩陣 */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd', minWidth: '160px' }}>
                                功能模組
                            </th>
                            {sortedRoles.map(role => (
                                <th key={role.id} style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #ddd', minWidth: '100px' }}>
                                    <div>{role.label}</div>
                                    {role.is_system ? (
                                        <span style={{
                                            fontSize: '10px', color: '#999', background: '#f0f0f0',
                                            padding: '1px 6px', borderRadius: '4px'
                                        }}>系統</span>
                                    ) : (
                                        <button
                                            onClick={() => handleDeleteRole(role)}
                                            style={{
                                                color: '#c62828', border: 'none', background: 'none',
                                                cursor: 'pointer', fontSize: '11px', padding: '2px 4px'
                                            }}
                                        >
                                            刪除
                                        </button>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {ALL_TABS.map(tab => (
                            <tr key={tab.key} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '10px', fontSize: '14px' }}>{tab.label}</td>
                                {sortedRoles.map(role => (
                                    <td key={role.id} style={{ textAlign: 'center', padding: '10px' }}>
                                        <input
                                            type="checkbox"
                                            checked={(role.permissions || []).includes(tab.key)}
                                            onChange={() => handleTogglePermission(role, tab.key)}
                                            disabled={saving === role.id}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#2e7d32' }}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{
                marginTop: '16px', padding: '14px', background: '#fffbeb',
                border: '1px solid #fde68a', borderRadius: '8px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                flexWrap: 'wrap', gap: '10px',
            }}>
                <span style={{ fontSize: '13px', color: '#92400e' }}>
                    權限修改後，該用戶需重新登入才會生效
                </span>
                <button
                    onClick={() => {
                        sessionStorage.clear();
                        window.location.href = '/admin/login';
                    }}
                    style={{
                        padding: '8px 16px', borderRadius: '6px', border: 'none',
                        background: '#dc2626', color: '#fff', cursor: 'pointer',
                        fontWeight: 'bold', fontSize: '13px',
                    }}
                >
                    重新登入
                </button>
            </div>
        </div>
    );
}
