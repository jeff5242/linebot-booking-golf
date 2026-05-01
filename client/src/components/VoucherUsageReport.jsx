import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

const MONTHS = [
    { key: '07', label: '114.07月' },
    { key: '08', label: '114.08月' },
    { key: '09', label: '114.09月' },
    { key: '10', label: '114.10月' },
    { key: '11', label: '114.11月' },
    { key: '12', label: '114.12月' },
];

function formatROCDate(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    const rocYear = parseInt(y) - 1911;
    return `${rocYear}/${m}/${d}`;
}

export function VoucherUsageReport() {
    const [type, setType] = useState('green_fee');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all'); // all, used, unused
    const pageSize = 50;

    const fetchReport = async (voucherType) => {
        try {
            setLoading(true);
            const res = await adminFetch(`/api/reports/voucher-usage?type=${voucherType}`);
            const json = await res.json();
            setData(json);
            setPage(1);
        } catch (err) {
            console.error('Report fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReport(type);
    }, [type]);

    const filteredRows = (data?.rows || []).filter(row => {
        if (filter === 'used' && row.unused) return false;
        if (filter === 'unused' && !row.unused) return false;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            return (
                (row.ticket_number || '').includes(q) ||
                (row.customer_name || '').toLowerCase().includes(q) ||
                (row.phone || '').includes(q) ||
                (row.invoice_number || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    const totalPages = Math.ceil(filteredRows.length / pageSize);
    const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

    const exportExcel = () => {
        if (!data?.rows?.length) return;
        const rows = data.rows;
        const typeName = type === 'product' ? '商品券' : '果嶺券';
        const faceValue = type === 'product' ? '100' : '200';

        let csv = '\uFEFF'; // BOM for Excel
        csv += `大衛營球場 ${faceValue}元${typeName}使用明細\n\n`;
        csv += '序號,銷售日期,發票號碼,' + typeName + '編號,票券面額,購買人,手機,';
        csv += MONTHS.map(m => `${m.label}消費日期,${m.label}抵用金額`).join(',');
        csv += ',未使用券號,未使用金額\n';

        for (const r of rows) {
            const cols = [
                r.seq,
                formatROCDate(r.purchase_date),
                r.invoice_number,
                r.ticket_number,
                r.face_value || '',
                r.customer_name || '',
                r.phone || '',
            ];
            for (const m of MONTHS) {
                const dateKey = `m${m.key}_date`;
                const amtKey = `m${m.key}_amount`;
                cols.push(r[dateKey] ? formatROCDate(r[dateKey]) : '');
                cols.push(r[amtKey] != null ? r[amtKey] : '');
            }
            cols.push(r.unused ? r.ticket_number : '');
            cols.push(r.unused_amount != null ? r.unused_amount : '');
            csv += cols.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',') + '\n';
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${typeName}使用明細報表.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const summary = data?.summary;

    return (
        <div style={{ padding: '16px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: 'bold' }}>票券使用明細報表</h3>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                    value={type}
                    onChange={e => setType(e.target.value)}
                    style={selectStyle}
                >
                    <option value="green_fee">果嶺券 ($200)</option>
                    <option value="product">商品券 ($100)</option>
                </select>
                <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} style={selectStyle}>
                    <option value="all">全部票券</option>
                    <option value="used">已使用</option>
                    <option value="unused">未使用</option>
                </select>
                <input
                    type="text"
                    placeholder="搜尋券號/姓名/手機/發票..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '200px' }}
                />
                <button onClick={exportExcel} disabled={!data?.rows?.length} style={btnStyle}>
                    匯出 CSV
                </button>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                    {loading ? '載入中...' : `共 ${filteredRows.length} 張`}
                </span>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <SummaryCard label="總發行" value={summary.totalTickets} unit="張" color="#2563eb" />
                    <SummaryCard label="已使用" value={summary.usedTickets} unit="張" color="#16a34a" />
                    <SummaryCard label="未使用" value={summary.unusedTickets} unit="張" color="#dc2626" />
                    {MONTHS.map(m => {
                        const count = summary.usedByMonth?.[parseInt(m.key)] || 0;
                        return count > 0 ? (
                            <SummaryCard key={m.key} label={m.label} value={count} unit="張" color="#7c3aed" />
                        ) : null;
                    })}
                </div>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f0fdf4' }}>
                            <th style={thStyle} rowSpan={2}>序號</th>
                            <th style={thStyle} rowSpan={2}>銷售日期</th>
                            <th style={thStyle} rowSpan={2}>發票號碼</th>
                            <th style={thStyle} rowSpan={2}>{type === 'product' ? '商品券' : '果嶺券'}編號</th>
                            <th style={thStyle} rowSpan={2}>票券面額</th>
                            <th style={thStyle} rowSpan={2}>購買人</th>
                            {MONTHS.map(m => (
                                <th key={m.key} style={{ ...thStyle, textAlign: 'center', backgroundColor: '#ecfdf5' }} colSpan={2}>{m.label}</th>
                            ))}
                            <th style={{ ...thStyle, textAlign: 'center', backgroundColor: '#fef2f2' }} colSpan={2}>114.12月31日止</th>
                        </tr>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                            {MONTHS.map(m => (
                                <React.Fragment key={m.key}>
                                    <th style={subThStyle}>消費日期</th>
                                    <th style={subThStyle}>抵用金額</th>
                                </React.Fragment>
                            ))}
                            <th style={{ ...subThStyle, backgroundColor: '#fef2f2' }}>未使用券號</th>
                            <th style={{ ...subThStyle, backgroundColor: '#fef2f2' }}>未使用金額</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={19} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : pageRows.length === 0 ? (
                            <tr><td colSpan={19} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>無資料</td></tr>
                        ) : pageRows.map((row, i) => (
                            <tr key={row.seq} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: row.unused ? '#fff' : '#f0fdf4' }}>
                                <td style={tdStyle}>{row.seq}</td>
                                <td style={tdStyle}>{formatROCDate(row.purchase_date)}</td>
                                <td style={{ ...tdStyle, fontSize: '11px' }}>{row.invoice_number}</td>
                                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 'bold' }}>{row.ticket_number}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{row.face_value}</td>
                                <td style={tdStyle}>{row.customer_name}</td>
                                {MONTHS.map(m => {
                                    const dateKey = `m${m.key}_date`;
                                    const amtKey = `m${m.key}_amount`;
                                    return (
                                        <React.Fragment key={m.key}>
                                            <td style={{ ...tdStyle, color: '#16a34a', fontSize: '11px' }}>
                                                {row[dateKey] ? formatROCDate(row[dateKey]) : ''}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: 'right', color: '#16a34a' }}>
                                                {row[amtKey] != null ? row[amtKey] : ''}
                                            </td>
                                        </React.Fragment>
                                    );
                                })}
                                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#dc2626' }}>
                                    {row.unused ? row.ticket_number : ''}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626', fontWeight: row.unused ? 'bold' : 'normal' }}>
                                    {row.unused_amount != null ? row.unused_amount : ''}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={pageBtnStyle(page <= 1)}>上一頁</button>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>{page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={pageBtnStyle(page >= totalPages)}>下一頁</button>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ label, value, unit, color }) {
    return (
        <div style={{
            padding: '12px 16px', borderRadius: '8px', border: '1px solid #e5e7eb',
            backgroundColor: '#fff', minWidth: '100px', textAlign: 'center'
        }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color }}>{value.toLocaleString()}</div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{unit}</div>
        </div>
    );
}

const selectStyle = {
    padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px',
    fontSize: '14px', backgroundColor: '#fff',
};
const btnStyle = {
    padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
};
const thStyle = { padding: '8px 6px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap', borderBottom: '2px solid #d1d5db' };
const subThStyle = { padding: '6px', textAlign: 'center', fontWeight: '500', fontSize: '11px', whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb' };
const tdStyle = { padding: '6px', verticalAlign: 'middle', whiteSpace: 'nowrap' };
const pageBtnStyle = (disabled) => ({
    padding: '6px 14px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '6px',
    backgroundColor: disabled ? '#f3f4f6' : '#fff', color: disabled ? '#9ca3af' : '#374151',
    cursor: disabled ? 'default' : 'pointer',
});
