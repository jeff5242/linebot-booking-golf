import React, { useState, useEffect, useRef } from 'react';
import { adminFetch } from '../utils/adminApi';

const VOUCHER_TYPE_LABELS = {
    green_fee: '果嶺券',
    product: '商品券',
};

const ACTION_LABELS = {
    issued: { text: '發券', color: '#2563eb', bg: '#eff6ff' },
    redeemed: { text: '核銷', color: '#dc2626', bg: '#fef2f2' },
    voided: { text: '作廢', color: '#6b7280', bg: '#f9fafb' },
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

    const searchTimerRef = useRef(null);

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

    const selectUser = async (user) => {
        setSelectedUser(user);
        setSearchQuery('');
        setSearchResults([]);
        setLoading(true);
        try {
            const res = await adminFetch(`/api/voucher-ops/customer/${user.id}`);
            const data = await res.json();
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
        const unitPrice = modal.voucherType === 'green_fee' ? 200 : 100;
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
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', fontWeight: 'bold' }}>發券 / 用券</h3>

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

            {loading && <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>載入中...</div>}

            {/* Package Issue */}
            {summary && !loading && (
                <PackageIssueSection
                    userId={selectedUser?.id}
                    onIssued={refreshCustomerData}
                />
            )}

            {/* Voucher Summary Cards */}
            {summary && !loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <VoucherCard
                        title="果嶺券"
                        color="#1d4ed8"
                        bg="#eff6ff"
                        summary={summary.green_fee}
                        unitPrice={200}
                        onIssue={() => openIssueModal('green_fee')}
                        onRedeem={() => openRedeemModal('green_fee')}
                    />
                    <VoucherCard
                        title="商品券"
                        color="#166534"
                        bg="#f0fdf4"
                        summary={summary.product}
                        unitPrice={100}
                        onIssue={() => openIssueModal('product')}
                        onRedeem={() => openRedeemModal('product')}
                    />
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
                        userName={selectedUser?.display_name}
                        onQuantityChange={q => setModal(prev => ({ ...prev, quantity: q }))}
                        onConfirm={handleRedeem}
                        onCancel={() => setModal(null)}
                    />
                )}
            </ModalOverlay>}
        </div>
    );
}

function VoucherCard({ title, color, bg, summary, unitPrice, onIssue, onRedeem }) {
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
                <button onClick={onIssue} style={{ ...actionBtnStyle, background: '#2563eb', color: '#fff' }}>發券</button>
                <button onClick={onRedeem} disabled={summary.active === 0} style={{ ...actionBtnStyle, background: summary.active > 0 ? '#dc2626' : '#d1d5db', color: '#fff' }}>用券</button>
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

const PACKAGES = [
    { name: 'A 套本 $6,600', price: 6600, green_fee: 18, product: 30 },
    { name: 'B 套本 $2,800', price: 2800, green_fee: 9, product: 10 },
];

function PackageIssueSection({ userId, onIssued }) {
    const [issuing, setIssuing] = useState(false);
    const [showPackageModal, setShowPackageModal] = useState(null);
    const [lastPurchaseDate, setLastPurchaseDate] = useState(null);
    const [customStartDate, setCustomStartDate] = useState('');
    const [loadingDate, setLoadingDate] = useState(false);

    const openPackageModal = async (pkgIndex) => {
        setShowPackageModal(pkgIndex);
        setLoadingDate(true);
        try {
            const res = await adminFetch(`/api/voucher-ops/last-purchase/${userId}`);
            const data = await res.json();
            setLastPurchaseDate(data.lastPurchaseDate);
            if (data.lastPurchaseDate) {
                const last = new Date(data.lastPurchaseDate);
                const next = new Date(last.getTime() + 2 * 365.25 * 24 * 60 * 60 * 1000);
                setCustomStartDate(next.toISOString().slice(0, 10));
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
                            <div style={{ marginBottom: '6px' }}>果嶺券：<b>{PACKAGES[showPackageModal].green_fee}</b> 張 x $200 = <b>${PACKAGES[showPackageModal].green_fee * 200}</b></div>
                            <div>商品券：<b>{PACKAGES[showPackageModal].product}</b> 張 x $100 = <b>${PACKAGES[showPackageModal].product * 100}</b></div>
                            <div style={{ marginTop: '8px', borderTop: '1px solid #ddd6fe', paddingTop: '8px', fontWeight: 'bold' }}>總計：${PACKAGES[showPackageModal].price}</div>
                        </div>

                        {loadingDate ? (
                            <div style={{ color: '#9ca3af', marginBottom: '16px' }}>查詢上次購買日期...</div>
                        ) : (
                            <div style={{ marginBottom: '16px' }}>
                                {lastPurchaseDate && (
                                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                                        上次購買日期：{lastPurchaseDate}（+2年 = {customStartDate}）
                                    </div>
                                )}
                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>效期起始日</label>
                                <input
                                    type="date"
                                    value={customStartDate}
                                    onChange={e => setCustomStartDate(e.target.value)}
                                    style={{ ...inputStyle, width: '100%' }}
                                />
                                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>效期 2 年（可調整起始日）</div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button onClick={() => setShowPackageModal(null)} style={cancelBtnStyle}>取消</button>
                            <button onClick={handleIssuePackage} disabled={issuing} style={{ ...actionBtnStyle, background: issuing ? '#d1d5db' : '#7c3aed', color: '#fff' }}>
                                {issuing ? '處理中...' : '確認發券'}
                            </button>
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

function IssueModal({ voucherType, quantity, userName, onQuantityChange, onConfirm, onCancel }) {
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
                    金額小計：<b>${parseInt(quantity) * (voucherType === 'green_fee' ? 200 : 100)}</b> 元
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={onCancel} style={cancelBtnStyle}>取消</button>
                <button onClick={onConfirm} style={{ ...actionBtnStyle, background: '#2563eb', color: '#fff' }}>確認發券</button>
            </div>
        </div>
    );
}

function RedeemModal({ voucherType, available, quantity, userName, onQuantityChange, onConfirm, onCancel }) {
    const qty = parseInt(quantity) || 0;
    const label = VOUCHER_TYPE_LABELS[voucherType];
    const unitPrice = voucherType === 'green_fee' ? 200 : 100;
    return (
        <div>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem' }}>{label}核銷</h3>
            <div style={{ marginBottom: '12px', color: '#6b7280' }}>客人：<b>{userName}</b></div>
            <div style={{ marginBottom: '8px', color: '#2563eb' }}>可用張數：<b>{available}</b> 張</div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>使用張數</label>
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
