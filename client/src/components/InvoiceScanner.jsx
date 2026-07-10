import React, { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const READER_ID = 'invoice-qr-reader';

// 掃描台灣電子發票證明聯「左邊」QR：內容開頭 10 碼即發票號碼（2 英文 + 8 數字）。
// 掃到有效號碼即回填並自動關閉相機；掃不到可改手動輸入。
export function InvoiceScanner({ onScanned }) {
    const [scanning, setScanning] = useState(false);
    const [hint, setHint] = useState('');
    const [error, setError] = useState('');
    const instRef = useRef(null);
    const lastRef = useRef('');

    const stop = async () => {
        const inst = instRef.current;
        instRef.current = null;
        if (inst) {
            try { await inst.stop(); } catch { /* 已停止 */ }
            try { inst.clear(); } catch { /* noop */ }
        }
        setScanning(false);
    };

    useEffect(() => {
        if (!scanning) return;
        setError('');
        setHint('對準電子發票證明聯「左邊」的 QR');
        lastRef.current = '';
        const inst = new Html5Qrcode(READER_ID);
        instRef.current = inst;
        inst.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (text) => {
                if (text === lastRef.current) return;
                lastRef.current = text;
                const code = (text || '').slice(0, 10).toUpperCase();
                if (/^[A-Z]{2}\d{8}$/.test(code)) {
                    onScanned(code);
                    stop();
                } else {
                    setHint('掃到的不是發票號碼，請掃「左邊」那個 QR');
                }
            },
            () => { /* 每幀解碼失敗，忽略 */ }
        ).catch(err => {
            setError('無法開啟相機：' + (err?.message || err) + '（請改用手動輸入）');
            instRef.current = null;
            setScanning(false);
        });
        // 元件卸載時確保停掉相機
        return () => {
            const inst2 = instRef.current;
            instRef.current = null;
            if (inst2) { inst2.stop().then(() => inst2.clear()).catch(() => {}); }
        };
    }, [scanning]);

    if (!scanning) {
        return (
            <div style={{ marginTop: '8px' }}>
                <button
                    type="button"
                    onClick={() => setScanning(true)}
                    style={{ padding: '8px 14px', border: '1px solid #7c3aed', borderRadius: '6px', background: '#f5f3ff', color: '#7c3aed', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
                >
                    📷 掃描發票 QR 自動帶入
                </button>
                {error && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{error}</div>}
            </div>
        );
    }

    return (
        <div style={{ marginTop: '10px' }}>
            <div id={READER_ID} style={{ width: '100%', maxWidth: '320px', margin: '0 auto', borderRadius: '8px', overflow: 'hidden' }} />
            <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', marginTop: '6px' }}>{hint}</div>
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <button type="button" onClick={stop} style={{ padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                    取消掃描
                </button>
            </div>
        </div>
    );
}
