import React, { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../supabase';
import { buildBoard } from '../utils/playerCheckin';

// 當日報到看板：給桿弟與發球台人員看。每頁 6 組，每 10 秒換頁；11:00 前秀上午場、11:00 起秀下午場。
const STAGE_W = 1920;
const STAGE_H = 1080;
const PAGE_SECONDS = 10;
const REFRESH_MS = 15000;
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

function GroupCard({ g }) {
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
    const { page, elapsed } = rotation;
    const wrapRef = useRef(null);
    const scale = useStageScale(wrapRef);

    const today = format(now, 'yyyy-MM-dd');

    const load = useCallback(async () => {
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
            setRotation(r => (r.elapsed + 1 >= PAGE_SECONDS
                ? { page: r.page + 1, elapsed: 0 }
                : { page: r.page, elapsed: r.elapsed + 1 }));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    const board = buildBoard(bookings, { settings: systemSettings, nowMinutes: now.getHours() * 60 + now.getMinutes() });
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
                <div style={{ color: '#4b5563', fontSize: '0.9rem' }}>每 {PAGE_SECONDS} 秒換頁，每 {REFRESH_MS / 1000} 秒更新報到資料。11:00 前顯示上午場，11:00 起顯示下午場。</div>
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
                        {groups.map(g => <GroupCard key={g.id} g={g} />)}
                        {groups.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', gridRow: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: C.muted }}>
                                {sessionLabel}場目前沒有預約
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
                </div>
            </div>
        </div>
    );
}
