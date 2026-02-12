import React, { useState, useEffect } from 'react';

const apiUrl = import.meta.env.VITE_API_URL || '';

/**
 * 桿弟名冊管理（簡易模式）
 */
export default function CaddyManagement() {
    const [caddies, setCaddies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ name: '', caddy_number: '', phone: '', grade: '', notes: '' });
    const [error, setError] = useState('');

    useEffect(() => {
        fetchCaddies();
    }, []);

    const fetchCaddies = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/caddies`);
            const data = await res.json();
            if (Array.isArray(data)) setCaddies(data);
        } catch (err) {
            console.error('載入桿弟失敗:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!form.name.trim() || !form.caddy_number.trim()) {
            setError('姓名和編號為必填');
            return;
        }

        try {
            const url = editingId
                ? `${apiUrl}/api/caddies/${editingId}`
                : `${apiUrl}/api/caddies`;

            const res = await fetch(url, {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '操作失敗');

            setShowForm(false);
            setEditingId(null);
            setForm({ name: '', caddy_number: '', phone: '', grade: '', notes: '' });
            fetchCaddies();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleEdit = (caddy) => {
        setEditingId(caddy.id);
        setForm({ name: caddy.name, caddy_number: caddy.caddy_number, phone: caddy.phone || '', grade: caddy.grade || '', notes: caddy.notes || '' });
        setShowForm(true);
    };

    const handleDeactivate = async (caddy) => {
        if (!confirm(`確定要停用桿弟「${caddy.name}」嗎？`)) return;

        try {
            const res = await fetch(`${apiUrl}/api/caddies/${caddy.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'inactive' })
            });
            if (!res.ok) throw new Error('停用失敗');
            fetchCaddies();
        } catch (err) {
            alert(err.message);
        }
    };

    const inputStyle = {
        width: '100%', padding: '10px', borderRadius: '6px',
        border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box'
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>桿弟名冊</h3>
                <button
                    onClick={() => {
                        setEditingId(null);
                        setForm({ name: '', caddy_number: '', phone: '', grade: '', notes: '' });
                        setShowForm(!showForm);
                        setError('');
                    }}
                    style={{
                        padding: '8px 16px', borderRadius: '6px', border: 'none',
                        background: '#2e7d32', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
                    }}
                >
                    {showForm ? '取消' : '+ 新增桿弟'}
                </button>
            </div>

            {/* 新增/編輯表單 */}
            {showForm && (
                <form onSubmit={handleSubmit} style={{
                    background: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '16px'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
                                桿弟編號 *
                            </label>
                            <input
                                type="text"
                                value={form.caddy_number}
                                onChange={e => setForm({ ...form, caddy_number: e.target.value })}
                                placeholder="例: 01"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
                                姓名 *
                            </label>
                            <input
                                type="text"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                placeholder="例: 張小明"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
                                級別
                            </label>
                            <select
                                value={form.grade}
                                onChange={e => setForm({ ...form, grade: e.target.value })}
                                style={inputStyle}
                            >
                                <option value="">未設定</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
                                電話
                            </label>
                            <input
                                type="text"
                                value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                placeholder="選填"
                                style={inputStyle}
                            />
                        </div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '13px' }}>
                            備註
                        </label>
                        <input
                            type="text"
                            value={form.notes}
                            onChange={e => setForm({ ...form, notes: e.target.value })}
                            placeholder="選填"
                            style={inputStyle}
                        />
                    </div>
                    {error && <p style={{ color: 'red', margin: '0 0 8px', fontSize: '13px' }}>{error}</p>}
                    <button type="submit" style={{
                        padding: '10px 24px', borderRadius: '6px', border: 'none',
                        background: '#1976d2', color: '#fff', cursor: 'pointer', fontWeight: 'bold'
                    }}>
                        {editingId ? '更新' : '新增'}
                    </button>
                </form>
            )}

            {/* 桿弟列表 */}
            {loading ? (
                <p>載入中...</p>
            ) : caddies.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    <p>尚無桿弟資料</p>
                    <p style={{ fontSize: '13px' }}>點擊「新增桿弟」開始建立名冊</p>
                </div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f5f5f5' }}>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>編號</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>姓名</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>級別</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>電話</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>備註</th>
                            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>狀態</th>
                            <th style={{ padding: '10px', textAlign: 'center', borderBottom: '2px solid #ddd' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {caddies.map(caddy => (
                            <tr key={caddy.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '10px', fontWeight: 'bold' }}>{caddy.caddy_number}</td>
                                <td style={{ padding: '10px' }}>{caddy.name}</td>
                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                    {caddy.grade ? (
                                        <span style={{
                                            padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold',
                                            background: caddy.grade === 'A' ? '#e8f5e9' : caddy.grade === 'B' ? '#fff3e0' : '#fce4ec',
                                            color: caddy.grade === 'A' ? '#2e7d32' : caddy.grade === 'B' ? '#e65100' : '#c62828'
                                        }}>
                                            {caddy.grade}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td style={{ padding: '10px', color: '#666' }}>{caddy.phone || '-'}</td>
                                <td style={{ padding: '10px', color: '#666', fontSize: '13px' }}>{caddy.notes || '-'}</td>
                                <td style={{ padding: '10px' }}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: '12px', fontSize: '12px',
                                        background: caddy.status === 'active' ? '#e8f5e9' : '#ffebee',
                                        color: caddy.status === 'active' ? '#2e7d32' : '#c62828'
                                    }}>
                                        {caddy.status === 'active' ? '在職' : '停用'}
                                    </span>
                                </td>
                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                    <button
                                        onClick={() => handleEdit(caddy)}
                                        style={{
                                            padding: '4px 12px', borderRadius: '4px', border: '1px solid #1976d2',
                                            background: '#e3f2fd', color: '#1976d2', cursor: 'pointer',
                                            marginRight: '6px', fontSize: '12px'
                                        }}
                                    >
                                        編輯
                                    </button>
                                    <button
                                        onClick={() => handleDeactivate(caddy)}
                                        style={{
                                            padding: '4px 12px', borderRadius: '4px', border: '1px solid #c62828',
                                            background: '#ffebee', color: '#c62828', cursor: 'pointer', fontSize: '12px'
                                        }}
                                    >
                                        停用
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
