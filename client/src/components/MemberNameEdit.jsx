import React, { useEffect, useState } from 'react';
import { adminFetch } from '../utils/adminApi';

const MAX_NAME_LENGTH = 30;

const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' };
const panelStyle = { backgroundColor: 'white', borderRadius: '12px', width: '95%', maxHeight: '90vh', overflowY: 'auto' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' };
const closeBtnStyle = { border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' };

const formatTaipeiTime = (iso) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

async function fetchEdits(userId) {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await adminFetch(`/api/member-name-edits${query}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '讀取紀錄失敗');
    return data.edits || [];
}

function EditRow({ edit, showPhone }) {
    return (
        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
            <td style={{ padding: '8px', whiteSpace: 'nowrap', color: '#6b7280', fontSize: '0.85rem' }}>{formatTaipeiTime(edit.at)}</td>
            {showPhone && <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{edit.phone || '-'}</td>}
            <td style={{ padding: '8px' }}>
                <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>{edit.from || '(空白)'}</span>
                {' → '}
                <strong>{edit.to}</strong>
            </td>
            <td style={{ padding: '8px', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{edit.operator}</td>
        </tr>
    );
}

function EditTable({ edits, showPhone }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                        <th style={{ padding: '8px' }}>時間</th>
                        {showPhone && <th style={{ padding: '8px' }}>電話</th>}
                        <th style={{ padding: '8px' }}>修改內容</th>
                        <th style={{ padding: '8px' }}>修改人</th>
                    </tr>
                </thead>
                <tbody>
                    {edits.map(e => <EditRow key={`${e.userId}-${e.at}`} edit={e} showPhone={showPhone} />)}
                </tbody>
            </table>
        </div>
    );
}

/** 修改單一會員名字（只改名字，不改電話） */
export function MemberNameEditModal({ user, onClose, onSaved }) {
    const [name, setName] = useState(user.display_name || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [edits, setEdits] = useState([]);

    useEffect(() => {
        fetchEdits(user.id).then(setEdits).catch(() => setEdits([]));
    }, [user.id]);

    const trimmed = name.trim().replace(/\s+/g, ' ');
    const isUnchanged = trimmed === (user.display_name || '');
    const canSave = !saving && trimmed.length > 0 && !isUnchanged;

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setError('');
        try {
            const res = await adminFetch(`/api/users/${user.id}/display-name`, {
                method: 'PUT',
                body: JSON.stringify({ displayName: trimmed }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '修改失敗');
            onSaved(data.user);
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={{ ...panelStyle, maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
                <div style={headerStyle}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>✏️ 修改會員名字</h3>
                    <button onClick={onClose} style={closeBtnStyle} aria-label="關閉">✕</button>
                </div>
                <div style={{ padding: '20px', display: 'grid', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: '0.95rem' }}>
                        <span style={{ color: '#6b7280' }}>電話</span><strong>{user.phone || '-'}</strong>
                        <span style={{ color: '#6b7280' }}>會員編號</span><span>{user.member_no || '-'}</span>
                        <span style={{ color: '#6b7280' }}>目前名字</span><span>{user.display_name || '(空白)'}</span>
                    </div>
                    <label style={{ display: 'grid', gap: '6px' }}>
                        <span style={{ fontWeight: 'bold' }}>新名字</span>
                        <input
                            type="text"
                            value={name}
                            maxLength={MAX_NAME_LENGTH}
                            autoFocus
                            onChange={e => setName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem' }}
                        />
                    </label>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
                        只改名字，電話、票券、LINE 綁定都不會變動。改過的名字之後按「同步會員資料」也不會被試算表蓋掉。
                    </p>
                    {error && <div style={{ color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px', fontSize: '0.9rem' }}>{error}</div>}
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button onClick={onClose} className="btn" style={{ width: 'auto', background: '#f3f4f6', color: '#374151' }}>取消</button>
                        <button onClick={handleSave} disabled={!canSave} className="btn" style={{ width: 'auto', background: canSave ? '#2563eb' : '#93c5fd', color: 'white' }}>
                            {saving ? '儲存中...' : '儲存'}
                        </button>
                    </div>
                    {edits.length > 0 && (
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '6px' }}>這位會員的改名紀錄</div>
                            <EditTable edits={edits} showPhone={false} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/** 全部改名紀錄（最新在前） */
export function MemberNameEditLog({ onClose }) {
    const [edits, setEdits] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchEdits().then(setEdits).catch(e => setError(e.message));
    }, []);

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={{ ...panelStyle, maxWidth: '700px' }} onClick={e => e.stopPropagation()}>
                <div style={headerStyle}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📝 會員改名紀錄</h3>
                    <button onClick={onClose} style={closeBtnStyle} aria-label="關閉">✕</button>
                </div>
                <div style={{ padding: '16px 20px' }}>
                    {error && <div style={{ color: '#b91c1c' }}>{error}</div>}
                    {!error && edits === null && <div style={{ color: '#6b7280' }}>載入中...</div>}
                    {!error && edits?.length === 0 && <div style={{ color: '#6b7280' }}>目前沒有改名紀錄</div>}
                    {!error && edits?.length > 0 && <EditTable edits={edits} showPhone />}
                </div>
            </div>
        </div>
    );
}
