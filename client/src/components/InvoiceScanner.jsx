import React, { useState, useRef, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const READER_ID = 'invoice-qr-reader';
const INVOICE_RE = /^[A-Z]{2}\d{8}$/;

// 判斷掃到的 QR 是哪一種，回傳 { type, code }
// - left  ：財政部電子發票「左邊」QR，開頭 10 碼即發票號碼 → 取號
// - right ：「右邊」QR（發票明細延續，開頭多為 ** + base64），不含號碼
// - other ：非電子發票 QR
function classify(text) {
    const raw = (text || '').trim();
    const head = raw.slice(0, 10).toUpperCase();
    if (INVOICE_RE.test(head)) return { type: 'left', code: head };
    if (raw.startsWith('**')) return { type: 'right', code: '' };
    return { type: 'other', code: '' };
}

// 掃描台灣電子發票「左邊」QR 自動帶入發票號碼；掃到右邊/非發票即時導引、持續掃描。
export function InvoiceScanner({ onScanned }) {
    const [scanning, setScanning] = useState(false);
    const [status, setStatus] = useState({ kind: 'idle', msg: '' }); // idle|hint|warn|success
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
        setStatus({ kind: 'hint', msg: '把發票「左邊」的 QR 對準框內' });
        lastRef.current = '';
        const inst = new Html5Qrcode(READER_ID);
        instRef.current = inst;
        inst.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: { width: 240, height: 240 } },
            (text) => {
                if (text === lastRef.current) return; // 同一張 QR 不重複處理
                lastRef.current = text;
                const { type, code } = classify(text);
                if (type === 'left') {
                    setStatus({ kind: 'success', msg: `✅ 已辨識發票號碼 ${code}` });
                    onScanned(code);
                    setTimeout(() => { stop(); }, 700); // 讓使用者看到成功訊息再關
                } else if (type === 'right') {
                    setStatus({ kind: 'warn', msg: '這是右邊「發票明細」QR（不含號碼），請往左掃「左邊」那個' });
                } else {
                    setStatus({ kind: 'warn', msg: '這不是電子發票 QR，請對準發票左邊含號碼的 QR' });
                }
            },
            () => { /* 每幀解碼失敗，忽略 */ }
        ).catch(err => {
            setError('無法開啟相機：' + (err?.message || err) + '（請改用手動輸入）');
            instRef.current = null;
            setScanning(false);
        });
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
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '5px' }}>
                    發票通常有兩個 QR：<b>左邊含號碼</b>、右邊是明細。掃左邊那個即可。
                </div>
                {error && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{error}</div>}
            </div>
        );
    }

    const statusColor = status.kind === 'success' ? '#16a34a' : status.kind === 'warn' ? '#c2410c' : '#6b7280';
    const statusBg = status.kind === 'success' ? '#f0fdf4' : status.kind === 'warn' ? '#fff7ed' : '#f9fafb';

    return (
        <div style={{ marginTop: '10px' }}>
            <div id={READER_ID} style={{ width: '100%', maxWidth: '320px', margin: '0 auto', borderRadius: '8px', overflow: 'hidden' }} />
            <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: statusBg, color: statusColor, fontSize: '12.5px', fontWeight: '600', textAlign: 'center' }}>
                {status.msg}
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <button type="button" onClick={stop} style={{ padding: '6px 16px', border: '1px solid #d1d5db', borderRadius: '6px', background: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>
                    取消掃描 / 改手動輸入
                </button>
            </div>
        </div>
    );
}
