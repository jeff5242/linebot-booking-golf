import React, { useEffect, useState, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { supabase } from '../supabase';

const AUTO_RESET_MS = 4000;
const VOUCHER_RESET_MS = 15000;

export function KioskCheckin() {
    const [authed, setAuthed] = useState(false);
    const [pin, setPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [verifying, setVerifying] = useState(false);

    const handleVerifyPin = async () => {
        if (!pin) return;
        setVerifying(true);
        setPinError('');
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/kiosk/verify-pin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });
            if (res.ok) {
                setAuthed(true);
            } else {
                setPinError('PIN 碼錯誤');
                setPin('');
            }
        } catch {
            setPinError('驗證失敗，請檢查網路連線');
        } finally {
            setVerifying(false);
        }
    };

    if (!authed) {
        return (
            <KioskPinScreen
                pin={pin}
                setPin={setPin}
                pinError={pinError}
                verifying={verifying}
                onSubmit={handleVerifyPin}
            />
        );
    }

    return <KioskScanner />;
}

/* ──────────────── PIN 輸入畫面 ──────────────── */
function KioskPinScreen({ pin, setPin, pinError, verifying, onSubmit }) {
    return (
        <div style={styles.fullScreen}>
            <div style={styles.pinCard}>
                <div style={{ fontSize: '3rem', marginBottom: '8px' }}>⛳</div>
                <h1 style={{ fontSize: '1.5rem', color: '#1a202c', marginBottom: '4px' }}>大衛營高爾夫球場</h1>
                <p style={{ color: '#6b7280', marginBottom: '24px' }}>報到機 PIN 碼驗證</p>
                <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={e => { setPin(e.target.value); }}
                    onKeyDown={e => e.key === 'Enter' && onSubmit()}
                    placeholder="請輸入 PIN 碼"
                    autoFocus
                    style={styles.pinInput}
                />
                {pinError && <p style={{ color: '#ef4444', marginTop: '8px' }}>{pinError}</p>}
                <button onClick={onSubmit} disabled={verifying || !pin} style={{ ...styles.pinBtn, opacity: (verifying || !pin) ? 0.6 : 1 }}>
                    {verifying ? '驗證中...' : '進入報到模式'}
                </button>
            </div>
        </div>
    );
}

