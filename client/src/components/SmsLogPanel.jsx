import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

const STATUS_LABELS = {
    success: { text: '成功', color: '#16a34a', bg: '#f0fdf4' },
    error: { text: '失敗', color: '#dc2626', bg: '#fef2f2' },
};

const PURPOSE_LABELS = {
    registration: '註冊',
    rebind: '重新綁定',
    notification: '通知',
};

export function SmsLogPanel() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [phone, setPhone] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const pageSize = 20;

    const fetchLogs = async (p = 1) => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page: p, limit: pageSize });
            if (phone.trim()) params.set('phone', phone.trim());
            if (statusFilter !== 'all') params.set('status', statusFilter);
            const res = await adminFetch(`/api/sms-logs?${params}`);
            const data = await res.json();
            setLogs(data.logs || []);
            setTotal(data.total || 0);
            setPage(p);
        } catch (err) {
            console.error('Failed to fetch SMS logs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs(1);
    }, [statusFilter]);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchLogs(1);
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div style={{ padding: '16px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: 'bold' }}>簡訊發送紀錄</h3>

            {/* Filters */}
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="手機號碼查詢..."
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    style={{
                        padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
                        fontSize: '14px', width: '160px'
                    }}
                />
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{
                        padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
                        fontSize: '14px', backgroundColor: '#fff'
                    }}
                >
                    <option value="all">全部狀態</option>
                    <option value="success">成功</option>
                    <option value="error">失敗</option>
                </select>
                <button
                    type="submit"
                    style={{
                        padding: '8px 16px', backgroundColor: '#2563eb', color: '#fff',
                        border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px'
                    }}
                >
                    查詢
                </button>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>共 {total} 筆</span>
            </form>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={thStyle}>時間</th>
                            <th style={thStyle}>手機號碼</th>
                            <th style={thStyle}>用途</th>
                            <th style={thStyle}>狀態</th>
                            <th style={thStyle}>錯誤訊息</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>無紀錄</td></tr>
                        ) : logs.map((log, i) => {
                            const st = STATUS_LABELS[log.status] || { text: log.status, color: '#6b7280', bg: '#f9fafb' };
                            return (
                                <tr key={log.id || i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={tdStyle}>{formatTime(log.created_at)}</td>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{log.phone}</td>
                                    <td style={tdStyle}>{PURPOSE_LABELS[log.purpose] || log.purpose || '-'}</td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                                            fontSize: '12px', fontWeight: 'bold', color: st.color, backgroundColor: st.bg
                                        }}>
                                            {st.text}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, maxWidth: '300px', wordBreak: 'break-all', color: '#dc2626', fontSize: '12px' }}>
                                        {log.error_message || '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
                    <button
                        onClick={() => fetchLogs(page - 1)}
                        disabled={page <= 1}
                        style={pageBtnStyle(page <= 1)}
                    >
                        上一頁
                    </button>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>{page} / {totalPages}</span>
                    <button
                        onClick={() => fetchLogs(page + 1)}
                        disabled={page >= totalPages}
                        style={pageBtnStyle(page >= totalPages)}
                    >
                        下一頁
                    </button>
                </div>
            )}
        </div>
    );
}

function formatTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}:${ss}`;
}

const thStyle = { padding: '10px 8px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 8px', verticalAlign: 'top' };
const pageBtnStyle = (disabled) => ({
    padding: '6px 14px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '6px',
    backgroundColor: disabled ? '#f3f4f6' : '#fff', color: disabled ? '#9ca3af' : '#374151',
    cursor: disabled ? 'default' : 'pointer',
});
