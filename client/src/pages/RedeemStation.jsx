import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import liff from '@line/liff';

const apiUrl = import.meta.env.VITE_API_URL || '';
const LIFF_ID = import.meta.env.VITE_STAFF_LIFF_ID || '';
const TOKEN_KEY = 'redeem_jwt';
const INFO_KEY = 'redeem_info';
const READER_ID = 'redeem-qr-reader';

const getToken = () => localStorage.getItem(TOKEN_KEY);
async function api(path, opts = {}) {
    const token = getToken();
    return fetch(apiUrl + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
    });
}

const GREEN = '#166534';
const wrap = { minHeight: '100vh', background: '#f1f5f2', fontFamily: '"PingFang TC","Noto Sans TC",sans-serif', color: '#14201a' };
const card = { background: '#fff', borderRadius: '14px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' };
const bigBtn = (bg) => ({ width: '100%', padding: '16px', border: 'none', borderRadius: '12px', background: bg, color: '#fff', fontSize: '1.05rem', fontWeight: 700, cursor: 'pointer' });
const inp = { width: '100%', padding: '14px', border: '1px solid #cdd8cf', borderRadius: '10px', fontSize: '1.05rem', boxSizing: 'border-box' };

export function RedeemStation() {
    const [loggedIn, setLoggedIn] = useState(!!getToken());
    const [info, setInfo] = useState(() => { try { return JSON.parse(localStorage.getItem(INFO_KEY) || 'null'); } catch { return null; } });
    const [phase, setPhase] = useState('init'); // init | login | bind
    const [lineIdToken, setLineIdToken] = useState(null);
    const [note, setNote] = useState('');

    const finishLogin = (r) => {
        localStorage.setItem(TOKEN_KEY, r.token); localStorage.setItem(INFO_KEY, JSON.stringify(r.admin));
        setInfo(r.admin); setLoggedIn(true);
    };

    // 進站時：若有設 LIFF、在 LINE 內 → 嘗試 LINE 免登入；否則退回手機+PIN
    useEffect(() => {
        if (loggedIn) return;
        if (!LIFF_ID) { setPhase('login'); return; }
        let cancelled = false;
        (async () => {
            try {
                await liff.init({ liffId: LIFF_ID });
                if (!liff.isLoggedIn()) { liff.login(); return; }
                const idToken = liff.getIDToken();
                if (!idToken) { setPhase('login'); return; }
                const res = await api('/api/redeem-station/line-login', { method: 'POST', body: JSON.stringify({ idToken }) });
                const data = await res.json();
                if (cancelled) return;
                if (res.ok && data.bound) { finishLogin(data); return; }
                if (data.needsBinding) { setLineIdToken(idToken); setPhase('bind'); return; }
                setNote(data.error || ''); setPhase('login');
            } catch (e) {
                if (!cancelled) setPhase('login'); // 不在 LINE 內 / LIFF 失敗 → 手機+PIN
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const logout = () => {
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(INFO_KEY);
        setInfo(null); setLoggedIn(false); setPhase(LIFF_ID ? 'init' : 'login');
    };

    return (
        <div style={wrap}>
            <div style={{ maxWidth: '440px', margin: '0 auto', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.15rem', color: GREEN }}>🎟️ 商品券核銷站</div>
                    {loggedIn && <button onClick={logout} style={{ border: '1px solid #cdd8cf', background: '#fff', borderRadius: '8px', padding: '6px 12px', fontSize: '.85rem', cursor: 'pointer' }}>登出</button>}
                </div>
                {loggedIn ? <RedeemView info={info} onExpired={logout} />
                    : phase === 'init' ? <div style={{ ...card, textAlign: 'center', color: '#5d6d63' }}>啟動中…</div>
                    : phase === 'bind' ? <BindView idToken={lineIdToken} onLoggedIn={finishLogin} />
                    : <LoginView onLoggedIn={finishLogin} note={note} />}
            </div>
        </div>
    );
}

function BindView({ idToken, onLoggedIn }) {
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setErr(''); setLoading(true);
        try {
            const res = await api('/api/redeem-station/bind', { method: 'POST', body: JSON.stringify({ idToken, phone: phone.trim(), pin: pin.trim() }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '綁定失敗');
            onLoggedIn(data);
        } catch (e) { setErr(e.message); } finally { setLoading(false); }
    };

    return (
        <div style={card}>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>首次綁定</h2>
            <p style={{ margin: '0 0 18px', color: '#5d6d63', fontSize: '.9rem' }}>用手機號碼 + 核銷 PIN 綁定一次，之後開這個頁面就自動登入、免再輸入。</p>
            <label style={{ fontSize: '.85rem', fontWeight: 600 }}>手機號碼</label>
            <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="09xxxxxxxx" style={{ ...inp, margin: '6px 0 14px' }} />
            <label style={{ fontSize: '.85rem', fontWeight: 600 }}>核銷 PIN</label>
            <input value={pin} onChange={e => setPin(e.target.value)} inputMode="numeric" type="password" placeholder="請輸入 PIN" style={{ ...inp, margin: '6px 0 18px' }} />
            {err && <div style={{ color: '#dc2626', fontSize: '.88rem', marginBottom: '12px' }}>{err}</div>}
            <button onClick={submit} disabled={loading || !phone || !pin} style={bigBtn(loading || !phone || !pin ? '#9ca3af' : GREEN)}>{loading ? '綁定中…' : '綁定並開始核銷'}</button>
        </div>
    );
}

function LoginView({ onLoggedIn, note }) {
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [err, setErr] = useState(note || '');
    const [loading, setLoading] = useState(false);

    const submit = async () => {
        setErr(''); setLoading(true);
        try {
            const res = await api('/api/redeem-station/login', { method: 'POST', body: JSON.stringify({ phone: phone.trim(), pin: pin.trim() }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '登入失敗');
            onLoggedIn(data);
        } catch (e) { setErr(e.message); } finally { setLoading(false); }
    };

    return (
        <div style={card}>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>員工登入</h2>
            <p style={{ margin: '0 0 18px', color: '#5d6d63', fontSize: '.9rem' }}>用你的手機號碼與核銷 PIN 登入。</p>
            <label style={{ fontSize: '.85rem', fontWeight: 600 }}>手機號碼</label>
            <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" placeholder="09xxxxxxxx" style={{ ...inp, margin: '6px 0 14px' }} />
            <label style={{ fontSize: '.85rem', fontWeight: 600 }}>核銷 PIN</label>
            <input value={pin} onChange={e => setPin(e.target.value)} inputMode="numeric" type="password" placeholder="請輸入 PIN" style={{ ...inp, margin: '6px 0 18px' }} />
            {err && <div style={{ color: '#dc2626', fontSize: '.88rem', marginBottom: '12px' }}>{err}</div>}
            <button onClick={submit} disabled={loading || !phone || !pin} style={{ ...bigBtn(loading || !phone || !pin ? '#9ca3af' : GREEN) }}>{loading ? '登入中…' : '登入'}</button>
        </div>
    );
}

function RedeemView({ info, onExpired }) {
    const [scanning, setScanning] = useState(false);
    const [scanHint, setScanHint] = useState('');
    const [member, setMember] = useState(null);
    const [vouchers, setVouchers] = useState([]);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState('');
    const [err, setErr] = useState('');
    const instRef = useRef(null);
    const lastRef = useRef('');

    const stopScan = async () => {
        const inst = instRef.current; instRef.current = null;
        if (inst) { try { await inst.stop(); } catch {} try { inst.clear(); } catch {} }
        setScanning(false);
    };

    useEffect(() => {
        if (!scanning) return;
        setErr(''); setScanHint('把會員的報到 QR 對準框內'); lastRef.current = '';
        const inst = new Html5Qrcode(READER_ID); instRef.current = inst;
        inst.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: 240, height: 240 } },
            (text) => {
                if (text === lastRef.current) return; lastRef.current = text;
                let phone = text;
                try { const j = JSON.parse(text); if (j.phone) phone = j.phone; } catch {}
                phone = String(phone).replace(/[^0-9]/g, '');
                if (/^09\d{8}$/.test(phone)) { stopScan(); lookup(phone); }
                else setScanHint('這不是會員 QR，請掃會員專區的「報到 QR」');
            },
            () => {}
        ).catch(e => { setErr('無法開啟相機：' + (e?.message || e)); setScanning(false); instRef.current = null; });
        return () => { const i = instRef.current; instRef.current = null; if (i) { i.stop().then(() => i.clear()).catch(() => {}); } };
    }, [scanning]);

    const lookup = async (phone) => {
        setErr(''); setBusy(true); setToast('');
        try {
            const res = await api('/api/redeem-station/lookup?phone=' + encodeURIComponent(phone));
            if (res.status === 401) { onExpired(); return; }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '查詢失敗');
            setMember(data.member); setVouchers(data.vouchers || []);
        } catch (e) { setErr(e.message); setMember(null); setVouchers([]); } finally { setBusy(false); }
    };

    const redeem = async (v) => {
        if (!window.confirm(`確定核銷這張商品券？\n${v.code}（$${v.price}）`)) return;
        setBusy(true); setErr('');
        try {
            const res = await api('/api/voucher-ops/scan-redeem', { method: 'POST', body: JSON.stringify({ voucher_id: v.id }) });
            if (res.status === 401) { onExpired(); return; }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '核銷失敗');
            setVouchers(prev => prev.filter(x => x.id !== v.id));
            setToast(`✅ 已核銷 ${v.code}`);
        } catch (e) { setErr(e.message); } finally { setBusy(false); }
    };

    const reset = () => { setMember(null); setVouchers([]); setToast(''); setErr(''); };

    return (
        <div>
            <div style={{ fontSize: '.82rem', color: '#5d6d63', marginBottom: '12px' }}>操作人：<b>{info?.name || '-'}</b>　僅可核銷商品券</div>

            {scanning && (
                <div style={{ ...card, marginBottom: '14px' }}>
                    <div id={READER_ID} style={{ width: '100%', borderRadius: '10px', overflow: 'hidden' }} />
                    <div style={{ textAlign: 'center', color: '#5d6d63', fontSize: '.85rem', margin: '10px 0' }}>{scanHint}</div>
                    <button onClick={stopScan} style={{ ...bigBtn('#6b7280') }}>取消掃描</button>
                </div>
            )}

            {!scanning && !member && (
                <div style={card}>
                    <p style={{ margin: '0 0 16px', color: '#5d6d63' }}>掃描會員的「報到 QR」來核銷他的商品券。</p>
                    <button onClick={() => setScanning(true)} style={bigBtn(GREEN)}>📷 掃描會員 QR</button>
                </div>
            )}

            {toast && <div style={{ ...card, marginTop: '14px', background: '#f0fdf4', color: '#15803d', fontWeight: 700, textAlign: 'center' }}>{toast}</div>}
            {err && <div style={{ ...card, marginTop: '14px', background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>{err}</div>}

            {member && (
                <div style={{ ...card, marginTop: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div><b style={{ fontSize: '1.05rem' }}>{member.display_name || '-'}</b>{member.member_no && <span style={{ color: '#9ca3af', fontSize: '.8rem', marginLeft: '6px' }}>#{member.member_no}</span>}<div style={{ color: '#5d6d63', fontSize: '.82rem' }}>{member.phone}</div></div>
                        <button onClick={reset} style={{ border: '1px solid #cdd8cf', background: '#fff', borderRadius: '8px', padding: '8px 12px', fontSize: '.85rem', cursor: 'pointer' }}>換一位</button>
                    </div>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#5d6d63', margin: '4px 0 10px' }}>可核銷商品券（{vouchers.length} 張）</div>
                    {vouchers.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>此會員目前沒有可核銷的商品券</div>
                    ) : (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {vouchers.map(v => (
                                <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px', border: '1px solid #e2e8e2', borderRadius: '10px' }}>
                                    <div>
                                        <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v.code}</div>
                                        <div style={{ fontSize: '.78rem', color: '#9ca3af' }}>${v.price}　到期 {String(v.valid_until).slice(0, 10)}</div>
                                    </div>
                                    <button onClick={() => redeem(v)} disabled={busy} style={{ padding: '10px 18px', border: 'none', borderRadius: '10px', background: busy ? '#9ca3af' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: '.95rem', cursor: 'pointer', flexShrink: 0 }}>核銷</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
