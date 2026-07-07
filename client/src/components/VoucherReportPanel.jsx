import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

const SUB_TABS = [
    { key: 'sales', label: '銷售報表' },
    { key: 'redemption', label: '核銷統計' },
    { key: 'salesDetail', label: '銷售明細（卷號）' },
    { key: 'redemptionDetail', label: '核銷明細（卷號）' },
    { key: 'balance', label: '餘額總覽' },
    { key: 'expiry', label: '到期預警' },
];

const tabBarStyle = { display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' };
const tabBtnStyle = (active) => ({
    padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: '8px',
    background: active ? '#7c3aed' : '#fff', color: active ? '#fff' : '#374151',
    cursor: 'pointer', fontSize: '14px', fontWeight: active ? '600' : '400',
});
const cardStyle = {
    padding: '12px 16px', borderRadius: '8px', border: '1px solid #e5e7eb',
    background: '#fff', minWidth: '110px', textAlign: 'center',
};
const selectStyle = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', background: '#fff' };
const inputStyle = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' };
const btnStyle = (color = '#16a34a') => ({
    padding: '8px 16px', background: color, color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
});
const thStyle = { padding: '8px 10px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap', borderBottom: '2px solid #d1d5db', fontSize: '13px' };
const tdStyle = { padding: '8px 10px', verticalAlign: 'middle', whiteSpace: 'nowrap', fontSize: '13px', borderBottom: '1px solid #f3f4f6' };

function SummaryCard({ label, value, unit, color = '#2563eb' }) {
    return (
        <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
            {unit && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{unit}</div>}
        </div>
    );
}

function exportCsv(filename, headers, rows) {
    let csv = '﻿';
    csv += headers.join(',') + '\n';
    for (const row of rows) {
        csv += row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function formatDate(iso) {
    if (!iso) return '';
    return iso.slice(0, 10);
}

// 解析報表回應：非 2xx 時丟出可讀錯誤（adminFetch 只在 401 丟錯，其餘要自己判斷）
async function parseReportRes(res) {
    if (!res.ok) {
        if (res.status === 404) throw new Error('找不到報表 API（後端可能尚未更新部署）');
        if (res.status === 403) throw new Error('沒有檢視此報表的權限');
        let detail = '';
        try { detail = (await res.json())?.error || ''; } catch { /* 非 JSON 回應 */ }
        throw new Error(detail || `報表載入失敗（HTTP ${res.status}）`);
    }
    return res.json();
}

function ErrorBanner({ message }) {
    if (!message) return null;
    return (
        <div style={{ padding: '10px 14px', marginBottom: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', fontWeight: '500' }}>
            ⚠️ {message}
        </div>
    );
}

function formatDateTime(iso) {
    if (!iso) return '';
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function localDateStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// 本月 1 號（本地時區）
function monthStartStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// ─── 逐張明細（會計對帳用，含卷號）: mode = 'sales' | 'redemption' ───
function DetailReport({ mode }) {
    const isSales = mode === 'sales';
    const endpoint = isSales ? '/api/reports/voucher-sales-detail' : '/api/reports/voucher-redemption-detail';
    const timeLabel = isSales ? '售出時間' : '核銷時間';
    const amountLabel = isSales ? '售價' : '金額';
    const filename = isSales ? '電子票券銷售明細_卷號.csv' : '電子票券核銷明細_卷號.csv';

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(localDateStr(0));
    const [endDate, setEndDate] = useState(localDateStr(0));
    const [voucherType, setVoucherType] = useState('');
    const [error, setError] = useState('');

    const fetchData = async (s = startDate, e = endDate, vt = voucherType) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (s) params.set('startDate', s);
            if (e) params.set('endDate', e);
            if (vt) params.set('voucherType', vt);
            const res = await adminFetch(`${endpoint}?${params}`);
            setData(await parseReportRes(res));
        } catch (err) {
            console.error('Detail report error:', err);
            setError(err.message || '報表載入失敗，後端可能未更新');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [mode]);

    const applyRange = (s, e) => {
        setStartDate(s);
        setEndDate(e);
        fetchData(s, e, voucherType);
    };
    const setRange = (offset) => {
        const d = localDateStr(offset);
        applyRange(d, d);
    };

    const rows = data?.rows || [];
    const s = data?.summary;
    const timeVal = (r) => (isSales ? r.sold_at : r.redeemed_at);

    const handleExport = () => {
        const headers = [timeLabel, '卷號', '券種', amountLabel, '客戶', '電話', '會員編號', '操作人'];
        const csvRows = rows.map(r => [formatDateTime(timeVal(r)), r.code, r.product_name, r.price, r.customer_name, r.phone, r.member_no, r.operator_name]);
        exportCsv(filename, headers, csvRows);
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => setRange(0)} style={btnStyle('#0891b2')}>今日</button>
                <button onClick={() => setRange(-1)} style={btnStyle('#0891b2')}>昨日</button>
                <button onClick={() => applyRange(localDateStr(-6), localDateStr(0))} style={btnStyle('#0891b2')}>近 7 天</button>
                <button onClick={() => applyRange(monthStartStr(), localDateStr(0))} style={btnStyle('#0891b2')}>本月</button>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                <span style={{ color: '#9ca3af' }}>～</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                <select value={voucherType} onChange={e => setVoucherType(e.target.value)} style={selectStyle}>
                    <option value="">全部券種</option>
                    <option value="green_fee">果嶺券</option>
                    <option value="product">商品券</option>
                </select>
                <button onClick={() => fetchData()} style={btnStyle('#2563eb')}>查詢</button>
                <button onClick={handleExport} disabled={!rows.length} style={btnStyle()}>匯出 CSV</button>
            </div>

            <ErrorBanner message={error} />

            {s && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <SummaryCard label={isSales ? '售出張數' : '核銷張數'} value={s.totalCount} unit="張" color={isSales ? '#7c3aed' : '#dc2626'} />
                    <SummaryCard label="總金額" value={`$${s.totalAmount.toLocaleString()}`} color="#16a34a" />
                    <SummaryCard label="果嶺券" value={s.greenFeeCount} unit="張" color="#2563eb" />
                    <SummaryCard label="商品券" value={s.productCount} unit="張" color="#ea580c" />
                </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={thStyle}>{timeLabel}</th>
                            <th style={thStyle}>卷號</th>
                            <th style={thStyle}>券種</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>{amountLabel}</th>
                            <th style={thStyle}>客戶</th>
                            <th style={thStyle}>電話</th>
                            <th style={thStyle}>會員編號</th>
                            <th style={thStyle}>操作人</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>無資料</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.code + i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={{ ...tdStyle, fontSize: '12px', color: '#6b7280' }}>{formatDateTime(timeVal(r))}</td>
                                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: '600' }}>{r.code}</td>
                                <td style={tdStyle}>
                                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', background: r.product_name === '果嶺券' ? '#dbeafe' : '#ffedd5', color: r.product_name === '果嶺券' ? '#1d4ed8' : '#c2410c' }}>
                                        {r.product_name}
                                    </span>
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>${r.price}</td>
                                <td style={tdStyle}>{r.customer_name}</td>
                                <td style={tdStyle}>{r.phone}</td>
                                <td style={tdStyle}>{r.member_no}</td>
                                <td style={tdStyle}>{r.operator_name}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── 銷售報表 ───
function SalesReport() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [voucherType, setVoucherType] = useState('');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);
            if (voucherType) params.set('voucherType', voucherType);
            const res = await adminFetch(`/api/reports/voucher-sales?${params}`);
            setData(await parseReportRes(res));
        } catch (err) {
            console.error('Sales report error:', err);
            setError(err.message || '報表載入失敗，後端可能未更新');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const filteredRows = (data?.rows || []).filter(r => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.customer_name?.toLowerCase().includes(q) || r.phone?.includes(q) || r.member_no?.includes(q);
    });

    const handleExport = () => {
        const headers = ['日期', '客戶', '電話', '會員編號', '券種', '單價', '數量', '金額', '效期起', '效期迄', '操作人'];
        const rows = filteredRows.map(r => [r.date, r.customer_name, r.phone, r.member_no, r.product_name, r.unit_price, r.quantity, r.total_amount, formatDate(r.valid_from), formatDate(r.valid_until), r.operator_name]);
        exportCsv('電子票券銷售報表.csv', headers, rows);
    };

    const s = data?.summary;

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                <span style={{ color: '#9ca3af' }}>～</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                <select value={voucherType} onChange={e => setVoucherType(e.target.value)} style={selectStyle}>
                    <option value="">全部券種</option>
                    <option value="green_fee">果嶺券</option>
                    <option value="product">商品券</option>
                </select>
                <button onClick={fetchData} style={btnStyle('#2563eb')}>查詢</button>
                <input type="text" placeholder="搜尋客戶..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '140px' }} />
                <button onClick={handleExport} disabled={!filteredRows.length} style={btnStyle()}>匯出 CSV</button>
            </div>

            <ErrorBanner message={error} />

            {s && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <SummaryCard label="總筆數" value={s.totalRecords} unit="筆" />
                    <SummaryCard label="總發券數" value={s.totalQuantity} unit="張" color="#7c3aed" />
                    <SummaryCard label="總金額" value={`$${s.totalAmount.toLocaleString()}`} color="#16a34a" />
                    <SummaryCard label="果嶺券" value={s.greenFeeQty} unit="張" color="#2563eb" />
                    <SummaryCard label="商品券" value={s.productQty} unit="張" color="#ea580c" />
                </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={thStyle}>日期</th>
                            <th style={thStyle}>客戶</th>
                            <th style={thStyle}>電話</th>
                            <th style={thStyle}>券種</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>單價</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>數量</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
                            <th style={thStyle}>效期</th>
                            <th style={thStyle}>操作人</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : filteredRows.length === 0 ? (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>無資料</td></tr>
                        ) : filteredRows.map((r, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={tdStyle}>{r.date}</td>
                                <td style={tdStyle}>{r.customer_name}</td>
                                <td style={tdStyle}>{r.phone}</td>
                                <td style={tdStyle}>
                                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', background: r.product_name === '果嶺券' ? '#dbeafe' : '#ffedd5', color: r.product_name === '果嶺券' ? '#1d4ed8' : '#c2410c' }}>
                                        {r.product_name}
                                    </span>
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>${r.unit_price}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>{r.quantity}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>${r.total_amount.toLocaleString()}</td>
                                <td style={{ ...tdStyle, fontSize: '12px', color: '#6b7280' }}>{formatDate(r.valid_from)} ~ {formatDate(r.valid_until)}</td>
                                <td style={tdStyle}>{r.operator_name}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── 核銷統計 ───
function RedemptionReport() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [granularity, setGranularity] = useState('daily');
    const [error, setError] = useState('');

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ granularity });
            if (startDate) params.set('startDate', startDate);
            if (endDate) params.set('endDate', endDate);
            const res = await adminFetch(`/api/reports/voucher-redemption?${params}`);
            setData(await parseReportRes(res));
        } catch (err) {
            console.error('Redemption report error:', err);
            setError(err.message || '報表載入失敗，後端可能未更新');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const rows = data?.rows || [];
    const s = data?.summary;

    const handleExport = () => {
        const periodLabel = granularity === 'daily' ? '日期' : granularity === 'monthly' ? '月份' : '年度';
        const headers = [periodLabel, '果嶺券(張)', '果嶺券(金額)', '商品券(張)', '商品券(金額)', '合計(張)', '合計(金額)'];
        const csvRows = rows.map(r => [r.period, r.green_fee_qty, r.green_fee_amount, r.product_qty, r.product_amount, r.total_qty, r.total_amount]);
        exportCsv('核銷統計報表.csv', headers, csvRows);
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                <span style={{ color: '#9ca3af' }}>～</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                <select value={granularity} onChange={e => setGranularity(e.target.value)} style={selectStyle}>
                    <option value="daily">日報</option>
                    <option value="monthly">月報</option>
                    <option value="yearly">年報</option>
                </select>
                <button onClick={fetchData} style={btnStyle('#2563eb')}>查詢</button>
                <button onClick={handleExport} disabled={!rows.length} style={btnStyle()}>匯出 CSV</button>
            </div>

            <ErrorBanner message={error} />

            {s && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <SummaryCard label="總核銷" value={s.totalQuantity} unit="張" color="#dc2626" />
                    <SummaryCard label="總金額" value={`$${s.totalAmount.toLocaleString()}`} color="#16a34a" />
                    <SummaryCard label="果嶺券" value={s.greenFeeQty} unit="張" color="#2563eb" />
                    <SummaryCard label="商品券" value={s.productQty} unit="張" color="#ea580c" />
                </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={thStyle}>{granularity === 'daily' ? '日期' : granularity === 'monthly' ? '月份' : '年度'}</th>
                            <th style={{ ...thStyle, textAlign: 'right', color: '#2563eb' }}>果嶺券(張)</th>
                            <th style={{ ...thStyle, textAlign: 'right', color: '#2563eb' }}>果嶺券(金額)</th>
                            <th style={{ ...thStyle, textAlign: 'right', color: '#ea580c' }}>商品券(張)</th>
                            <th style={{ ...thStyle, textAlign: 'right', color: '#ea580c' }}>商品券(金額)</th>
                            <th style={{ ...thStyle, textAlign: 'right', fontWeight: '700' }}>合計(張)</th>
                            <th style={{ ...thStyle, textAlign: 'right', fontWeight: '700' }}>合計(金額)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>無資料</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.period} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={{ ...tdStyle, fontWeight: '500' }}>{r.period}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{r.green_fee_qty}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>${r.green_fee_amount.toLocaleString()}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{r.product_qty}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>${r.product_amount.toLocaleString()}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700' }}>{r.total_qty}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700' }}>${r.total_amount.toLocaleString()}</td>
                            </tr>
                        ))}
                        {rows.length > 0 && (
                            <tr style={{ background: '#f0fdf4', fontWeight: '700' }}>
                                <td style={{ ...tdStyle, fontWeight: '700' }}>合計</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{rows.reduce((s, r) => s + r.green_fee_qty, 0)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>${rows.reduce((s, r) => s + r.green_fee_amount, 0).toLocaleString()}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{rows.reduce((s, r) => s + r.product_qty, 0)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>${rows.reduce((s, r) => s + r.product_amount, 0).toLocaleString()}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{rows.reduce((s, r) => s + r.total_qty, 0)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>${rows.reduce((s, r) => s + r.total_amount, 0).toLocaleString()}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── 客戶餘額總覽 ───
function BalanceReport() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await adminFetch('/api/reports/voucher-balance');
            setData(await parseReportRes(res));
        } catch (err) {
            console.error('Balance report error:', err);
            setError(err.message || '報表載入失敗，後端可能未更新');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const filteredRows = (data?.rows || []).filter(r => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.customer_name?.toLowerCase().includes(q) || r.phone?.includes(q) || r.member_no?.includes(q);
    });

    const s = data?.summary;

    const handleExport = () => {
        const headers = ['客戶', '電話', '會員編號', '果嶺券(可用)', '果嶺券(已用)', '果嶺券(合計)', '商品券(可用)', '商品券(已用)', '商品券(合計)', '可用券總值', '到期日'];
        const csvRows = filteredRows.map(r => [r.customer_name, r.phone, r.member_no, r.green_fee_active, r.green_fee_redeemed, r.green_fee_total, r.product_active, r.product_redeemed, r.product_total, r.total_active_value, formatDate(r.valid_until)]);
        exportCsv('客戶票券餘額總覽.csv', headers, csvRows);
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" placeholder="搜尋客戶/電話/會員編號..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '220px' }} />
                <button onClick={fetchData} style={btnStyle('#2563eb')}>重新載入</button>
                <button onClick={handleExport} disabled={!filteredRows.length} style={btnStyle()}>匯出 CSV</button>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    {loading ? '載入中...' : `共 ${filteredRows.length} 位客戶`}
                </span>
            </div>

            <ErrorBanner message={error} />

            {s && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <SummaryCard label="持券客戶" value={s.totalCustomers} unit="位" />
                    <SummaryCard label="可用果嶺券" value={s.totalActiveGreenFee} unit="張" color="#2563eb" />
                    <SummaryCard label="可用商品券" value={s.totalActiveProduct} unit="張" color="#ea580c" />
                    <SummaryCard label="可用券總值" value={`$${s.totalActiveValue.toLocaleString()}`} color="#16a34a" />
                </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={thStyle}>客戶</th>
                            <th style={thStyle}>電話</th>
                            <th style={{ ...thStyle, textAlign: 'center', background: '#eff6ff' }} colSpan={3}>果嶺券</th>
                            <th style={{ ...thStyle, textAlign: 'center', background: '#fff7ed' }} colSpan={3}>商品券</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>可用總值</th>
                            <th style={thStyle}>到期日</th>
                        </tr>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={{ ...thStyle, borderTop: 'none' }}></th>
                            <th style={{ ...thStyle, borderTop: 'none' }}></th>
                            <th style={{ ...thStyle, textAlign: 'right', fontSize: '11px', background: '#eff6ff' }}>可用</th>
                            <th style={{ ...thStyle, textAlign: 'right', fontSize: '11px', background: '#eff6ff' }}>已用</th>
                            <th style={{ ...thStyle, textAlign: 'right', fontSize: '11px', background: '#eff6ff' }}>合計</th>
                            <th style={{ ...thStyle, textAlign: 'right', fontSize: '11px', background: '#fff7ed' }}>可用</th>
                            <th style={{ ...thStyle, textAlign: 'right', fontSize: '11px', background: '#fff7ed' }}>已用</th>
                            <th style={{ ...thStyle, textAlign: 'right', fontSize: '11px', background: '#fff7ed' }}>合計</th>
                            <th style={{ ...thStyle, borderTop: 'none' }}></th>
                            <th style={{ ...thStyle, borderTop: 'none' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : filteredRows.length === 0 ? (
                            <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>無資料</td></tr>
                        ) : filteredRows.map((r, i) => (
                            <tr key={r.user_id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={{ ...tdStyle, fontWeight: '500' }}>{r.customer_name}</td>
                                <td style={tdStyle}>{r.phone}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#2563eb', fontWeight: '600' }}>{r.green_fee_active}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#9ca3af' }}>{r.green_fee_redeemed}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{r.green_fee_total}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#ea580c', fontWeight: '600' }}>{r.product_active}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#9ca3af' }}>{r.product_redeemed}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{r.product_total}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', color: '#16a34a' }}>${r.total_active_value.toLocaleString()}</td>
                                <td style={{ ...tdStyle, color: '#6b7280' }}>{formatDate(r.valid_until)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── 到期預警 ───
function ExpiryWarningReport() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [days, setDays] = useState('30');
    const [error, setError] = useState('');

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await adminFetch(`/api/reports/voucher-expiry-warning?days=${days}`);
            setData(await parseReportRes(res));
        } catch (err) {
            console.error('Expiry warning error:', err);
            setError(err.message || '報表載入失敗，後端可能未更新');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const rows = data?.rows || [];
    const s = data?.summary;

    const handleExport = () => {
        const headers = ['客戶', '電話', '會員編號', '果嶺券', '商品券', '券值', '到期日', '剩餘天數'];
        const csvRows = rows.map(r => [r.customer_name, r.phone, r.member_no, r.green_fee_count, r.product_count, r.total_value, formatDate(r.valid_until), r.days_remaining]);
        exportCsv('到期預警報表.csv', headers, csvRows);
    };

    const urgencyColor = (daysLeft) => {
        if (daysLeft <= 7) return { bg: '#fef2f2', color: '#dc2626', label: '緊急' };
        if (daysLeft <= 14) return { bg: '#fff7ed', color: '#ea580c', label: '警告' };
        return { bg: '#fffbeb', color: '#d97706', label: '注意' };
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={days} onChange={e => setDays(e.target.value)} style={selectStyle}>
                    <option value="7">7 天內到期</option>
                    <option value="14">14 天內到期</option>
                    <option value="30">30 天內到期</option>
                    <option value="60">60 天內到期</option>
                    <option value="90">90 天內到期</option>
                </select>
                <button onClick={fetchData} style={btnStyle('#2563eb')}>查詢</button>
                <button onClick={handleExport} disabled={!rows.length} style={btnStyle()}>匯出 CSV</button>
            </div>

            <ErrorBanner message={error} />

            {s && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <SummaryCard label="即將到期客戶" value={s.totalCustomers} unit="位" color="#dc2626" />
                    <SummaryCard label="即將到期券數" value={s.totalVouchers} unit="張" color="#ea580c" />
                    <SummaryCard label="即將到期券值" value={`$${s.totalValue.toLocaleString()}`} color="#d97706" />
                    {s.urgentCount > 0 && <SummaryCard label="7天內到期" value={s.urgentCount} unit="位" color="#dc2626" />}
                </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={thStyle}>狀態</th>
                            <th style={thStyle}>客戶</th>
                            <th style={thStyle}>電話</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>果嶺券</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>商品券</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>券值</th>
                            <th style={thStyle}>到期日</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>剩餘天數</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>目前沒有即將到期的票券</td></tr>
                        ) : rows.map((r, i) => {
                            const u = urgencyColor(r.days_remaining);
                            return (
                                <tr key={r.user_id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                    <td style={tdStyle}>
                                        <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: u.bg, color: u.color }}>
                                            {u.label}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, fontWeight: '500' }}>{r.customer_name}</td>
                                    <td style={tdStyle}>{r.phone}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.green_fee_count}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{r.product_count}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>${r.total_value.toLocaleString()}</td>
                                    <td style={{ ...tdStyle, color: u.color, fontWeight: '500' }}>{formatDate(r.valid_until)}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '700', color: u.color }}>{r.days_remaining} 天</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── 主容器 ───
export function VoucherReportPanel() {
    const [activeTab, setActiveTab] = useState('sales');

    return (
        <div style={{ padding: '16px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: 'bold' }}>電子票券報表</h3>
            <div style={tabBarStyle}>
                {SUB_TABS.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)} style={tabBtnStyle(activeTab === t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>
            {activeTab === 'sales' && <SalesReport />}
            {activeTab === 'redemption' && <RedemptionReport />}
            {activeTab === 'salesDetail' && <DetailReport mode="sales" />}
            {activeTab === 'redemptionDetail' && <DetailReport mode="redemption" />}
            {activeTab === 'balance' && <BalanceReport />}
            {activeTab === 'expiry' && <ExpiryWarningReport />}
        </div>
    );
}
