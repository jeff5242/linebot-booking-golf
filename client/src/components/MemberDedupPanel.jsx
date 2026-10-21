import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

const REASON_LABELS = {
    phone: '電話相近',
    name: '同名',
    'phone+name': '電話+姓名相近',
};

// 民國字串 0YYY-MM-DD → 西元顯示；非此格式原樣回傳
function rocDisplay(s) {
    if (!s || typeof s !== 'string') return '—';
    const m = s.match(/^(\d{3,4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    return `民國${Number(m[1])} (${Number(m[1]) + 1911}-${m[2]}-${m[3]})`;
}

function StatChip({ label, value, highlight }) {
    return (
        <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem',
            background: highlight ? '#ecfdf5' : '#f3f4f6', color: highlight ? '#047857' : '#4b5563',
            marginRight: '6px', marginTop: '4px',
        }}>{label} <b>{value}</b></span>
    );
}

function AccountCard({ acct, isSuggested, onKeep, disabled }) {
    return (
        <div style={{
            flex: 1, minWidth: 0, border: isSuggested ? '2px solid #10b981' : '1px solid #e5e7eb',
            borderRadius: '10px', padding: '12px', background: '#fff',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{acct.display_name || '(無名)'}</span>
                {acct.line_bound && <span style={{ fontSize: '0.7rem', background: '#06c755', color: '#fff', padding: '1px 6px', borderRadius: '8px' }}>LINE</span>}
                {isSuggested && <span style={{ fontSize: '0.7rem', background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: '8px' }}>建議保留</span>}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.7 }}>
                <div>📱 {acct.phone || '—'}</div>
                <div>🎫 會員編號：{acct.member_no || <span style={{ color: '#9ca3af' }}>無</span>}</div>
                <div>🏷️ 等級：{acct.golfer_type || <span style={{ color: '#9ca3af' }}>無</span>}</div>
                <div>📅 效期：{rocDisplay(acct.member_valid_until)}</div>
            </div>
            <div style={{ marginTop: '6px' }}>
                <StatChip label="券" value={`${acct.stats.voucher_active}/${acct.stats.voucher_total}`} highlight={acct.stats.voucher_total > 0} />
                <StatChip label="套本" value={acct.stats.package_active} highlight={acct.stats.package_active > 0} />
                <StatChip label="預約" value={acct.stats.booking_count} />
            </div>
            <button
                onClick={onKeep}
                disabled={disabled}
                style={{
                    marginTop: '10px', width: '100%', padding: '8px', borderRadius: '8px', border: 'none',
                    background: disabled ? '#d1d5db' : '#2563eb', color: '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold', fontSize: '0.85rem',
                }}
            >保留這個 · 合併另一個</button>
        </div>
    );
}

export function MemberDedupPanel() {
    const [pairs, setPairs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState(null); // { keep, remove }
    const [merging, setMerging] = useState(false);
    const [toast, setToast] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await adminFetch('/api/members/duplicate-candidates');
            if (!res.ok) throw new Error((await res.text()) || '偵測失敗');
            const data = await res.json();
            setPairs(data.pairs || []);
        } catch (err) {
            setError(err.message || '偵測失敗');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const pairKey = (p) => p.accounts.map(a => a.id).join('|');

    const doMerge = async () => {
        if (!confirm) return;
        setMerging(true);
        try {
            const res = await adminFetch('/api/members/merge', {
                method: 'POST',
                body: JSON.stringify({ keepId: confirm.keep.id, removeId: confirm.remove.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '合併失敗');
            const movedVouchers = data.moved?.vouchers || 0;
            const movedBookings = data.moved?.bookings || 0;
            setToast(`✅ 已合併：保留「${data.kept.display_name} / ${data.kept.phone}」，搬移 ${movedVouchers} 張券、${movedBookings} 筆預約，刪除重複帳號。`);
            // 從清單移除此配對
            setPairs(prev => prev.filter(p => pairKey(p) !== pairKey(confirm.pair)));
            setConfirm(null);
        } catch (err) {
            alert('合併失敗：' + err.message);
        } finally {
            setMerging(false);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>🔗 會員去重</h2>
                <button onClick={load} disabled={loading} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                    {loading ? '偵測中…' : '🔄 重新偵測'}
                </button>
                {!loading && <span style={{ color: '#6b7280' }}>疑似重複配對：<b>{pairs.length}</b> 組</span>}
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 0 }}>
                客戶綁 LINE 時若電話/姓名與原始會員差一點，會產生「同一人兩個帳號」。以下為系統偵測（電話前 7 碼相同、或同名）的疑似配對。確認是同一人後，選「保留」有會員身分/券的那個帳號合併，另一個會被刪除。
            </p>

            {toast && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                    {toast} <button onClick={() => setToast('')} style={{ marginLeft: '8px', background: 'none', border: 'none', color: '#065f46', cursor: 'pointer' }}>✕</button>
                </div>
            )}
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px' }}>{error}</div>}

            {loading && <div style={{ color: '#6b7280' }}>偵測中，請稍候…</div>}

            {!loading && pairs.length === 0 && !error && (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>🎉 目前沒有偵測到疑似重複會員</div>
            )}

            {!loading && pairs.map((p) => {
                const [a, b] = p.accounts;
                const suggested = p.suggested_keep_id;
                return (
                    <div key={pairKey(p)} style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: '14px', background: '#f9fafb' }}>
                        <div style={{ marginBottom: '10px', fontSize: '0.8rem' }}>
                            <span style={{ background: p.classic ? '#fef3c7' : '#e5e7eb', color: p.classic ? '#92400e' : '#374151', padding: '2px 8px', borderRadius: '8px' }}>
                                {REASON_LABELS[p.reason] || p.reason}{p.classic ? '・經典重複（一邊會員、一邊 LINE）' : ''}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch', flexWrap: 'wrap' }}>
                            <AccountCard acct={a} isSuggested={suggested === a.id} disabled={merging}
                                onKeep={() => setConfirm({ keep: a, remove: b, pair: p })} />
                            <div style={{ display: 'flex', alignItems: 'center', color: '#9ca3af', fontWeight: 'bold' }}>vs</div>
                            <AccountCard acct={b} isSuggested={suggested === b.id} disabled={merging}
                                onKeep={() => setConfirm({ keep: b, remove: a, pair: p })} />
                        </div>
                    </div>
                );
            })}

            {confirm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
                    <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', maxWidth: '440px', width: '100%' }}>
                        <h3 style={{ marginTop: 0 }}>確認合併帳號</h3>
                        <p style={{ lineHeight: 1.7 }}>
                            將把重複帳號<br />
                            <b style={{ color: '#b91c1c' }}>{confirm.remove.display_name} / {confirm.remove.phone}</b>
                            <span style={{ color: '#6b7280' }}>（{confirm.remove.stats.voucher_total} 張券、{confirm.remove.stats.booking_count} 預約）</span><br />
                            的資料全部搬到<br />
                            <b style={{ color: '#065f46' }}>{confirm.keep.display_name} / {confirm.keep.phone}</b><br />
                            並<b>刪除</b>前者帳號。會員身分（會員編號/等級/效期）會補到保留的帳號上。
                        </p>
                        <p style={{ color: '#b91c1c', fontSize: '0.85rem' }}>⚠️ 此動作無法自動復原，請確認兩者是同一人。</p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button onClick={() => setConfirm(null)} disabled={merging} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>取消</button>
                            <button onClick={doMerge} disabled={merging} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#dc2626', color: '#fff', cursor: merging ? 'wait' : 'pointer', fontWeight: 'bold' }}>
                                {merging ? '合併中…' : '確定合併'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MemberDedupPanel;
