import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../supabase';
import { buildBoard } from '../utils/playerCheckin';
import { fetchBoardState, saveDeparted } from '../utils/checkinBoardApi';

// 當日報到看板：給桿弟與發球台人員看。每頁 6 組，每 10 秒換頁；11:00 前秀上午場、11:00 起秀下午場。
const STAGE_W = 1920;
const STAGE_H = 1080;
const PAGE_SECONDS = 10;
const REFRESH_MS = 15000;
const UNDO_SECONDS = 10;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const FONT = "'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', system-ui, sans-serif";

const C = {
    ground: '#0f1a16', card: '#172721', cardLine: '#24382f', chip: '#23362e',
    text: '#e8efe9', muted: '#a9bdb3', soft: '#cfe0d6', green: '#187a50', empty: '#3a5047', emptyText: '#8ea69b',
};

function CheckIcon({ size, stroke = 3 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={stroke}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
    );
}

const nameStyle = { fontSize: 56, lineHeight: 1.1, fontWeight: 900, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const tileBase = { borderRadius: 12, padding: '8px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 0 };

function Seat({ seat }) {
    if (seat.empty) {
        return (
            <div style={{ border: `2px dashed ${C.empty}`, color: C.emptyText, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 500 }}>
                空位
            </div>
        );
    }
    if (seat.checked) {
        return (
            <div style={{ ...tileBase, background: C.green, color: '#fff' }}>
                <span style={nameStyle}>{seat.name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 22, fontWeight: 700 }}>
                    <CheckIcon size={24} stroke={3.5} />已報到
                </span>
            </div>
        );
    }
    return (
        <div style={{ ...tileBase, background: '#fff', color: '#13201b' }}>
            <span style={nameStyle}>{seat.name}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#4f5f58' }}>未報到</span>
        </div>
    );
}

function ArrowIcon() {
    return (
        <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="#6fcf9f" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h13" /><path d="M13 6l6 6-6 6" />
        </svg>
    );
}

function DepartBar({ g, onDepart, busy }) {
    const hint = g.hideInSeconds === null ? '出發後請按「已出發」' : `${g.hideInSeconds} 秒後自動移除`;
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, borderTop: '1px solid #2a3f36' }}>
            <span style={{ fontSize: 20, color: C.muted }}>{hint}</span>
            <button type="button" onClick={() => onDepart(g)} disabled={busy}
                style={{ minHeight: 52, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 999, border: '2px solid #6fcf9f', background: 'transparent', color: '#fff', fontFamily: 'inherit', fontSize: 26, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                <ArrowIcon />已出發
            </button>
        </div>
    );
}

function GroupCard({ g, onDepart, canDepart, busy }) {
    return (
        <section style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 18, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
                    <h2 style={{ margin: 0, fontSize: 42, fontWeight: 900, color: '#fff' }}>第 {g.no} 組</h2>
                    <span style={{ fontSize: 36, fontWeight: 700, color: C.soft }}>{g.time}</span>
                    {g.holes ? <span style={{ fontSize: 22, color: C.muted }}>{g.holes} 洞</span> : null}
                </div>
                {g.allIn ? (
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', background: C.green, borderRadius: 999, padding: '6px 16px' }}>全員到齊</span>
                ) : (
                    <span style={{ fontSize: 22, fontWeight: 700, color: C.soft, background: C.chip, borderRadius: 999, padding: '6px 16px' }}>已到 {g.inCount} / {g.size}</span>
                )}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)', gap: 12 }}>
                {g.seats.map((s, i) => <Seat key={i} seat={s} />)}
            </div>
            {g.allIn && canDepart && <DepartBar g={g} onDepart={onDepart} busy={busy} />}
        </section>
    );
}

/** 依容器寬高等比例縮放 1920×1080 的畫面 */
function useStageScale(ref) {
    const [scale, setScale] = useState(0.5);
    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const update = () => {
            const w = el.clientWidth;
            const h = document.fullscreenElement === el ? el.clientHeight : w * (STAGE_H / STAGE_W);
            setScale(Math.min(w / STAGE_W, h / STAGE_H) || 0.5);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        document.addEventListener('fullscreenchange', update);
        return () => { ro.disconnect(); document.removeEventListener('fullscreenchange', update); };
    }, [ref]);
    return scale;
}

