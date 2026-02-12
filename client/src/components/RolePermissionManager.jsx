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
                            {roles.map(role => (
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
                                {roles.map(role => (
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
        </div>
    );
}
