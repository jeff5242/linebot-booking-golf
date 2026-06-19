import React, { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import { Html5Qrcode } from 'html5-qrcode';
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
                try { document.documentElement.requestFullscreen(); } catch {}
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
                    onChange={e => setPin(e.target.value)}
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

function KioskScanner() {
    const [scanResult, setScanResult] = useState(null);
    const [voucherSummary, setVoucherSummary] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const [retryTrigger, setRetryTrigger] = useState(0);
    const [facingMode, setFacingMode] = useState('environment');
    const scannerRef = useRef(null);
    const processingRef = useRef(false);
    const resetTimerRef = useRef(null);
    const handleScanRef = useRef(null);
    const facingModeRef = useRef(facingMode);

    const restartCamera = async () => {
        const scanner = scannerRef.current;
        if (!scanner) return;
        try {
            const state = scanner.getState();
            if (state === 2) await scanner.stop();
        } catch {}
        setCameraError(null);
        try {
            await scanner.start(
                { facingMode: facingModeRef.current },
                { fps: 10, qrbox: { width: 280, height: 280 } },
                (text) => handleScanRef.current(text),
                () => {}
            );
        } catch (err) {
            setCameraError(err.message || '無法啟動相機');
        }
    };

    const clearResultAndRestart = () => {
        clearTimeout(resetTimerRef.current);
        setScanResult(null);
        setVoucherSummary(null);
        processingRef.current = false;
        restartCamera();
    };

    const scheduleReset = (ms) => {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(clearResultAndRestart, ms);
    };

    handleScanRef.current = async (decodedText) => {
        if (processingRef.current) return;
        processingRef.current = true;

        try {
            const scanner = scannerRef.current;
            if (scanner) {
                try { await scanner.stop(); } catch {}
            }

            let phone = decodedText;
            try {
                const json = JSON.parse(decodedText);
                if (json.phone) phone = json.phone;
            } catch {}

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

            const { data: vouchers } = await supabase
                .from('vouchers')
                .select('id, product_name')
                .eq('user_id', user.id)
                .eq('status', 'active');

            const all = vouchers || [];
            const greenFeeCount = all.filter(v => v.product_name === '果嶺券').length;
            const productCount = all.filter(v => v.product_name === '商品券').length;

            setScanResult({
                status,
                userName: user.display_name,
                bookingTime,
                playersCount,
                date: dateStr,
            });
            setVoucherSummary({ greenFeeCount, productCount, total: all.length });

            scheduleReset(all.length > 0 ? VOUCHER_RESET_MS : AUTO_RESET_MS);
        } catch (err) {
            setScanResult({ error: true, title: '掃描處理錯誤', detail: err.message });
            scheduleReset(AUTO_RESET_MS);
        }
    };

    useEffect(() => {
        const container = document.getElementById('kiosk-reader');
        if (container) container.innerHTML = '';

        const scanner = new Html5Qrcode('kiosk-reader');
        scannerRef.current = scanner;

        scanner.start(
            { facingMode: facingModeRef.current },
            { fps: 10, qrbox: { width: 280, height: 280 } },
            (text) => handleScanRef.current(text),
            () => {}
        ).catch(err => {
            setCameraError(err.message || '無法啟動相機');
        });

        return () => {
            clearTimeout(resetTimerRef.current);
            scanner.stop().catch(() => {});
        };
    }, []);

    useEffect(() => {
        facingModeRef.current = facingMode;
        if (!scannerRef.current) return;
        restartCamera();
    }, [facingMode]);

    const handleRetry = () => {
        setRetryTrigger(n => n + 1);
        restartCamera();
    };

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    };

    const dateLabel = format(new Date(), 'yyyy/MM/dd');

    return (
        <div style={styles.fullScreen}>
            <div style={styles.topBar}>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>⛳ 大衛營 — 報到機</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>{dateLabel}</span>
                    <button onClick={toggleFullscreen} style={styles.fullscreenBtn} title="全螢幕切換">⛶</button>
                </div>
            </div>

            <div style={styles.mainContent}>
                <div style={{ display: scanResult ? 'none' : 'block' }}>
                    <div style={styles.scannerArea}>
                        <h2 style={styles.scanTitle}>請掃描 QR Code 報到</h2>
                        <div id="kiosk-reader" style={styles.readerContainer}></div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '12px' }}>
                            <button
                                onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
                                style={styles.cameraSwitchBtn}
                            >
                                🔄 {facingMode === 'environment' ? '切換前鏡頭' : '切換後鏡頭'}
                            </button>
                        </div>
                        {cameraError ? (
                            <div style={styles.cameraErrorBox}>
                                <p style={{ margin: '0 0 12px', fontWeight: '600', fontSize: '1.1rem' }}>相機啟動失敗</p>
                                <p style={{ margin: '0 0 16px', fontSize: '0.9rem' }}>{cameraError}</p>
                                <button onClick={handleRetry} style={styles.retryBtn}>重新啟動相機</button>
                            </div>
                        ) : (
                            <p style={styles.scanHint}>將手機 QR Code 對準鏡頭</p>
                        )}
                    </div>
                </div>

                {scanResult && (scanResult.error ? (
                    <div style={styles.resultCardError}>
                        <div style={{ fontSize: '3.5rem' }}>❌</div>
                        <h2 style={styles.resultTitle}>{scanResult.title}</h2>
                        <p style={{ color: '#6b7280' }}>{scanResult.detail}</p>
                        <button onClick={clearResultAndRestart} style={styles.continueBtn('#dc2626')}>繼續掃描</button>
                    </div>
                ) : (
                    <div style={{ width: '100%', maxWidth: '520px' }}>
                        <div style={styles.resultCardByStatus(scanResult.status)}>
                            <div style={{ fontSize: '3.5rem' }}>
                                {scanResult.status === 'checked_in' ? '✅' :
                                    scanResult.status === 'already_checked_in' ? '🔄' : '⚠️'}
                            </div>
                            <h2 style={styles.resultName}>{scanResult.userName}</h2>
                            <div style={styles.resultStatus(scanResult.status)}>
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

                        {voucherSummary && (voucherSummary.greenFeeCount > 0 || voucherSummary.productCount > 0) && (
                            <div style={styles.voucherSummaryBox}>
                                <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: '#374151' }}>🎟️ 電子票券持有數量</h3>
                                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
                                    <div style={styles.summaryChip('#1d4ed8', '#eff6ff')}>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 'bold', lineHeight: 1.2 }}>{voucherSummary.greenFeeCount}</div>
                                        <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>果嶺券</div>
                                    </div>
                                    <div style={styles.summaryChip('#166534', '#f0fdf4')}>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 'bold', lineHeight: 1.2 }}>{voucherSummary.productCount}</div>
                                        <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>商品券</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button onClick={clearResultAndRestart} style={styles.continueBtn('#2E7D32')}>
                            繼續掃描下一位
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    fullScreen: {
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #f0f9f0 0%, #e8f5e9 50%, #f5f5f5 100%)',
        padding: 0,
    },
    topBar: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 20px',
        background: 'linear-gradient(90deg, #1b5e20, #2E7D32)',
        color: '#fff',
        fontSize: '0.95rem',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    },
    fullscreenBtn: {
        padding: '4px 10px',
        border: '1px solid rgba(255,255,255,0.5)',
        borderRadius: '6px',
        background: 'rgba(255,255,255,0.15)',
        color: '#fff',
        fontSize: '1.2rem',
        cursor: 'pointer',
    },
    mainContent: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: '70px 16px 24px',
    },
    scannerArea: {
        textAlign: 'center',
        width: '100%',
        maxWidth: '520px',
    },
    scanTitle: {
        color: '#1a202c',
        fontSize: '1.5rem',
        marginBottom: '16px',
        fontWeight: 700,
    },
    readerContainer: {
        width: '100%',
        maxWidth: '420px',
        margin: '0 auto',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '3px solid #2E7D32',
        background: '#000',
    },
    scanHint: {
        color: '#6b7280',
        marginTop: '16px',
        fontSize: '1rem',
    },
    cameraErrorBox: {
        marginTop: '20px',
        padding: '24px',
        background: '#fff',
        borderRadius: '12px',
        border: '2px solid #fca5a5',
        color: '#991b1b',
    },
    retryBtn: {
        padding: '12px 28px',
        background: '#2E7D32',
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '1rem',
        fontWeight: 600,
        cursor: 'pointer',
    },
    cameraSwitchBtn: {
        padding: '10px 20px',
        background: '#fff',
        color: '#374151',
        border: '2px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '0.95rem',
        fontWeight: 600,
        cursor: 'pointer',
    },
    pinCard: {
        background: '#fff',
        borderRadius: '16px',
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
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
    resultCardError: {
        background: '#fff',
        border: '3px solid #dc2626',
        borderRadius: '16px',
        padding: '28px 20px',
        textAlign: 'center',
        width: '100%',
        maxWidth: '500px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    },
    resultCardByStatus: (status) => ({
        background: '#fff',
        border: `3px solid ${status === 'no_booking' ? '#f59e0b' : '#16a34a'}`,
        borderRadius: '16px',
        padding: '28px 20px',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    }),
    resultTitle: {
        fontSize: '1.6rem',
        margin: '12px 0 4px',
        color: '#1a202c',
    },
    resultName: {
        fontSize: '2rem',
        margin: '8px 0 4px',
        color: '#1a202c',
    },
    resultStatus: (status) => ({
        fontSize: '1.3rem',
        fontWeight: 700,
        color: status === 'no_booking' ? '#b45309' : '#16a34a',
    }),
    voucherSummaryBox: {
        marginTop: '16px',
        background: '#fff',
        borderRadius: '12px',
        padding: '20px',
        textAlign: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    },
    summaryChip: (color, bg) => ({
        flex: 1,
        padding: '16px 20px',
        background: bg,
        borderRadius: '12px',
        color,
        textAlign: 'center',
        border: `1px solid ${color}33`,
    }),
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
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }),
};