export default function CheckinBoard({ systemSettings }) {
    const [bookings, setBookings] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [now, setNow] = useState(() => new Date());
    const [rotation, setRotation] = useState({ page: 0, elapsed: 0 });
    const [departed, setDeparted] = useState({});
    const [autoHideSeconds, setAutoHideSeconds] = useState(0);
    const [departAvailable, setDepartAvailable] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [toast, setToast] = useState(null); // { id, no, left, error? }
    const { page, elapsed } = rotation;
    const wrapRef = useRef(null);
    const scale = useStageScale(wrapRef);

    const today = format(now, 'yyyy-MM-dd');

    const loadDeparted = useCallback(async () => {
        try {
            const state = await fetchBoardState(today);
            setDeparted(state.departed);
            setAutoHideSeconds(state.autoHideSeconds);
            setDepartAvailable(true);
        } catch {
            // 後端還沒部署新版或暫時連不上：照常顯示報到，只是不能按「已出發」、不自動移除
            setDepartAvailable(false);
            setAutoHideSeconds(0);
        }
    }, [today]);

    const load = useCallback(async () => {
        loadDeparted();
        const { data, error } = await supabase
            .from('bookings')
            .select('id, time, holes, players_count, players_info, status, checkin_time')
            .eq('date', today)
            .neq('status', 'cancelled');
        if (error) { setLoadError(`讀取預約失敗：${error.message}`); return; }
        setLoadError('');
        setBookings(data || []);
    }, [today]);

    useEffect(() => {
        load();
        const id = setInterval(load, REFRESH_MS);
        return () => clearInterval(id);
    }, [load]);

    useEffect(() => {
        const id = setInterval(() => {
            setNow(new Date());
            setToast(t => (t && t.left > 1 ? { ...t, left: t.left - 1 } : null));
            setRotation(r => (r.elapsed + 1 >= PAGE_SECONDS
                ? { page: r.page + 1, elapsed: 0 }
                : { page: r.page, elapsed: r.elapsed + 1 }));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    const board = buildBoard(bookings, {
        settings: systemSettings, nowMinutes: now.getHours() * 60 + now.getMinutes(),
        departed, autoHideSeconds, nowMs: now.getTime(),
    });

    const markDeparted = async (g) => {
        setBusyId(g.id);
        setDeparted(m => ({ ...m, [g.id]: new Date().toISOString() }));
        try {
            setDeparted(await saveDeparted(today, g.id, true));
            setToast({ id: g.id, no: g.no, left: UNDO_SECONDS });
        } catch (e) {
            setDeparted(m => { const { [g.id]: _x, ...rest } = m; return rest; });
            setToast({ id: g.id, no: g.no, left: UNDO_SECONDS, error: e.message });
        } finally {
            setBusyId(null);
        }
    };

    const undoDeparted = async () => {
        if (!toast || toast.error) return;
        const { id, no } = toast;
        setToast(null);
        try {
            setDeparted(await saveDeparted(today, id, false));
        } catch (e) {
            setToast({ id, no, left: UNDO_SECONDS, error: `第 ${no} 組復原失敗：${e.message}` });
        }
    };
    const pageCount = Math.max(1, board.pages.length);
    const current = page % pageCount;
    const groups = board.pages[current] || [];
    const sessionLabel = board.session === 'am' ? '上午' : '下午';

    const toggleFullscreen = () => {
        const el = wrapRef.current;
        if (!el) return;
        if (document.fullscreenElement) document.exitFullscreen();
        else if (el.requestFullscreen) el.requestFullscreen();
    };

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ color: '#4b5563', fontSize: '0.9rem' }}>
                    每 {PAGE_SECONDS} 秒換頁，每 {REFRESH_MS / 1000} 秒更新報到資料。11:00 前顯示上午場，11:00 起顯示下午場。
                    {departAvailable
                        ? (autoHideSeconds > 0 ? ` 全員到齊 ${autoHideSeconds} 秒後自動移除。` : ' 自動移除已關閉，出發後請按「已出發」。')
                        : ' 「已出發」暫時無法使用。'}
                </div>
                <button type="button" onClick={toggleFullscreen} className="btn" style={{ width: 'auto', padding: '6px 14px' }}>全螢幕</button>
            </div>
            {loadError && <div role="alert" style={{ color: '#dc2626' }}>{loadError}</div>}
            <div ref={wrapRef} style={{ width: '100%', aspectRatio: `${STAGE_W} / ${STAGE_H}`, background: C.ground, overflow: 'hidden', position: 'relative', borderRadius: 8 }}>
                <div style={{
                    width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left',
                    position: 'absolute', top: 0, left: 0, boxSizing: 'border-box', padding: '36px 56px 32px',
                    display: 'flex', flexDirection: 'column', gap: 26, background: C.ground, color: C.text,
                    fontFamily: FONT, fontVariantNumeric: 'tabular-nums',
                }}>
                    <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
                            <h1 style={{ margin: 0, fontSize: 52, fontWeight: 900, letterSpacing: '0.04em', color: '#fff' }}>今日報到</h1>
                            <span style={{ fontSize: 28, fontWeight: 500, color: C.muted }}>{today}（{WEEKDAYS[now.getDay()]}）</span>
                            <span style={{ alignSelf: 'center', fontSize: 26, fontWeight: 700, color: '#13201b', background: '#f2c14e', borderRadius: 999, padding: '6px 20px' }}>{sessionLabel}場</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                <span style={{ fontSize: 22, color: C.muted }}>{sessionLabel}</span>
                                <span style={{ fontSize: 40, fontWeight: 700, color: '#fff' }}>{board.totalGroups}</span>
                                <span style={{ fontSize: 22, color: C.muted }}>組</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                <span style={{ fontSize: 22, color: C.muted }}>已出發</span>
                                <span style={{ fontSize: 40, fontWeight: 700, color: '#fff' }}>{board.departedGroups}</span>
                                <span style={{ fontSize: 22, color: C.muted }}>組</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                <span style={{ fontSize: 22, color: C.muted }}>已報到</span>
                                <span style={{ fontSize: 40, fontWeight: 700, color: '#fff' }}>{board.checkedPlayers}</span>
                                <span style={{ fontSize: 26, color: C.muted }}>/ {board.totalPlayers} 人</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '12px 20px', border: '1px solid #2a3f36', borderRadius: 12 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22 }}>
                                    <span style={{ width: 28, height: 28, borderRadius: 6, background: '#fff' }} />未報到
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22 }}>
                                    <span style={{ width: 28, height: 28, borderRadius: 6, background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <CheckIcon size={18} stroke={3.5} />
                                    </span>已報到
                                </span>
                            </div>
                        </div>
                    </header>

                    <main style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 24 }}>
                        {groups.map(g => <GroupCard key={g.id} g={g} onDepart={markDeparted} canDepart={departAvailable} busy={busyId === g.id} />)}
                        {groups.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', gridRow: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: C.muted }}>
                                {board.totalGroups > 0 ? `${sessionLabel}場的組都已出發` : `${sessionLabel}場目前沒有預約`}
                            </div>
                        )}
                    </main>

                    <footer style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {Array.from({ length: pageCount }, (_, k) => (
                                    <span key={k} style={{ width: k === current ? 40 : 12, height: 12, borderRadius: 6, background: k === current ? '#fff' : C.empty }} />
                                ))}
                                <span style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginLeft: 8 }}>第 {current + 1} / {pageCount} 頁</span>
                            </div>
                            <span style={{ fontSize: 22, color: C.muted }}>每 {PAGE_SECONDS} 秒自動換頁 · {PAGE_SECONDS - elapsed} 秒後換下一頁</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: C.chip, overflow: 'hidden' }}>
                            <div style={{ height: 6, borderRadius: 3, background: '#6fcf9f', width: `${Math.round(((elapsed + 1) / PAGE_SECONDS) * 100)}%`, transition: 'width 1s linear' }} />
                        </div>
                    </footer>

                    {toast && (
                        <div role="status" style={{ position: 'absolute', left: '50%', bottom: 112, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 28, padding: '18px 20px 18px 32px', borderRadius: 16, background: toast.error ? '#fde8e8' : '#f4f7f5', color: toast.error ? '#991b1b' : '#13201b', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)' }}>
                            <span style={{ fontSize: 28, fontWeight: 700 }}>
                                {toast.error ? toast.error : `第 ${toast.no} 組已出發，已從看板移除`}
                            </span>
                            {!toast.error && (
                                <button type="button" onClick={undoDeparted}
                                    style={{ minHeight: 52, padding: '0 26px', borderRadius: 10, border: 'none', background: '#13201b', color: '#fff', fontFamily: 'inherit', fontSize: 24, fontWeight: 700, cursor: 'pointer' }}>
                                    復原
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