/* ──────────────── 掃描主畫面 ──────────────── */
function KioskScanner() {
    const [scanResult, setScanResult] = useState(null);
    const [userVouchers, setUserVouchers] = useState([]);
    const scannerRef = useRef(null);
    const processingRef = useRef(false);
    const resetTimerRef = useRef(null);

    const resetScanner = useCallback(() => {
        clearTimeout(resetTimerRef.current);
        setScanResult(null);
        setUserVouchers([]);
        processingRef.current = false;
    }, []);

    const scheduleReset = useCallback((ms) => {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(resetScanner, ms);
    }, [resetScanner]);

    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            'kiosk-reader',
            { fps: 10, qrbox: { width: 280, height: 280 }, rememberLastUsedCamera: true },
            false
        );
        scannerRef.current = scanner;

        scanner.render(async (decodedText) => {
            if (processingRef.current) return;
            processingRef.current = true;

            try {
                let phone = decodedText;
                try {
                    const json = JSON.parse(decodedText);
                    if (json.phone) phone = json.phone;
                } catch (_) { }

                // 查用戶
                const { data: users } = await supabase
                    .from('users')
                    .select('id, display_name, phone')
                    .eq('phone', phone)
                    .limit(1);

                if (!users || users.length === 0) {
                    setScanResult({ error: true, title: '查無此用戶', detail: `電話：${phone}` });
                    scheduleReset(AUTO_RESET_MS);
                    return;
                }
                const user = users[0];

                // 報到
                const dateStr = format(new Date(), 'yyyy-MM-dd');
                const { data: booking } = await supabase
                    .from('bookings')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('date', dateStr)
                    .neq('status', 'cancelled')
                    .limit(1)
                    .maybeSingle();

                let status = 'no_booking';
                let bookingTime = null;
                let playersCount = null;

                if (booking) {
                    bookingTime = booking.time?.slice(0, 5);
                    playersCount = booking.players_count;
                    if (booking.status === 'checked_in') {
                        status = 'already_checked_in';
                    } else {
                        await supabase.from('bookings')
                            .update({ status: 'checked_in', checkin_time: new Date() })
                            .eq('id', booking.id);
                        status = 'checked_in';
                    }
                }

                // 查票券
                const { data: vouchers } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .gt('valid_until', new Date().toISOString())
                    .order('valid_until', { ascending: true });

                setScanResult({
                    status,
                    userName: user.display_name,
                    bookingTime,
                    playersCount,
                    date: dateStr,
                });
                setUserVouchers(vouchers || []);

                // 沒有票券就自動回到掃描
                if (!vouchers || vouchers.length === 0) {
                    scheduleReset(AUTO_RESET_MS);
                } else {
                    scheduleReset(VOUCHER_RESET_MS);
                }
            } catch (err) {
                console.error('Kiosk scan error:', err);
                setScanResult({ error: true, title: '掃描處理錯誤', detail: err.message });
                scheduleReset(AUTO_RESET_MS);
            }
        }, () => { });

        return () => {
            clearTimeout(resetTimerRef.current);
            scanner.clear().catch(() => { });
        };
    }, [scheduleReset]);

    // 核銷票券
    const handleRedeem = async (voucher) => {
        try {
            const { error } = await supabase.from('vouchers')
                .update({ status: 'redeemed', redeemed_at: new Date() })
                .eq('id', voucher.id);
            if (error) throw error;

            await supabase.from('voucher_logs').insert([{
                voucher_id: voucher.id,
                action: 'redeemed',
                memo: 'Kiosk 報到機核銷',
                operator_name: 'Kiosk'
            }]);

            setUserVouchers(prev => {
                const next = prev.filter(v => v.id !== voucher.id);
                if (next.length === 0) scheduleReset(AUTO_RESET_MS);
                return next;
            });
        } catch (e) {
            alert('核銷失敗: ' + e.message);
        }
    };

    const now = new Date();
    const dateLabel = format(now, 'yyyy/MM/dd');

    return (
        <div style={styles.fullScreen}>
            {/* 頂部狀態列 */}
            <div style={styles.topBar}>
                <span style={{ fontWeight: 700 }}>⛳ 大衛營 — 報到機</span>
                <span>{dateLabel}</span>
            </div>

            {/* 主要內容 */}
            <div style={styles.mainContent}>
                {!scanResult ? (
                    /* ─── 掃描中 ─── */
                    <div style={styles.scannerArea}>
                        <h2 style={{ color: '#fff', fontSize: '1.3rem', marginBottom: '12px' }}>
                            請掃描 QR Code 報到
                        </h2>
                        <div id="kiosk-reader" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}></div>
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '16px', fontSize: '0.9rem' }}>
                            將手機 QR Code 對準鏡頭
                        </p>
                    </div>
                ) : scanResult.error ? (
                    /* ─── 錯誤 ─── */
                    <div style={styles.resultCard('#fee2e2', '#991b1b')}>
                        <div style={{ fontSize: '3.5rem' }}>❌</div>
                        <h2 style={{ fontSize: '1.6rem', margin: '12px 0 4px' }}>{scanResult.title}</h2>
                        <p style={{ color: '#6b7280' }}>{scanResult.detail}</p>
                        <button onClick={resetScanner} style={styles.continueBtn('#991b1b')}>繼續掃描</button>
                    </div>
                ) : (
                    /* ─── 報到結果 ─── */
                    <div style={{ width: '100%', maxWidth: '500px' }}>
                        <div style={styles.resultCard(
                            scanResult.status === 'no_booking' ? '#fef3c7' : '#dcfce7',
                            scanResult.status === 'no_booking' ? '#92400e' : '#166534'
                        )}>
                            <div style={{ fontSize: '3.5rem' }}>
                                {scanResult.status === 'checked_in' ? '✅' :
                                    scanResult.status === 'already_checked_in' ? '🔄' : '⚠️'}
                            </div>
                            <h2 style={{ fontSize: '2rem', margin: '8px 0 4px' }}>{scanResult.userName}</h2>
                            <div style={{ fontSize: '1.3rem', fontWeight: 600, color: scanResult.status === 'no_booking' ? '#92400e' : '#166534' }}>
                                {scanResult.status === 'checked_in' && '報到成功！'}
                                {scanResult.status === 'already_checked_in' && '今日已報到'}
                                {scanResult.status === 'no_booking' && `今日 (${scanResult.date}) 無預約`}
                            </div>
                            {scanResult.bookingTime && (
                                <p style={{ fontSize: '1.1rem', color: '#374151', marginTop: '8px' }}>
                                    預約 {scanResult.bookingTime} ・ {scanResult.playersCount}位
                                </p>
                            )}
                        </div>

                        {/* 票券 */}
                        {userVouchers.length > 0 && (
                            <div style={styles.voucherSection}>
                                <h3 style={{ marginBottom: '12px', color: '#374151' }}>🎫 可核銷票券 ({userVouchers.length})</h3>
                                {userVouchers.map(v => (
                                    <div key={v.id} style={styles.voucherCard}>
                                        <div>
                                            <strong style={{ fontSize: '1.05rem' }}>{v.product_name}</strong>
                                            <div style={{ fontSize: '0.85rem', color: '#6b7280', fontFamily: 'monospace' }}>{v.code}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#059669' }}>
                                                到期：{new Date(v.valid_until).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button onClick={() => handleRedeem(v)} style={styles.redeemBtn}>核銷</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button onClick={resetScanner} style={styles.continueBtn('#2E7D32')}>
                            繼續掃描下一位
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ──────────────── Styles ──────────────── */
const styles = {
    fullScreen: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a202c',
        padding: '16px',
    },
    topBar: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        background: '#2E7D32',
        color: '#fff',
        fontSize: '0.95rem',
        zIndex: 100,
    },
    mainContent: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        marginTop: '50px',
    },
    scannerArea: {
        textAlign: 'center',
        width: '100%',
        maxWidth: '500px',
    },
    pinCard: {
        background: '#fff',
        borderRadius: '16px',
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '360px',
    },
    pinInput: {
        width: '100%',
        padding: '14px',
        fontSize: '1.3rem',
        textAlign: 'center',
        border: '2px solid #d1d5db',
        borderRadius: '12px',
        outline: 'none',
        letterSpacing: '0.3em',
    },
    pinBtn: {
        width: '100%',
        padding: '14px',
        marginTop: '16px',
        fontSize: '1.1rem',
        fontWeight: 600,
        color: '#fff',
        background: '#2E7D32',
        border: 'none',
        borderRadius: '12px',
        cursor: 'pointer',
    },
    resultCard: (bg, borderColor) => ({
        background: bg,
        border: `3px solid ${borderColor}`,
        borderRadius: '16px',
        padding: '28px 20px',
        textAlign: 'center',
    }),
    voucherSection: {
        marginTop: '16px',
        background: '#fff',
        borderRadius: '12px',
        padding: '16px',
    },
    voucherCard: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        marginBottom: '8px',
    },
    redeemBtn: {
        padding: '10px 20px',
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
        flexShrink: 0,
    },
    continueBtn: (bg) => ({
        width: '100%',
        padding: '16px',
        marginTop: '16px',
        fontSize: '1.2rem',
        fontWeight: 700,
        color: '#fff',
        background: bg,
        border: 'none',
        borderRadius: '12px',
        cursor: 'pointer',
    }),
};
