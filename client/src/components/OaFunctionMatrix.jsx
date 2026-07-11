import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', marginBottom: '20px' };
const th = { padding: '8px 10px', fontSize: '13px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #f3f4f6' };

// LINE OA 功能 × 角色 權限矩陣：勾哪個，該角色在核銷站/OA 就看得到那個功能。
export function OaFunctionMatrix() {
    const [catalog, setCatalog] = useState([]);
    const [roles, setRoles] = useState([]);
    const [config, setConfig] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await adminFetch('/api/line-oa-functions');
                if (res.ok) {
                    const d = await res.json();
                    setCatalog(d.catalog || []);
                    setRoles(d.roles || []);
                    const allKeys = (d.catalog || []).map(f => f.key);
                    const cfg = {};
                    (d.roles || []).forEach(r => {
                        cfg[r.name] = Array.isArray(d.config?.[r.name]) ? d.config[r.name] : allKeys.slice(); // 未設定 → 全部
                    });
                    setConfig(cfg);
                }
            } catch (e) {
                console.error('讀取 OA 功能設定失敗:', e);
            } finally { setLoading(false); }
        })();
    }, []);

    const toggle = (roleName, key) => setConfig(prev => {
        const cur = new Set(prev[roleName] || []);
        cur.has(key) ? cur.delete(key) : cur.add(key);
        return { ...prev, [roleName]: [...cur] };
    });

    const save = async () => {
        setSaving(true); setMsg('');
        try {
            const res = await adminFetch('/api/line-oa-functions', { method: 'POST', body: JSON.stringify({ config }) });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || '儲存失敗');
            setMsg('已儲存');
        } catch (e) { setMsg('儲存失敗：' + e.message); } finally { setSaving(false); }
    };

    if (loading) return null;

    return (
        <div style={{ maxWidth: '640px' }}>
            <div style={cardStyle}>
                <h4 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>LINE OA 功能權限（角色）</h4>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>勾選哪個角色可用哪些 LINE OA / 核銷站功能。未勾的角色在選單就看不到該功能（底層仍有系統權限把關）。</p>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ ...th, textAlign: 'left' }}>角色</th>
                                {catalog.map(f => <th key={f.key} style={th}>{f.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map(r => (
                                <tr key={r.name}>
                                    <td style={{ ...td, textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.label || r.name}</td>
                                    {catalog.map(f => (
                                        <td key={f.key} style={td}>
                                            <input
                                                type="checkbox"
                                                checked={(config[r.name] || []).includes(f.key)}
                                                onChange={() => toggle(r.name, f.key)}
                                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={save} disabled={saving} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: saving ? '#d1d5db' : '#2563eb', color: '#fff', fontWeight: 600, cursor: saving ? 'default' : 'pointer' }}>
                        {saving ? '儲存中...' : '儲存功能權限'}
                    </button>
                    {msg && <span style={{ fontSize: '14px', fontWeight: 500, color: msg.includes('失敗') ? '#dc2626' : '#16a34a' }}>{msg}</span>}
                </div>
            </div>
        </div>
    );
}
