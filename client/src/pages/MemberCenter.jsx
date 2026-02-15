import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

const apiUrl = import.meta.env.VITE_API_URL || '';

// 會員身分配色
const TIER_STYLES = {
    '白金會員': { bg: '#f5f5f5', color: '#333', border: '#999', label: 'PLATINUM' },
    '金卡會員': { bg: '#fef3c7', color: '#92400e', border: '#f59e0b', label: 'GOLD' },
    '社區會員': { bg: '#dbeafe', color: '#1e40af', border: '#3b82f6', label: 'COMMUNITY' },
    'VIP-A': { bg: '#fce7f3', color: '#9d174d', border: '#ec4899', label: 'VIP-A' },
    'VIP-B': { bg: '#fce7f3', color: '#9d174d', border: '#ec4899', label: 'VIP-B' },
    '團友': { bg: '#d1fae5', color: '#065f46', border: '#10b981', label: 'TEAM' },
    '來賓': { bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db', label: 'GUEST' },
};

export function MemberCenter() {
    const navigate = useNavigate();
    const lineUserId = localStorage.getItem('line_user_id');
    const userPhone = localStorage.getItem('golf_user_phone');

    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('bookings');

    // 預約紀錄
    const [bookings, setBookings] = useState([]);
    const [bookingsTotal, setBookingsTotal] = useState(0);
    const [bookingsPage, setBookingsPage] = useState(1);

    // 收費卡紀錄
    const [chargeCards, setChargeCards] = useState([]);
    const [chargeCardsTotal, setChargeCardsTotal] = useState(0);
    const [chargeCardsPage, setChargeCardsPage] = useState(1);

    // 優惠券
    const [vouchers, setVouchers] = useState([]);

    // QR Modal
    const [showQR, setShowQR] = useState(false);

    // 重新綁定
    const [showRebind, setShowRebind] = useState(false);
    const [rebindPhone, setRebindPhone] = useState('');
    const [rebindOtp, setRebindOtp] = useState('');
    const [rebindCountdown, setRebindCountdown] = useState(0);
    const [rebindSent, setRebindSent] = useState(false);
    const [rebindLoading, setRebindLoading] = useState(false);
    const [rebindMessage, setRebindMessage] = useState('');

    // 預約詳情
    const [selectedBooking, setSelectedBooking] = useState(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    useEffect(() => {
        if (activeTab === 'bookings') fetchBookings();
        if (activeTab === 'chargeCards') fetchChargeCards();
        if (activeTab === 'vouchers') fetchVouchers();
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'bookings') fetchBookings();
    }, [bookingsPage]);

    useEffect(() => {
        if (activeTab === 'chargeCards') fetchChargeCards();
    }, [chargeCardsPage]);

    useEffect(() => {
        if (rebindCountdown > 0) {
            const timer = setTimeout(() => setRebindCountdown(rebindCountdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [rebindCountdown]);

    const fetchProfile = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/member/profile?lineUserId=${lineUserId}`);
            if (res.ok) {
                const data = await res.json();
                setProfile(data.user);
                setStats(data.stats);
            }
        } catch (err) {
            console.error('Fetch profile error:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchBookings = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/member/bookings?lineUserId=${lineUserId}&page=${bookingsPage}&limit=10`);
            if (res.ok) {
                const data = await res.json();
                setBookings(data.bookings);
                setBookingsTotal(data.total);
            }
        } catch (err) {
            console.error('Fetch bookings error:', err);
        }
    };

    const fetchChargeCards = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/member/charge-cards?lineUserId=${lineUserId}&page=${chargeCardsPage}&limit=10`);
            if (res.ok) {
                const data = await res.json();
                setChargeCards(data.chargeCards);
                setChargeCardsTotal(data.total);
            }
        } catch (err) {
            console.error('Fetch charge cards error:', err);
        }
    };

    const fetchVouchers = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/member/vouchers?lineUserId=${lineUserId}`);
            if (res.ok) {
                const data = await res.json();
                setVouchers(data.vouchers);
            }
        } catch (err) {
            console.error('Fetch vouchers error:', err);
        }
    };

    // 重新綁定手機
    const handleRebindSendOtp = async () => {
        if (!rebindPhone || rebindPhone.length < 10) {
            setRebindMessage('請輸入正確的手機號碼');
            return;
        }
        setRebindLoading(true);
        setRebindMessage('');
        try {
            const res = await fetch(`${apiUrl}/api/otp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: rebindPhone, purpose: 'rebind' }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setRebindSent(true);
                setRebindCountdown(60);
                setRebindMessage('驗證碼已發送');
            } else {
                setRebindMessage(data.error || '發送失敗');
            }
        } catch (err) {
            setRebindMessage('網路錯誤');
        } finally {
            setRebindLoading(false);
        }
    };

    const handleRebindSubmit = async () => {
        if (!rebindOtp || rebindOtp.length !== 6) {
            setRebindMessage('請輸入 6 位數驗證碼');
            return;
        }
        setRebindLoading(true);
        setRebindMessage('');
        try {
            const res = await fetch(`${apiUrl}/api/member/rebind`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: rebindPhone, code: rebindOtp, lineUserId }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem('golf_user_phone', rebindPhone);
                setShowRebind(false);
                setRebindPhone('');
                setRebindOtp('');
                setRebindSent(false);
                fetchProfile();
                alert('手機號碼已更新');
            } else {
                setRebindMessage(data.error || '綁定失敗');
            }
        } catch (err) {
            setRebindMessage('網路錯誤');
        } finally {
            setRebindLoading(false);
        }
    };

    const formatMoney = (n) => {
        if (n == null) return '$0';
        return `$${Number(n).toLocaleString()}`;
    };

    const getStatusBadge = (status) => {
        const map = {
            confirmed: { label: '已預約', bg: '#dbeafe', color: '#1e40af' },
            checked_in: { label: '已報到', bg: '#dcfce7', color: '#166534' },
            cancelled: { label: '已取消', bg: '#f3f4f6', color: '#6b7280' },
        };
        const s = map[status] || { label: status, bg: '#f3f4f6', color: '#6b7280' };
        return (
            <span style={{
                padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem',
                fontWeight: 'bold', backgroundColor: s.bg, color: s.color,
            }}>
                {s.label}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="container" style={{ textAlign: 'center', paddingTop: '60px' }}>
                <p style={{ color: '#999' }}>載入中...</p>
            </div>
        );
    }

    const tierStyle = TIER_STYLES[profile?.golfer_type] || TIER_STYLES['來賓'];

    return (
        <div className="container" style={{ paddingBottom: '80px' }}>
            {/* 會員卡片 */}
            <div style={{
                background: `linear-gradient(135deg, ${tierStyle.bg}, white)`,
                border: `2px solid ${tierStyle.border}`,
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '20px',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: '10px', right: '12px',
                    fontSize: '0.7rem', fontWeight: 'bold', color: tierStyle.color,
                    letterSpacing: '2px', opacity: 0.5,
                }}>
                    {tierStyle.label}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ margin: '0 0 4px', fontSize: '1.3rem', color: '#333' }}>
                            {profile?.display_name || '會員'}
                        </h2>
                        <div style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: '12px',
                            fontSize: '0.8rem', fontWeight: 'bold',
                            backgroundColor: tierStyle.border, color: 'white',
                        }}>
                            {profile?.golfer_type || '來賓'}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#555', lineHeight: '1.8' }}>
                    {profile?.member_no && (
                        <div>會員編號：<strong>{profile.member_no}</strong></div>
                    )}
                    <div>手機號碼：{profile?.phone || '--'}</div>
                    {profile?.member_valid_until && (
                        <div>有效期限：{profile.member_valid_until}</div>
                    )}
                </div>

                {/* 統計 */}
                <div style={{
                    display: 'flex', gap: '16px', marginTop: '16px',
                    paddingTop: '12px', borderTop: `1px solid ${tierStyle.border}40`,
                }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#333' }}>
                            {stats.totalBookings || 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#999' }}>總預約</div>
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#2e7d32' }}>
                            {stats.upcomingBookings || 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#999' }}>即將到來</div>
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#1565c0' }}>
                            {stats.completedRounds || 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#999' }}>已完成</div>
                    </div>
                </div>
            </div>

            {/* 快捷操作 */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                        background: '#2e7d32', color: 'white', fontWeight: 'bold',
                        fontSize: '0.9rem', cursor: 'pointer',
                    }}
                >
                    新增預約
                </button>
                <button
                    onClick={() => setShowQR(true)}
                    style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
                        background: '#1565c0', color: 'white', fontWeight: 'bold',
                        fontSize: '0.9rem', cursor: 'pointer',
                    }}
                >
                    報到 QR
                </button>
                <button
                    onClick={() => setShowRebind(true)}
                    style={{
                        flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #ddd',
                        background: 'white', color: '#555', fontWeight: 'bold',
                        fontSize: '0.85rem', cursor: 'pointer',
                    }}
                >
                    重新綁定
                </button>
            </div>

            {/* Tab 切換 */}
            <div style={{ display: 'flex', borderBottom: '2px solid #eee', marginBottom: '16px' }}>
                {[
                    { key: 'bookings', label: '預約紀錄' },
                    { key: 'chargeCards', label: '收費卡' },
                    { key: 'vouchers', label: '優惠券' },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                            background: 'transparent', fontWeight: activeTab === tab.key ? 'bold' : 'normal',
                            color: activeTab === tab.key ? '#2e7d32' : '#999',
                            borderBottom: activeTab === tab.key ? '2px solid #2e7d32' : '2px solid transparent',
                            fontSize: '0.9rem', transition: 'all 0.2s',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 預約紀錄 Tab */}
            {activeTab === 'bookings' && (
                <div>
                    {bookings.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#999', padding: '30px 0' }}>尚無預約紀錄</p>
                    ) : (
                        bookings.map(b => (
                            <div key={b.id} className="card" style={{
                                borderLeft: `4px solid ${b.status === 'cancelled' ? '#d1d5db' : b.status === 'checked_in' ? '#10b981' : '#2e7d32'}`,
                                marginBottom: '10px', padding: '14px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                            {b.date} {b.time?.substring(0, 5)}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px' }}>
                                            {b.holes} 洞 | {b.players_count} 人
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {getStatusBadge(b.status)}
                                        <button
                                            onClick={() => setSelectedBooking(b)}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px', border: '1px solid #ddd',
                                                background: 'white', fontSize: '0.8rem', cursor: 'pointer', color: '#555',
                                            }}
                                        >
                                            詳情
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    {/* 分頁 */}
                    {bookingsTotal > 10 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                            <button
                                onClick={() => setBookingsPage(p => Math.max(1, p - 1))}
                                disabled={bookingsPage <= 1}
                                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #ddd', cursor: 'pointer', background: 'white' }}
                            >
                                上一頁
                            </button>
                            <span style={{ padding: '6px 12px', color: '#666', fontSize: '0.9rem' }}>
                                {bookingsPage} / {Math.ceil(bookingsTotal / 10)}
                            </span>
                            <button
                                onClick={() => setBookingsPage(p => p + 1)}
                                disabled={bookingsPage >= Math.ceil(bookingsTotal / 10)}
                                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #ddd', cursor: 'pointer', background: 'white' }}
                            >
                                下一頁
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 收費卡 Tab */}
            {activeTab === 'chargeCards' && (
                <div>
                    {chargeCards.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#999', padding: '30px 0' }}>尚無收費卡紀錄</p>
                    ) : (
                        chargeCards.map(card => (
                            <div key={card.id} className="card" style={{
                                borderLeft: '4px solid #f59e0b',
                                marginBottom: '10px', padding: '14px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                                            {formatMoney(card.total_amount)}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '2px' }}>
                                            {card.course || 'A -> B'} | {card.caddy_ratio || '--'}
                                        </div>
                                        {card.caddies && (
                                            <div style={{ fontSize: '0.8rem', color: '#888', marginTop: '2px' }}>
                                                桿弟：{card.caddies.name} ({card.caddies.caddy_number})
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#999' }}>
                                            {card.created_at?.substring(0, 10)}
                                        </div>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem',
                                            fontWeight: 'bold',
                                            backgroundColor: card.status === 'paid' ? '#dcfce7' : '#fef3c7',
                                            color: card.status === 'paid' ? '#166534' : '#92400e',
                                        }}>
                                            {card.status === 'paid' ? '已結帳' : card.status === 'printed' ? '已列印' : '已建立'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    {chargeCardsTotal > 10 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                            <button
                                onClick={() => setChargeCardsPage(p => Math.max(1, p - 1))}
                                disabled={chargeCardsPage <= 1}
                                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #ddd', cursor: 'pointer', background: 'white' }}
                            >
                                上一頁
                            </button>
                            <span style={{ padding: '6px 12px', color: '#666', fontSize: '0.9rem' }}>
                                {chargeCardsPage} / {Math.ceil(chargeCardsTotal / 10)}
                            </span>
                            <button
                                onClick={() => setChargeCardsPage(p => p + 1)}
                                disabled={chargeCardsPage >= Math.ceil(chargeCardsTotal / 10)}
                                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #ddd', cursor: 'pointer', background: 'white' }}
                            >
                                下一頁
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* 優惠券 Tab */}
            {activeTab === 'vouchers' && (
                <div>
                    {vouchers.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#999', padding: '30px 0' }}>尚無優惠券</p>
                    ) : (
                        vouchers.map(v => (
                            <div key={v.id} className="card" style={{
                                borderLeft: `4px solid ${v.used_at ? '#d1d5db' : '#8b5cf6'}`,
                                marginBottom: '10px', padding: '14px',
                                opacity: v.used_at ? 0.6 : 1,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>
                                            {v.benefit_type === 'merchandise_voucher' ? '商品券' : '折抵券'}
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#8b5cf6', marginTop: '2px' }}>
                                            {formatMoney(v.amount)}
                                        </div>
                                        {v.voucher_code && (
                                            <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '2px', fontFamily: 'monospace' }}>
                                                {v.voucher_code}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        {v.used_at ? (
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem',
                                                fontWeight: 'bold', backgroundColor: '#f3f4f6', color: '#6b7280',
                                            }}>
                                                已使用
                                            </span>
                                        ) : (
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem',
                                                fontWeight: 'bold', backgroundColor: '#ede9fe', color: '#7c3aed',
                                            }}>
                                                可使用
                                            </span>
                                        )}
                                        {v.expires_at && (
                                            <div style={{ fontSize: '0.75rem', color: '#999', marginTop: '4px' }}>
                                                到期：{v.expires_at.substring(0, 10)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* QR Code Modal */}
            {showQR && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 2000, backdropFilter: 'blur(5px)',
                }} onClick={() => setShowQR(false)}>
                    <div style={{
                        backgroundColor: 'white', padding: '30px', borderRadius: '16px',
                        textAlign: 'center', maxWidth: '90%', width: '320px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginTop: 0, marginBottom: '5px', color: '#374151' }}>出示此碼報到</h3>
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 20px 0' }}>
                            請向櫃檯或自動報到機出示此 QR Code
                        </p>
                        <div style={{
                            background: '#f9fafb', padding: '25px', borderRadius: '12px',
                            marginBottom: '20px', border: '2px dashed #e5e7eb',
                        }}>
                            <QRCodeSVG
                                value={JSON.stringify({ phone: userPhone || profile?.phone })}
                                size={200}
                                level="H"
                            />
                        </div>
                        <p style={{
                            fontSize: '1.2rem', fontWeight: 'bold', color: '#374151',
                            margin: '0 0 20px 0', fontFamily: 'monospace', letterSpacing: '1px',
                        }}>
                            {userPhone || profile?.phone}
                        </p>
                        <button
                            onClick={() => setShowQR(false)}
                            style={{
                                width: '100%', padding: '12px', backgroundColor: '#111827',
                                color: 'white', border: 'none', borderRadius: '8px',
                                fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem',
                            }}
                        >
                            關閉
                        </button>
                    </div>
                </div>
            )}

            {/* 重新綁定 Modal */}
            {showRebind && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 2000,
                }} onClick={() => setShowRebind(false)}>
                    <div style={{
                        backgroundColor: 'white', borderRadius: '16px', padding: '24px',
                        maxWidth: '400px', width: '90%',
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginTop: 0, marginBottom: '16px' }}>重新綁定手機</h3>

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                新手機號碼
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    placeholder="0912345678"
                                    maxLength="10"
                                    value={rebindPhone}
                                    onChange={e => setRebindPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                    disabled={rebindSent}
                                    style={{
                                        flex: 1, padding: '10px', borderRadius: '8px',
                                        border: '1px solid #ddd', fontSize: '1rem',
                                    }}
                                />
                                <button
                                    onClick={handleRebindSendOtp}
                                    disabled={rebindCountdown > 0 || !rebindPhone || rebindLoading}
                                    style={{
                                        padding: '0 12px', borderRadius: '8px', border: 'none',
                                        background: (rebindCountdown > 0 || rebindLoading) ? '#d1d5db' : '#2e7d32',
                                        color: 'white', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}
                                >
                                    {rebindLoading ? '...' : rebindCountdown > 0 ? `${rebindCountdown}s` : '發送'}
                                </button>
                            </div>
                        </div>

                        {rebindSent && (
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                    驗證碼
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="6 位數驗證碼"
                                    maxLength="6"
                                    value={rebindOtp}
                                    onChange={e => setRebindOtp(e.target.value.replace(/[^0-9]/g, ''))}
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: '8px',
                                        border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box',
                                    }}
                                />
                            </div>
                        )}

                        {rebindMessage && (
                            <div style={{
                                padding: '8px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem',
                                backgroundColor: rebindMessage.includes('已發送') || rebindMessage.includes('已更新') ? '#dcfce7' : '#fee2e2',
                                color: rebindMessage.includes('已發送') || rebindMessage.includes('已更新') ? '#166534' : '#dc2626',
                            }}>
                                {rebindMessage}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => {
                                    setShowRebind(false);
                                    setRebindPhone('');
                                    setRebindOtp('');
                                    setRebindSent(false);
                                    setRebindMessage('');
                                }}
                                style={{
                                    flex: 1, padding: '12px', borderRadius: '8px',
                                    border: '1px solid #ddd', background: 'white', cursor: 'pointer',
                                }}
                            >
                                取消
                            </button>
                            {rebindSent && (
                                <button
                                    onClick={handleRebindSubmit}
                                    disabled={rebindLoading || !rebindOtp}
                                    style={{
                                        flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                                        background: '#2e7d32', color: 'white', fontWeight: 'bold', cursor: 'pointer',
                                    }}
                                >
                                    {rebindLoading ? '處理中...' : '確認綁定'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 預約詳情 Modal */}
            {selectedBooking && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }} onClick={() => setSelectedBooking(null)}>
                    <div className="card" style={{
                        width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto',
                    }} onClick={e => e.stopPropagation()}>
                        <h2 className="title" style={{ marginBottom: '16px' }}>預約詳情</h2>
                        <div style={{ marginBottom: '16px' }}>
                            <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                {selectedBooking.date} {selectedBooking.time?.substring(0, 5)}
                            </p>
                            <p>{selectedBooking.holes} 洞 | {selectedBooking.players_count} 人</p>
                            <p style={{ fontSize: '0.9rem', color: '#666' }}>
                                狀態: {getStatusBadge(selectedBooking.status)}
                            </p>
                        </div>
                        {(selectedBooking.needs_cart !== undefined || selectedBooking.needs_caddie !== undefined) && (
                            <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                                <h4 style={{ marginBottom: '8px', fontSize: '0.9rem' }}>服務項目</h4>
                                <p style={{ fontSize: '0.85rem' }}>
                                    {selectedBooking.needs_cart ? '+ 球車' : '- 球車'} | {selectedBooking.needs_caddie ? '+ 桿弟' : '- 桿弟'}
                                </p>
                            </div>
                        )}
                        {selectedBooking.players_info && Array.isArray(selectedBooking.players_info) && selectedBooking.players_info.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <h4 style={{ marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>組員名單</h4>
                                {selectedBooking.players_info.map((player, idx) => (
                                    player.name && (
                                        <div key={idx} style={{ padding: '6px 8px', backgroundColor: '#f9fafb', borderRadius: '6px', marginBottom: '4px', fontSize: '0.85rem' }}>
                                            {idx + 1}. {player.name} {player.phone && <span style={{ color: '#999' }}>{player.phone}</span>}
                                        </div>
                                    )
                                ))}
                            </div>
                        )}
                        {selectedBooking.notes && (
                            <div style={{ marginBottom: '16px', fontSize: '0.85rem', color: '#666' }}>
                                備註：{selectedBooking.notes}
                            </div>
                        )}
                        <button
                            onClick={() => setSelectedBooking(null)}
                            className="btn btn-primary"
                            style={{ marginTop: '8px' }}
                        >
                            關閉
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
