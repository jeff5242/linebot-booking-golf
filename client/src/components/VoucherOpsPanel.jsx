import React, { useState, useEffect, useRef } from 'react';
import { adminFetch, hasPermission } from '../utils/adminApi';

const VOUCHER_TYPE_LABELS = {
    green_fee: '果嶺券',
    product: '商品券',
};

const ACTION_LABELS = {
    issued: { text: '發券', color: '#2563eb', bg: '#eff6ff' },
    redeemed: { text: '核銷', color: '#dc2626', bg: '#fef2f2' },
    voided: { text: '作廢', color: '#6b7280', bg: '#f9fafb' },
    reversed: { text: '撤銷核銷', color: '#d97706', bg: '#fffbeb' },
    extended: { text: '修改到期日', color: '#059669', bg: '#ecfdf5' },
};

export function VoucherOpsPanel({ preSelectedUser }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedUser, setSelectedUser] = useState(preSelectedUser || null);
    const [customerData, setCustomerData] = useState(null);
    const [loading, setLoading] = useState(false);

    const [modal, setModal] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [historyPage, setHistoryPage] = useState(1);
    const [showSettings, setShowSettings] = useState(false);
    const [issueSettings, setIssueSettings] = useState(null);

    const searchTimerRef = useRef(null);
    const barcodeBufferRef = useRef('');
    const barcodeTimerRef = useRef(null);

    useEffect(() => {
        adminFetch('/api/voucher-ops/settings')
            .then(r => r.json())
            .then(data => setIssueSettings(data))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const BARCODE_MAX_INTERVAL = 80;
        const BARCODE_MIN_LENGTH = 6;

        const handleKeyDown = (e) => {
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            if (e.key === 'Enter' && barcodeBufferRef.current.length >= BARCODE_MIN_LENGTH) {
                const scanned = barcodeBufferRef.current;
                barcodeBufferRef.current = '';
                clearTimeout(barcodeTimerRef.current);

                let phone = scanned;
                try {
                    const json = JSON.parse(scanned);
                    if (json.phone) phone = json.phone;
                } catch {}

                handleBarcodeScan(phone);
                return;
            }

            if (e.key.length === 1) {
                clearTimeout(barcodeTimerRef.current);
                barcodeBufferRef.current += e.key;
                barcodeTimerRef.current = setTimeout(() => {
                    barcodeBufferRef.current = '';
                }, BARCODE_MAX_INTERVAL);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleBarcodeScan = async (phone) => {
        setLoading(true);
        try {
            const res = await adminFetch(`/api/voucher-ops/search-users?q=${encodeURIComponent(phone)}`);
            const data = await res.json();
            const users = data.users || [];
            const match = users.find(u => u.phone === phone) || users[0];
            if (match) {
                selectUser(match);
            } else {
                alert(`查無用戶：${phone}`);
                setLoading(false);
            }
        } catch {
            alert('條碼查詢失敗');
            setLoading(false);
        }
    };

    useEffect(() => {
        if (preSelectedUser) {
            selectUser(preSelectedUser);
        }
    }, [preSelectedUser]);

    const handleSearch = (q) => {
        setSearchQuery(q);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (!q.trim()) {
            setSearchResults([]);
            return;
        }
        searchTimerRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await adminFetch(`/api/voucher-ops/search-users?q=${encodeURIComponent(q.trim())}`);
                const data = await res.json();
                setSearchResults(data.users || []);
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
    };

    const safeJson = async (res, label) => {
        if (!res.ok) {
            const text = await res.text();
            throw new Error(text.startsWith('<') ? `${label}：伺服器回應 ${res.status}，請確認後端已部署` : text);
        }
        return res.json();
    };

    const selectUser = async (user) => {
        setSelectedUser(user);
        setSearchQuery('');
        setSearchResults([]);
        setLoading(true);
        try {
            const res = await adminFetch(`/api/voucher-ops/customer/${user.id}`);
            const data = await safeJson(res, '載入客人資料');
            setCustomerData(data);
            fetchHistory(user.id, 1);
        } catch (err) {
            alert('載入客人資料失敗: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async (userId, page = 1) => {
        try {
            const res = await adminFetch(`/api/voucher-ops/history?user_id=${userId}&page=${page}&limit=10`);
            const data = await res.json();
            setHistory(data.logs || []);
            setHistoryTotal(data.total || 0);
            setHistoryPage(page);
        } catch {
            setHistory([]);
        }
    };

    const refreshCustomerData = () => {
        if (selectedUser) selectUser(selectedUser);
    };

    const openIssueModal = (voucherType) => {
        setModal({ type: 'issue', voucherType, quantity: '' });
    };

    const openRedeemModal = (voucherType) => {
        setModal({ type: 'redeem', voucherType, quantity: '' });
    };

    const openReverseRedeemModal = (voucherType) => {
        setModal({ type: 'reverse_redeem', voucherType, quantity: '', reason: '' });
    };

    const openCancelAllModal = () => {
        setModal({ type: 'cancel_all', reason: '' });
    };

    const openExpiryModal = async () => {
        const currentExpiry = customerData?.validUntil ? customerData.validUntil.slice(0, 10) : '';
        const currentStart = customerData?.validFrom ? customerData.validFrom.slice(0, 10) : '';
        setModal({ type: 'update_expiry', validFrom: currentStart, validUntil: currentExpiry, reason: '', paperExpiry: null, loadingPaper: true });
        try {
            const res = await adminFetch(`/api/voucher-ops/paper-expiry/${selectedUser.id}`);
            const data = await res.json();
            setModal(prev => prev ? { ...prev, paperExpiry: data.paperExpiry, loadingPaper: false } : prev);
        } catch {
            setModal(prev => prev ? { ...prev, loadingPaper: false } : prev);
        }
    };

    const handleUpdateExpiry = async () => {
        if (!modal.validFrom && !modal.validUntil) return alert('請至少選擇啟用日或到期日');
        if (modal.validFrom && modal.validUntil && modal.validFrom > modal.validUntil) return alert('啟用日不可晚於到期日');
        if (!confirm(`確定要將此客人所有電子票券的效期修改為\n啟用日：${modal.validFrom || '（不變）'}\n到期日：${modal.validUntil || '（不變）'} 嗎？`)) return;
        try {
            const res = await adminFetch('/api/voucher-ops/update-expiry', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: selectedUser.id,
                    valid_from: modal.validFrom || undefined,
                    valid_until: modal.validUntil || undefined,
                    reason: modal.reason || undefined,
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setModal(null);
                refreshCustomerData();
            } else {
                alert('修改失敗: ' + data.error);
            }
        } catch (err) {
            alert('修改失敗: ' + err.message);
        }
    };

    const handleReverseRedeem = async () => {
        const qty = parseInt(modal.quantity);
        if (!qty || qty < 1) return alert('請輸入張數');
        const label = VOUCHER_TYPE_LABELS[modal.voucherType];
        if (!confirm(`確定要撤銷核銷 ${qty} 張${label}嗎？\n撤銷後券會恢復為可用狀態`)) return;
        try {
            const res = await adminFetch('/api/voucher-ops/reverse-redeem', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: selectedUser.id,
                    voucher_type: modal.voucherType,
                    quantity: qty,
                    reason: modal.reason || undefined,
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setModal(null);
                refreshCustomerData();
            } else {
                alert('撤銷失敗: ' + data.error);
            }
        } catch (err) {
            alert('撤銷失敗: ' + err.message);
        }
    };

    const handleCancelAll = async () => {
        if (!modal.reason.trim()) return alert('請輸入退券原因');
        const greenActive = summary?.green_fee?.active || 0;
        const greenRedeemed = summary?.green_fee?.redeemed || 0;
        const prodActive = summary?.product?.active || 0;
        const prodRedeemed = summary?.product?.redeemed || 0;
        const total = greenActive + greenRedeemed + prodActive + prodRedeemed;
        if (!confirm(`確定要退券（全部作廢）嗎？\n\n將作廢所有可用及已核銷的券共 ${total} 張\n（果嶺券：可用${greenActive}+已核銷${greenRedeemed}，商品券：可用${prodActive}+已核銷${prodRedeemed}）\n\n此操作無法復原！`)) return;
        try {
            const res = await adminFetch('/api/voucher-ops/cancel-all', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: selectedUser.id,
                    reason: modal.reason,
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setModal(null);
                refreshCustomerData();
            } else {
                alert('退券失敗: ' + data.error);
            }
        } catch (err) {
            alert('退券失敗: ' + err.message);
        }
    };

    const handleIssue = async () => {
        const qty = parseInt(modal.quantity);
        if (!qty || qty < 1) return alert('請輸入正確的張數');
        try {
            const res = await adminFetch('/api/voucher-ops/issue', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: selectedUser.id,
                    voucher_type: modal.voucherType,
                    quantity: qty,
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setModal(null);
                refreshCustomerData();
            } else {
                alert('發券失敗: ' + data.error);
            }
        } catch (err) {
            alert('發券失敗: ' + err.message);
        }
    };

    const handleRedeem = async () => {
        const qty = parseInt(modal.quantity);
        if (!qty || qty < 1) return alert('請輸入使用張數');
        const label = VOUCHER_TYPE_LABELS[modal.voucherType];
        const unitPrice = modal.voucherType === 'green_fee' ? (issueSettings?.green_fee?.unit_price ?? 200) : (issueSettings?.product?.unit_price ?? 100);
        if (!confirm(`確定要核銷 ${qty} 張${label}嗎？\n折抵金額：$${qty * unitPrice}`)) return;
        try {
            const res = await adminFetch('/api/voucher-ops/redeem', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: selectedUser.id,
                    voucher_type: modal.voucherType,
                    quantity: qty,
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message);
                setModal(null);
                refreshCustomerData();
            } else {
                alert('核銷失敗: ' + data.error);
            }
        } catch (err) {
            alert('核銷失敗: ' + err.message);
        }
    };

    const summary = customerData?.summary;

    return (
        <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: 0 }}>發券 / 用券</h3>
                {hasPermission('settings') && (
                    <button onClick={() => setShowSettings(true)} style={settingsBtnStyle} title="發券設定">
                        ⚙️ 設定
                    </button>
                )}
            </div>

            {/* Search */}
            <div style={{ marginBottom: '20px', position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="搜尋客人（姓名 / 電話 / 會員編號）..."
                        value={searchQuery}
                        onChange={e => handleSearch(e.target.value)}
                        style={inputStyle}
                    />
                    {searching && <span style={{ fontSize: '13px', color: '#9ca3af' }}>搜尋中...</span>}
                </div>
                {searchResults.length > 0 && (
                    <div style={dropdownStyle}>
                        {searchResults.map(u => (
                            <div
                                key={u.id}
                                onClick={() => selectUser(u)}
                                style={dropdownItemStyle}
                            >
                                <span style={{ fontWeight: 'bold' }}>{u.display_name || '-'}</span>
                                <span style={{ color: '#6b7280', fontSize: '13px' }}>{u.phone}</span>
                                {u.member_no && <span style={{ color: '#9ca3af', fontSize: '12px' }}>{u.member_no}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Selected User Info */}
            {selectedUser && (
                <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{selectedUser.display_name || '-'}</span>
                            <span style={{ marginLeft: '12px', color: '#6b7280' }}>{selectedUser.phone}</span>
                            {selectedUser.member_no && <span style={{ marginLeft: '12px', color: '#9ca3af', fontSize: '13px' }}>#{selectedUser.member_no}</span>}
                        </div>
                        <button onClick={() => { setSelectedUser(null); setCustomerData(null); setHistory([]); }} style={linkBtnStyle}>
                            切換客人
                        </button>
                    </div>
                </div>
            )}

            {/* Expiry Info */}
            {customerData && !loading && (summary?.green_fee?.active > 0 || summary?.product?.active > 0 || summary?.green_fee?.redeemed > 0 || summary?.product?.redeemed > 0) && (
                <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span style={{ fontSize: '14px', color: '#374151' }}>票券效期：</span>
                        <span style={{ fontWeight: 'bold', fontSize: '14px', color: customerData.validUntil ? '#059669' : '#9ca3af' }}>
                            {customerData.validFrom ? customerData.validFrom.slice(0, 10) : '未設定'} ～ {customerData.validUntil ? customerData.validUntil.slice(0, 10) : '未設定'}
                        </span>
                    </div>
                    <button onClick={openExpiryModal} style={{ padding: '6px 14px', border: '1px solid #059669', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: '#fff', color: '#059669', fontWeight: '500' }}>
                        修改效期
                    </button>
                </div>
            )}

            {loading && <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>載入中...</div>}

            {/* Package Issue */}
            {summary && !loading && (
                <PackageIssueSection
                    userId={selectedUser?.id}
                    onIssued={refreshCustomerData}
                    settings={issueSettings}
                />
            )}

            {/* Voucher Summary Cards */}
            {summary && !loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <VoucherCard
                        title="果嶺券"
                        color="#1d4ed8"
                        onReverseRedeem={() => openReverseRedeemModal('green_fee')}
                        bg="#eff6ff"
                        summary={summary.green_fee}
                        unitPrice={issueSettings?.green_fee?.unit_price ?? 200}
                        onIssue={() => openIssueModal('green_fee')}
                        onRedeem={() => openRedeemModal('green_fee')}
                        canRedeem={hasPermission('redeem_green_fee')}
                    />
                    <VoucherCard
                        title="商品券"
                        color="#166534"
                        bg="#f0fdf4"
                        summary={summary.product}
                        unitPrice={issueSettings?.product?.unit_price ?? 100}
                        onIssue={() => openIssueModal('product')}
                        onRedeem={() => openRedeemModal('product')}
                        onReverseRedeem={() => openReverseRedeemModal('product')}
                    />
                </div>
            )}

            {/* Cancel All Button */}
            {summary && !loading && (summary.green_fee.active > 0 || summary.green_fee.redeemed > 0 || summary.product.active > 0 || summary.product.redeemed > 0) && (
                <div style={{ marginBottom: '24px', textAlign: 'right' }}>
                    <button onClick={openCancelAllModal} style={{ padding: '8px 16px', border: '1px solid #dc2626', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: '#fff', color: '#dc2626', fontWeight: '500' }}>
                        全部退券（作廢）
                    </button>
                </div>
            )}

            {/* History */}
            {selectedUser && !loading && (
                <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '10px', color: '#374151' }}>操作紀錄</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                <th style={thStyle}>時間</th>
                                <th style={thStyle}>動作</th>
                                <th style={thStyle}>券種</th>
                                <th style={thStyle}>操作人</th>
                                <th style={thStyle}>備註</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '16px', color: '#9ca3af' }}>無紀錄</td></tr>
                            ) : history.map((log, i) => {
                                const action = ACTION_LABELS[log.action] || { text: log.action, color: '#374151', bg: '#f9fafb' };
                                return (
                                    <tr key={log.id || i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={tdStyle}>{formatTime(log.created_at)}</td>
                                        <td style={tdStyle}>
                                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', color: action.color, backgroundColor: action.bg }}>
                                                {action.text}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>{log.vouchers?.product_name || '-'}</td>
                                        <td style={tdStyle}>{log.operator_name || '-'}</td>
                                        <td style={{ ...tdStyle, maxWidth: '200px', fontSize: '12px', color: '#6b7280' }}>{log.memo || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {historyTotal > 10 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                            <button onClick={() => fetchHistory(selectedUser.id, historyPage - 1)} disabled={historyPage <= 1} style={pageBtnStyle(historyPage <= 1)}>上一頁</button>
                            <span style={{ fontSize: '13px', color: '#6b7280', lineHeight: '32px' }}>{historyPage} / {Math.ceil(historyTotal / 10)}</span>
                            <button onClick={() => fetchHistory(selectedUser.id, historyPage + 1)} disabled={historyPage >= Math.ceil(historyTotal / 10)} style={pageBtnStyle(historyPage >= Math.ceil(historyTotal / 10))}>下一頁</button>
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            {modal && <ModalOverlay onClose={() => setModal(null)}>
                {modal.type === 'issue' && (
                    <IssueModal
                        voucherType={modal.voucherType}
                        quantity={modal.quantity}
                        unitPrice={modal.voucherType === 'green_fee' ? (issueSettings?.green_fee?.unit_price ?? 200) : (issueSettings?.product?.unit_price ?? 100)}
                        userName={selectedUser?.display_name}
                        onQuantityChange={q => setModal(prev => ({ ...prev, quantity: q }))}
                        onConfirm={handleIssue}
                        onCancel={() => setModal(null)}
                    />
                )}
                {modal.type === 'redeem' && (
                    <RedeemModal
                        voucherType={modal.voucherType}
                        available={modal.voucherType === 'green_fee' ? summary?.green_fee?.active || 0 : summary?.product?.active || 0}
                        quantity={modal.quantity}
                        unitPrice={modal.voucherType === 'green_fee' ? (issueSettings?.green_fee?.unit_price ?? 200) : (issueSettings?.product?.unit_price ?? 100)}
                        userName={selectedUser?.display_name}
                        onQuantityChange={q => setModal(prev => ({ ...prev, quantity: q }))}
                        onConfirm={handleRedeem}
                        onCancel={() => setModal(null)}
                    />
                )}
                {modal.type === 'reverse_redeem' && (
                    <ReverseRedeemModal
                        voucherType={modal.voucherType}
                        redeemed={modal.voucherType === 'green_fee' ? summary?.green_fee?.redeemed || 0 : summary?.product?.redeemed || 0}
                        quantity={modal.quantity}
                        reason={modal.reason}
                        userName={selectedUser?.display_name}
                        onQuantityChange={q => setModal(prev => ({ ...prev, quantity: q }))}
                        onReasonChange={r => setModal(prev => ({ ...prev, reason: r }))}
                        onConfirm={handleReverseRedeem}
                        onCancel={() => setModal(null)}
                    />
                )}
                {modal.type === 'cancel_all' && (
                    <CancelAllModal
                        userName={selectedUser?.display_name}
                        summary={summary}
                        reason={modal.reason}
                        onReasonChange={r => setModal(prev => ({ ...prev, reason: r }))}
                        onConfirm={handleCancelAll}
                        onCancel={() => setModal(null)}
                    />
                )}
                {modal.type === 'update_expiry' && (
                    <ExpiryModal
                        userName={selectedUser?.display_name}
                        validFrom={modal.validFrom}
                        validUntil={modal.validUntil}
                        reason={modal.reason}
                        paperExpiry={modal.paperExpiry}
                        loadingPaper={modal.loadingPaper}
                        onFromChange={d => setModal(prev => ({ ...prev, validFrom: d }))}
                        onDateChange={d => setModal(prev => ({ ...prev, validUntil: d }))}
                        onReasonChange={r => setModal(prev => ({ ...prev, reason: r }))}
                        onConfirm={handleUpdateExpiry}
                        onCancel={() => setModal(null)}
                    />
                )}
            </ModalOverlay>}

            {showSettings && (
                <SettingsModal
                    settings={issueSettings}
                    onSave={(updated) => { setIssueSettings(updated); setShowSettings(false); }}
                    onClose={() => setShowSettings(false)}
                />
            )}
        </div>
    );
}

function VoucherCard({ title, color, bg, summary, unitPrice, onIssue, onRedeem, onReverseRedeem, canRedeem = true }) {
    return (
        <div style={{ border: `1px solid ${color}33`, borderRadius: '10px', padding: '16px', background: bg }}>
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color, marginBottom: '12px' }}>{title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                <StatItem label="可用" value={summary.active} color="#2563eb" />
                <StatItem label="已用" value={summary.redeemed} color="#dc2626" />
                <StatItem label="作廢" value={summary.voided} color="#6b7280" />
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '14px' }}>
                總計 {summary.total} 張 / 面額 ${unitPrice}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
                {canRedeem ? (
                    <button onClick={onRedeem} disabled={summary.active === 0} style={{ ...actionBtnStyle, background: summary.active > 0 ? '#dc2626' : '#d1d5db', color: '#fff' }}>用券</button>
                ) : (
                    <button disabled title="果嶺券僅限發球台核銷" style={{ ...actionBtnStyle, background: '#d1d5db', color: '#6b7280', cursor: 'not-allowed' }}>限發球台核銷</button>
                )}
                {summary.redeemed > 0 && (
                    <button onClick={onReverseRedeem} style={{ ...actionBtnStyle, background: '#fff', border: '1px solid #d97706', color: '#d97706' }}>撤銷核銷</button>
                )}
            </div>
        </div>
    );
}

function StatItem({ label, value, color }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color }}>{value}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
        </div>
    );
}

const DEFAULT_PACKAGES = [
    { name: 'A 套本 $6,600', price: 6600, green_fee: 18, product: 30 },
    { name: 'B 套本 $2,800', price: 2800, green_fee: 9, product: 10 },
];

function PackageIssueSection({ userId, onIssued, settings }) {
    const PACKAGES = settings?.packages || DEFAULT_PACKAGES;
    const validityYears = settings?.validity_years ?? 1;
    const gfPrice = settings?.green_fee?.unit_price ?? 200;
    const pdPrice = settings?.product?.unit_price ?? 100;
    const MIN_RENEWAL_MONTHS = 9;
    const EXPIRY_MONTHS = 13;
    const GRACE_MONTHS = 1;
    const [issuing, setIssuing] = useState(false);
    const [showPackageModal, setShowPackageModal] = useState(null);
    const [lastPurchaseDate, setLastPurchaseDate] = useState(null);
    const [customStartDate, setCustomStartDate] = useState('');
    const [loadingDate, setLoadingDate] = useState(false);
    const [renewalStatus, setRenewalStatus] = useState(null);
    const [packageStatus, setPackageStatus] = useState(null);

    const openPackageModal = async (pkgIndex) => {
        setShowPackageModal(pkgIndex);
        setLoadingDate(true);
        setRenewalStatus(null);
        setPackageStatus(null);
        let ps = null;
        try {
            // 套本購買狀態（是否已有 active 套本 / 可否續約 / 建議起始日）
            try {
                const psRes = await adminFetch(`/api/voucher-ops/package-status/${userId}`);
                ps = await psRes.json();
                setPackageStatus(ps);
                if (ps.hasActive && ps.canIssue && ps.suggestedStartDate) {
                    setCustomStartDate(ps.suggestedStartDate);
                }
            } catch { /* 狀態查詢失敗不擋開窗，後端發券時仍會把關 */ }

            const res = await adminFetch(`/api/voucher-ops/last-purchase/${userId}`);
            const data = await res.json();
            setLastPurchaseDate(data.lastPurchaseDate);
            if (data.lastPurchaseDate) {
                const last = new Date(data.lastPurchaseDate);
                const today = new Date();

                const addMonths = (d, m) => { const r = new Date(d); r.setMonth(r.getMonth() + m); return r; };
                const renewableDate = addMonths(last, MIN_RENEWAL_MONTHS);
                const expiryDate = addMonths(last, EXPIRY_MONTHS);
                const suspendDate = addMonths(last, EXPIRY_MONTHS + GRACE_MONTHS);

                if (today < renewableDate) {
                    setRenewalStatus({ type: 'too_early', date: renewableDate.toISOString().slice(0, 10) });
                } else if (today >= suspendDate) {
                    setRenewalStatus({ type: 'suspended', date: suspendDate.toISOString().slice(0, 10), expiryDate: expiryDate.toISOString().slice(0, 10) });
                } else if (today >= expiryDate) {
                    setRenewalStatus({ type: 'grace', expiryDate: expiryDate.toISOString().slice(0, 10), deadline: suspendDate.toISOString().slice(0, 10) });
                }

                // 起始日以後端 package-status 的建議（舊套本到期日）為準；沒有才用推算
                if (!(ps?.hasActive && ps?.suggestedStartDate)) {
                    const next = new Date(last.getTime() + validityYears * 365.25 * 24 * 60 * 60 * 1000);
                    setCustomStartDate(next.toISOString().slice(0, 10));
                }
            } else {
                setCustomStartDate(new Date().toISOString().slice(0, 10));
            }
        } catch {
            setCustomStartDate(new Date().toISOString().slice(0, 10));
        } finally {
            setLoadingDate(false);
        }
    };

    const handleIssuePackage = async () => {
        const pkg = PACKAGES[showPackageModal];
        if (!confirm(`確定要發出「${pkg.name}」嗎？\n果嶺券 ${pkg.green_fee} 張 + 商品券 ${pkg.product} 張\n起始日：${customStartDate}`)) return;
        setIssuing(true);
        try {
            const res = await adminFetch('/api/voucher-ops/issue-package', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: userId,
                    package_index: showPackageModal,
                    valid_from: customStartDate,
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert(data.message + `\n效期：${data.validFrom} ~ ${data.validUntil}`);
                setShowPackageModal(null);
                onIssued();
            } else {
                alert('發券失敗: ' + data.error);
            }
        } catch (err) {
            alert('發券失敗: ' + err.message);
        } finally {
            setIssuing(false);
        }
    };

    return (
        <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {PACKAGES.map((pkg, i) => (
                    <button
                        key={i}
                        onClick={() => openPackageModal(i)}
                        style={{ padding: '10px 20px', border: '2px solid #7c3aed', borderRadius: '8px', background: '#f5f3ff', color: '#7c3aed', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}
                    >
                        📦 {pkg.name}
                    </button>
                ))}
            </div>

            {showPackageModal !== null && (
                <ModalOverlay onClose={() => setShowPackageModal(null)}>
                    <div>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>套本發券 - {PACKAGES[showPackageModal].name}</h3>
                        <div style={{ padding: '12px', background: '#f5f3ff', borderRadius: '8px', marginBottom: '16px' }}>
                            <div style={{ marginBottom: '6px' }}>果嶺券：<b>{PACKAGES[showPackageModal].green_fee}</b> 張 x ${gfPrice} = <b>${PACKAGES[showPackageModal].green_fee * gfPrice}</b></div>
                            <div>商品券：<b>{PACKAGES[showPackageModal].product}</b> 張 x ${pdPrice} = <b>${PACKAGES[showPackageModal].product * pdPrice}</b></div>
                            <div style={{ marginTop: '8px', borderTop: '1px solid #ddd6fe', paddingTop: '8px', fontWeight: 'bold' }}>總計：${PACKAGES[showPackageModal].price}</div>
                        </div>

                        {loadingDate ? (
                            <div style={{ color: '#9ca3af', marginBottom: '16px' }}>查詢上次購買日期...</div>
                        ) : (packageStatus?.hasActive && !packageStatus?.canIssue) ? (
                            <div style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '16px' }}>
                                <div style={{ color: '#dc2626', fontWeight: '600', marginBottom: '6px' }}>已購買套本，不可重複購買</div>
                                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                    目前套本：<b>{packageStatus.activePackage?.package_name}</b><br />
                                    效期：{packageStatus.activePackage?.valid_from} ~ {packageStatus.activePackage?.valid_until}<br />
                                    {packageStatus.reason}<br />
                                    如需更換，請先於下方「全部退券」後再購買。
                                </div>
                            </div>
                        ) : renewalStatus?.type === 'suspended' ? (
                            <div style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '16px' }}>
                                <div style={{ color: '#dc2626', fontWeight: '600', marginBottom: '6px' }}>會員已停權</div>
                                <div style={{ fontSize: '13px', color: '#6b7280' }}>
                                    上次購買日期：{lastPurchaseDate}<br />
                                    會員過期日：{renewalStatus.expiryDate}（購買後 {EXPIRY_MONTHS} 個月）<br />
                                    續約寬限期已於 <b>{renewalStatus.date}</b> 截止<br />
                                    該用戶已無白金會員資格，僅能使用來賓卡
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginBottom: '16px' }}>
                                {packageStatus?.hasActive && packageStatus?.canIssue && (
                                    <div style={{ padding: '10px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: '#6d28d9' }}>
                                        續約：舊套本「{packageStatus.activePackage?.package_name}」於 <b>{packageStatus.activePackage?.valid_until}</b> 到期，新券將從該日起算 {validityYears} 年
                                    </div>
                                )}
                                {lastPurchaseDate && (
                                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                                        上次購買日期：{lastPurchaseDate}（+{validityYears}年 = {customStartDate}）
                                    </div>
                                )}
                                {renewalStatus?.type === 'too_early' && (
                                    <div style={{ padding: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: '#1e40af' }}>
                                        提前續約：新券效期將從舊券到期日（{customStartDate}）起算 {validityYears} 年
                                    </div>
                                )}
                                {renewalStatus?.type === 'grace' && (
                                    <div style={{ padding: '10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: '#92400e' }}>
                                        會員已於 {renewalStatus.expiryDate} 過期，寬限期至 <b>{renewalStatus.deadline}</b>，請儘速續約
                                    </div>
                                )}
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>效期起始日</label>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={e => setCustomStartDate(e.target.value)}
                                    readOnly={packageStatus?.hasActive && packageStatus?.canIssue}
                                    style={{ ...inputStyle, width: '100%', ...(packageStatus?.hasActive && packageStatus?.canIssue ? { background: '#f3f4f6', color: '#6b7280' } : {}) }}
                                />
                                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                                    {packageStatus?.hasActive && packageStatus?.canIssue
                                        ? `續約起始日由系統鎖定為舊套本到期日（${customStartDate}），效期 ${validityYears} 年`
                                        : `效期 ${validityYears} 年（可調整起始日）`}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button onClick={() => setShowPackageModal(null)} style={cancelBtnStyle}>取消</button>
                            {(() => {
                                const blocked = renewalStatus?.type === 'suspended' || (packageStatus?.hasActive && !packageStatus?.canIssue);
                                return (
                                    <button
                                        onClick={handleIssuePackage}
                                        disabled={issuing || blocked}
                                        style={{
                                            ...actionBtnStyle,
                                            background: (issuing || blocked) ? '#d1d5db' : '#7c3aed',
                                            color: '#fff',
                                            cursor: blocked ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {issuing ? '處理中...' : '確認發券'}
                                    </button>
                                );
                            })()}
                        </div>
                    </div>
                </ModalOverlay>
            )}
        </div>
    );
}

function ModalOverlay({ children, onClose }) {
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '420px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}

function IssueModal({ voucherType, quantity, unitPrice, userName, onQuantityChange, onConfirm, onCancel }) {
    const label = VOUCHER_TYPE_LABELS[voucherType];
    return (
        <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>發券 - {label}</h3>
            <div style={{ marginBottom: '12px', color: '#6b7280' }}>客人：<b>{userName}</b></div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>發券張數</label>
                <input
                    type="number"
                    min="1"
                    max="100"
                    value={quantity}
                    onChange={e => onQuantityChange(e.target.value)}
                    autoFocus
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder="請輸入張數"
                />
            </div>
            {quantity && parseInt(quantity) > 0 && (
                <div style={{ padding: '10px', background: '#f0f9ff', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
                    金額小計：<b>${parseInt(quantity) * unitPrice}</b> 元
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={onCancel} style={cancelBtnStyle}>取消</button>
                <button onClick={onConfirm} style={{ ...actionBtnStyle, background: '#2563eb', color: '#fff' }}>確認發券</button>
            </div>
        </div>
    );
}

function RedeemModal({ voucherType, available, quantity, unitPrice, userName, onQuantityChange, onConfirm, onCancel }) {
    const qty = parseInt(quantity) || 0;
    const label = VOUCHER_TYPE_LABELS[voucherType];
    return (
        <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{label}核銷</h3>
            <div style={{ marginBottom: '12px', color: '#6b7280' }}>客人：<b>{userName}</b></div>
            <div style={{ marginBottom: '8px', color: '#2563eb' }}>可用張數：<b>{available}</b> 張</div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>使用張數</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    {[2, 4, 6, 8].map(n => (
                        <button
                            key={n}
                            onClick={() => onQuantityChange(String(n))}
                            disabled={n > available}
                            style={{
                                flex: 1, padding: '10px 0', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px',
                                cursor: n > available ? 'not-allowed' : 'pointer',
                                border: qty === n ? '2px solid #1d4ed8' : '1px solid #d1d5db',
                                background: qty === n ? '#eff6ff' : '#fff',
                                color: n > available ? '#d1d5db' : qty === n ? '#1d4ed8' : '#374151',
                            }}
                        >
                            {n} 張
                        </button>
                    ))}
                </div>
                <input
                    type="number"
                    min="1"
                    max={available}
                    value={quantity}
                    onChange={e => onQuantityChange(e.target.value)}
                    autoFocus
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder="請輸入使用張數"
                />
            </div>
            {qty > 0 && (
                <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
                    折抵金額：<b>${qty * unitPrice}</b> 元（{qty} 張 x ${unitPrice}）
                </div>
            )}
            {qty > available && (
                <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>超過可用張數</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={onCancel} style={cancelBtnStyle}>取消</button>
                <button onClick={onConfirm} disabled={qty < 1 || qty > available} style={{ ...actionBtnStyle, background: qty >= 1 && qty <= available ? '#dc2626' : '#d1d5db', color: '#fff' }}>確認使用</button>
            </div>
        </div>
    );
}

function SettingsModal({ settings, onSave, onClose }) {
    const defaults = {
        green_fee: { unit_price: 200, default_quantity: 10 },
        product: { unit_price: 100, default_quantity: 10 },
        packages: DEFAULT_PACKAGES,
        validity_years: 1,
    };
    const [form, setForm] = useState({ ...defaults, ...settings });
    const [saving, setSaving] = useState(false);

    const updateField = (path, value) => {
        setForm(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            const keys = path.split('.');
            let obj = next;
            for (let i = 0; i < keys.length - 1; i++) {
                obj = obj[keys[i]];
            }
            obj[keys[keys.length - 1]] = value;
            return next;
        });
    };

    const updatePackage = (idx, field, value) => {
        setForm(prev => {
            const next = JSON.parse(JSON.stringify(prev));
            next.packages[idx][field] = value;
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await adminFetch('/api/voucher-ops/settings', {
                method: 'POST',
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.error) {
                alert('儲存失敗: ' + data.error);
            } else {
                alert('設定已儲存');
                onSave(form);
            }
        } catch (err) {
            alert('儲存失敗: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const fieldRow = { display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' };
    const fieldLabel = { width: '120px', fontSize: '14px', fontWeight: '500', flexShrink: 0 };
    const fieldInput = { ...inputStyle, width: '100%', flex: 1 };

    return (
        <ModalOverlay onClose={onClose}>
            <div>
                <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem' }}>⚙️ 發券設定</h3>

                <div style={{ marginBottom: '20px' }}>
                    <h4 style={sectionTitle}>果嶺券</h4>
                    <div style={fieldRow}>
                        <span style={fieldLabel}>單價</span>
                        <input type="number" value={form.green_fee.unit_price} onChange={e => updateField('green_fee.unit_price', parseInt(e.target.value) || 0)} style={fieldInput} />
                    </div>
                    <div style={fieldRow}>
                        <span style={fieldLabel}>預設張數</span>
                        <input type="number" value={form.green_fee.default_quantity} onChange={e => updateField('green_fee.default_quantity', parseInt(e.target.value) || 0)} style={fieldInput} />
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <h4 style={sectionTitle}>商品券</h4>
                    <div style={fieldRow}>
                        <span style={fieldLabel}>單價</span>
                        <input type="number" value={form.product.unit_price} onChange={e => updateField('product.unit_price', parseInt(e.target.value) || 0)} style={fieldInput} />
                    </div>
                    <div style={fieldRow}>
                        <span style={fieldLabel}>預設張數</span>
                        <input type="number" value={form.product.default_quantity} onChange={e => updateField('product.default_quantity', parseInt(e.target.value) || 0)} style={fieldInput} />
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <h4 style={sectionTitle}>有效年限</h4>
                    <div style={fieldRow}>
                        <span style={fieldLabel}>年數</span>
                        <input type="number" min="1" max="10" value={form.validity_years} onChange={e => updateField('validity_years', parseInt(e.target.value) || 1)} style={fieldInput} />
                    </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <h4 style={sectionTitle}>套本設定</h4>
                    {(form.packages || []).map((pkg, i) => (
                        <div key={i} style={{ padding: '12px', background: '#f5f3ff', borderRadius: '8px', marginBottom: '10px', position: 'relative' }}>
                            {(form.packages || []).length > 1 && (
                                <button
                                    onClick={() => setForm(prev => ({ ...prev, packages: prev.packages.filter((_, idx) => idx !== i) }))}
                                    style={{ position: 'absolute', top: '8px', right: '10px', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '16px' }}
                                    title="刪除此套本"
                                >✕</button>
                            )}
                            <div style={fieldRow}>
                                <span style={fieldLabel}>名稱</span>
                                <input type="text" value={pkg.name} onChange={e => updatePackage(i, 'name', e.target.value)} style={fieldInput} />
                            </div>
                            <div style={fieldRow}>
                                <span style={fieldLabel}>售價</span>
                                <input type="number" value={pkg.price} onChange={e => updatePackage(i, 'price', parseInt(e.target.value) || 0)} style={fieldInput} />
                            </div>
                            <div style={fieldRow}>
                                <span style={fieldLabel}>果嶺券張數</span>
                                <input type="number" value={pkg.green_fee} onChange={e => updatePackage(i, 'green_fee', parseInt(e.target.value) || 0)} style={fieldInput} />
                            </div>
                            <div style={fieldRow}>
                                <span style={fieldLabel}>商品券張數</span>
                                <input type="number" value={pkg.product} onChange={e => updatePackage(i, 'product', parseInt(e.target.value) || 0)} style={fieldInput} />
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={() => setForm(prev => ({ ...prev, packages: [...(prev.packages || []), { name: '新套本', price: 0, green_fee: 0, product: 0 }] }))}
                        style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: '14px', fontWeight: '500', padding: '4px 0' }}
                    >
                        + 新增套本
                    </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button onClick={onClose} style={cancelBtnStyle}>取消</button>
                    <button onClick={handleSave} disabled={saving} style={{ ...actionBtnStyle, background: saving ? '#d1d5db' : '#2563eb', color: '#fff' }}>
                        {saving ? '儲存中...' : '儲存設定'}
                    </button>
                </div>
            </div>
        </ModalOverlay>
    );
}

function ExpiryModal({ userName, validFrom, validUntil, reason, paperExpiry, loadingPaper, onFromChange, onDateChange, onReasonChange, onConfirm, onCancel }) {
    const paperPlusYear = paperExpiry ? (() => {
        const d = new Date(paperExpiry);
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().slice(0, 10);
    })() : null;

    return (
        <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#059669' }}>修改票券效期</h3>
            <div style={{ marginBottom: '12px', color: '#6b7280' }}>客人：<b>{userName}</b></div>

            {loadingPaper ? (
                <div style={{ color: '#9ca3af', marginBottom: '12px', fontSize: '13px' }}>查詢紙券到期日...</div>
            ) : paperExpiry && (
                <div style={{ padding: '10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                    <div>原紙券到期日：<b>{paperExpiry.slice(0, 10)}</b></div>
                    <div style={{ marginTop: '4px' }}>
                        建議到期日（+1年）：<b>{paperPlusYear}</b>
                        <button
                            onClick={() => onDateChange(paperPlusYear)}
                            style={{ marginLeft: '8px', padding: '2px 10px', border: '1px solid #d97706', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', background: '#fff', color: '#d97706' }}
                        >
                            套用
                        </button>
                    </div>
                </div>
            )}

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>啟用日</label>
                <input
                    type="date"
                    value={validFrom || ''}
                    onChange={e => onFromChange(e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                />
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>到期日</label>
                <input
                    type="date"
                    value={validUntil || ''}
                    onChange={e => onDateChange(e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                />
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>原因（選填）</label>
                <input
                    type="text"
                    value={reason}
                    onChange={e => onReasonChange(e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder="例：紙券轉換延期、客戶續約"
                />
            </div>
            <div style={{ padding: '10px', background: '#f0f9ff', borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: '#1e40af' }}>
                此操作會修改該客人所有電子票券（可用＋已核銷）的效期。啟用日、到期日可只改其中一個（留空則不變）。
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={onCancel} style={cancelBtnStyle}>取消</button>
                <button onClick={onConfirm} disabled={!validUntil} style={{ ...actionBtnStyle, background: validUntil ? '#059669' : '#d1d5db', color: '#fff' }}>確認修改</button>
            </div>
        </div>
    );
}

function ReverseRedeemModal({ voucherType, redeemed, quantity, reason, userName, onQuantityChange, onReasonChange, onConfirm, onCancel }) {
    const qty = parseInt(quantity) || 0;
    const label = VOUCHER_TYPE_LABELS[voucherType];
    return (
        <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#d97706' }}>撤銷核銷 - {label}</h3>
            <div style={{ marginBottom: '12px', color: '#6b7280' }}>客人：<b>{userName}</b></div>
            <div style={{ marginBottom: '8px', color: '#dc2626' }}>已核銷張數：<b>{redeemed}</b> 張</div>
            <div style={{ padding: '10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                撤銷核銷後，券會恢復為「可用」狀態（從最近核銷的開始撤銷）
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>撤銷張數</label>
                <input
                    type="number"
                    min="1"
                    max={redeemed}
                    value={quantity}
                    onChange={e => onQuantityChange(e.target.value)}
                    autoFocus
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder="請輸入撤銷張數"
                />
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>原因（選填）</label>
                <input
                    type="text"
                    value={reason}
                    onChange={e => onReasonChange(e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder="例：誤核銷、客人退貨"
                />
            </div>
            {qty > redeemed && (
                <div style={{ color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>超過已核銷張數</div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={onCancel} style={cancelBtnStyle}>取消</button>
                <button onClick={onConfirm} disabled={qty < 1 || qty > redeemed} style={{ ...actionBtnStyle, background: qty >= 1 && qty <= redeemed ? '#d97706' : '#d1d5db', color: '#fff' }}>確認撤銷</button>
            </div>
        </div>
    );
}

function CancelAllModal({ userName, summary, reason, onReasonChange, onConfirm, onCancel }) {
    const greenActive = summary?.green_fee?.active || 0;
    const greenRedeemed = summary?.green_fee?.redeemed || 0;
    const prodActive = summary?.product?.active || 0;
    const prodRedeemed = summary?.product?.redeemed || 0;
    const total = greenActive + greenRedeemed + prodActive + prodRedeemed;
    return (
        <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', color: '#dc2626' }}>全部退券（作廢）</h3>
            <div style={{ marginBottom: '12px', color: '#6b7280' }}>客人：<b>{userName}</b></div>
            <div style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '8px' }}>以下所有券將被作廢：</div>
                <div style={{ fontSize: '14px', color: '#374151' }}>
                    <div>果嶺券：可用 {greenActive} 張 + 已核銷 {greenRedeemed} 張</div>
                    <div>商品券：可用 {prodActive} 張 + 已核銷 {prodRedeemed} 張</div>
                    <div style={{ marginTop: '8px', fontWeight: 'bold', borderTop: '1px solid #fecaca', paddingTop: '8px' }}>共計 {total} 張</div>
                </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>退券原因（必填）</label>
                <input
                    type="text"
                    value={reason}
                    onChange={e => onReasonChange(e.target.value)}
                    autoFocus
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder="例：測試資料清除、客人退費"
                />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={onCancel} style={cancelBtnStyle}>取消</button>
                <button onClick={onConfirm} disabled={!reason?.trim()} style={{ ...actionBtnStyle, background: reason?.trim() ? '#dc2626' : '#d1d5db', color: '#fff' }}>確認退券</button>
            </div>
        </div>
    );
}

function formatTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDate(iso) {
    if (!iso) return '-';
    return iso.slice(0, 10);
}

const inputStyle = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', width: '300px' };
const dropdownStyle = { position: 'absolute', top: '44px', left: 0, right: 0, maxWidth: '500px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '240px', overflowY: 'auto' };
const dropdownItemStyle = { padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: '12px', alignItems: 'center' };
const thStyle = { padding: '10px 8px', textAlign: 'left', fontWeight: '600', whiteSpace: 'nowrap' };
const tdStyle = { padding: '10px 8px', verticalAlign: 'top' };
const actionBtnStyle = { padding: '8px 20px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' };
const cancelBtnStyle = { padding: '8px 20px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', background: '#fff', color: '#374151' };
const linkBtnStyle = { padding: '4px 12px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: '#fff', color: '#6b7280' };
const pageBtnStyle = (disabled) => ({ padding: '6px 14px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: disabled ? '#f3f4f6' : '#fff', color: disabled ? '#9ca3af' : '#374151', cursor: disabled ? 'default' : 'pointer' });
const settingsBtnStyle = { padding: '6px 14px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: '#fff', color: '#374151' };
const sectionTitle = { fontSize: '0.9rem', fontWeight: '600', color: '#374151', marginBottom: '10px', marginTop: 0 };
