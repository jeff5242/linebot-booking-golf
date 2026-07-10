import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

function fmtTime(iso) {
    if (!iso) return '-';
    return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function localDateStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthStartStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const tabBtn = (active) => ({
    padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: '8px',
    background: active ? '#7c3aed' : '#fff', color: active ? '#fff' : '#374151',
    cursor: 'pointer', fontSize: '14px', fontWeight: active ? '700' : '400',
});
const quickBtn = { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', color: '#0891b2', cursor: 'pointer', fontSize: '13px' };
const th = { padding: '8px 10px', textAlign: 'left', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb' };
const td = { padding: '8px 10px', fontSize: '13px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
const typeBadge = (name) => ({ padding: '1px 7px', borderRadius: '10px', fontSize: '11px', background: name === '果嶺券' ? '#dbeafe' : '#ffedd5', color: name === '果嶺券' ? '#1d4ed8' : '#c2410c' });

// 發券/用券頁：未選客人時，顯示「銷售交易 / 用券記錄」切換
export function VoucherActivityPanel() {
    const [tab, setTab] = useState('sales');
    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button onClick={() => setTab('sales')} style={tabBtn(tab === 'sales')}>🧾 銷售交易</button>
                <button onClick={() => setTab('redemptions')} style={tabBtn(tab === 'redemptions')}>✅ 用券記錄</button>
            </div>
            {tab === 'sales' ? <SalesTransactions /> : <Redemptions />}
        </div>
    );
}

// ── 銷售交易（以一筆套票交易為單位 + 核銷進度 + 可展開逐張）──
function SalesTransactions() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [expanded, setExpanded] = useState(null);
    const limit = 15;

    const fetchData = async (p = page) => {
        setLoading(true);
        try {
            const res = await adminFetch(`/api/voucher-ops/sales-transactions?page=${p}&limit=${limit}`);
            if (res.ok) setData(await res.json());
        } catch (e) {
            console.error('Sales transactions error:', e);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchData(1); }, []);

    const rows = data?.rows || [];
    const total = data?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const go = (p) => { setPage(p); setExpanded(null); fetchData(p); };

    return (
        <div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px' }}>
                {loading ? '載入中...' : `共 ${total} 筆交易（含發票 ${data?.summary?.withInvoice || 0}、舊資料 ${data?.summary?.withoutInvoice || 0}）　點一列可展開逐張券號`}
            </div>
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={th}>售出時間</th>
                            <th style={th}>客戶</th>
                            <th style={th}>電子發票</th>
                            <th style={th}>內容</th>
                            <th style={{ ...th, textAlign: 'right' }}>金額</th>
                            <th style={th}>核銷進度</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#9ca3af' }}>無交易紀錄</td></tr>
                        ) : rows.map((t) => {
                            const isOpen = expanded === t.key;
                            const gDone = t.green_fee_redeemed, gTot = t.green_fee_total;
                            const pDone = t.product_redeemed, pTot = t.product_total;
                            const allDone = (gDone + pDone) === (gTot + pTot) && (gTot + pTot) > 0;
                            const noneDone = (gDone + pDone) === 0;
                            return (
                                <React.Fragment key={t.key}>
                                    <tr onClick={() => setExpanded(isOpen ? null : t.key)} style={{ cursor: 'pointer', background: isOpen ? '#faf5ff' : '#fff' }}>
                                        <td style={{ ...td, whiteSpace: 'nowrap', color: '#6b7280' }}>{isOpen ? '▾ ' : '▸ '}{fmtTime(t.sale_time)}</td>
                                        <td style={{ ...td, fontWeight: '500' }}>{t.customer_name}{t.member_no ? <span style={{ color: '#9ca3af', fontSize: '11px' }}> #{t.member_no}</span> : ''}</td>
                                        <td style={{ ...td, fontFamily: 'monospace' }}>{t.invoice_number || '—'}</td>
                                        <td style={td}>果嶺 {gTot} + 商品 {pTot}</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: '600' }}>${t.amount.toLocaleString()}</td>
                                        <td style={td}>
                                            <span style={{ fontSize: '12px', fontWeight: '600', color: allDone ? '#16a34a' : noneDone ? '#9ca3af' : '#d97706' }}>
                                                {noneDone ? '尚未使用' : `果嶺 ${gDone}/${gTot}、商品 ${pDone}/${pTot} 已用`}
                                            </span>
                                        </td>
                                    </tr>
                                    {isOpen && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '10px 16px', background: '#faf5ff', borderBottom: '1px solid #eee' }}>
                                                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                                                    效期 {t.valid_from} ~ {t.valid_until}　·　逐張券號（共 {t.vouchers.length} 張）
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {t.vouchers.map((v, idx) => (
                                                        <span key={v.code + idx} style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '3px 8px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace',
                                                            background: v.status === 'redeemed' ? '#dcfce7' : '#fff',
                                                            border: `1px solid ${v.status === 'redeemed' ? '#86efac' : '#e5e7eb'}`,
                                                            color: v.status === 'redeemed' ? '#15803d' : '#374151',
                                                        }} title={v.status === 'redeemed' ? `已核銷 ${v.redeemed_at ? v.redeemed_at.slice(0, 16) : ''}` : '未使用'}>
                                                            <span style={typeBadge(v.product_name)}>{v.product_name === '果嶺券' ? '果' : '商'}</span>
                                                            {v.code}
                                                            {v.status === 'redeemed' && ' ✓'}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', justifyContent: 'center' }}>
                    <button onClick={() => go(page - 1)} disabled={page <= 1} style={{ ...quickBtn, opacity: page <= 1 ? 0.5 : 1 }}>上一頁</button>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>{page} / {totalPages}</span>
                    <button onClick={() => go(page + 1)} disabled={page >= totalPages} style={{ ...quickBtn, opacity: page >= totalPages ? 0.5 : 1 }}>下一頁</button>
                </div>
            )}
        </div>
    );
}

// ── 用券記錄（沿用核銷明細，voucher_ops 權限）──
function Redemptions() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [range, setRange] = useState({ start: localDateStr(-6), end: localDateStr(0) });

    const fetchData = async (r = range) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (r.start) params.set('startDate', r.start);
            if (r.end) params.set('endDate', r.end);
            const res = await adminFetch(`/api/voucher-ops/redemptions?${params}`);
            if (res.ok) setData(await res.json());
        } catch (e) {
            console.error('Redemptions error:', e);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchData(); }, []);

    const apply = (start, end) => { const r = { start, end }; setRange(r); fetchData(r); };
    const rows = data?.rows || [];
    const s = data?.summary;

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={() => apply(localDateStr(0), localDateStr(0))} style={quickBtn}>今日</button>
                <button onClick={() => apply(localDateStr(-1), localDateStr(-1))} style={quickBtn}>昨日</button>
                <button onClick={() => apply(localDateStr(-6), localDateStr(0))} style={quickBtn}>近 7 天</button>
                <button onClick={() => apply(monthStartStr(), localDateStr(0))} style={quickBtn}>本月</button>
                <input type="date" value={range.start} onChange={e => setRange({ ...range, start: e.target.value })} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }} />
                <span style={{ color: '#9ca3af' }}>～</span>
                <input type="date" value={range.end} onChange={e => setRange({ ...range, end: e.target.value })} style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px' }} />
                <button onClick={() => fetchData()} style={{ ...quickBtn, color: '#fff', background: '#2563eb', border: 'none' }}>查詢</button>
            </div>
            {s && (
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px' }}>
                    {loading ? '載入中...' : `核銷 ${s.totalCount} 張（果嶺 ${s.greenFeeCount}、商品 ${s.productCount}）　折抵 $${s.totalAmount.toLocaleString()}`}
                </div>
            )}
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={th}>核銷時間</th>
                            <th style={th}>卷號</th>
                            <th style={th}>券種</th>
                            <th style={{ ...th, textAlign: 'right' }}>金額</th>
                            <th style={th}>客戶</th>
                            <th style={th}>操作人</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#9ca3af' }}>載入中...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#9ca3af' }}>此區間無核銷紀錄</td></tr>
                        ) : rows.map((r, i) => (
                            <tr key={r.code + i}>
                                <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtTime(r.redeemed_at)}</td>
                                <td style={{ ...td, fontFamily: 'monospace', fontWeight: '600' }}>{r.code}</td>
                                <td style={td}><span style={typeBadge(r.product_name)}>{r.product_name}</span></td>
                                <td style={{ ...td, textAlign: 'right' }}>${r.price}</td>
                                <td style={td}>{r.customer_name}</td>
                                <td style={td}>{r.operator_name}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
