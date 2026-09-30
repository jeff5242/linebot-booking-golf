import React, { useState, useEffect, Fragment } from 'react';
import { Tab, Switch, Dialog, Transition } from '@headlessui/react';
import {
    Settings,
    Clock,
    DollarSign,
    Users,
    Calendar,
    Plus,
    Trash2,
    AlertCircle,
    Info,
    Save,
    Power,
    Bell,
    TrendingUp,
    KeyRound,
    Ticket
} from 'lucide-react';
import { VoucherIssueSettings } from './VoucherIssueSettings';
import { OaFunctionMatrix } from './OaFunctionMatrix';
import { adminFetch } from '../utils/adminApi';
import { setTzOffsetMinutes } from '../utils/timezone';

// ============= 輔助元件 =============

// 時間選取器（強制 30 分鐘步進）
function TimePicker({ value, onChange, label, disabled }) {
    const generateTimeOptions = () => {
        const options = [];
        for (let h = 0; h < 24; h++) {
            for (let m of [0, 30]) {
                const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                options.push(time);
            }
        }
        return options;
    };

    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="form-select w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
                <option value="">請選擇時間</option>
                {generateTimeOptions().map(time => (
                    <option key={time} value={time}>{time}</option>
                ))}
            </select>
        </div>
    );
}

// 數字步進器
function NumberStepper({ value, onChange, min = 0, max = 999, step = 1, label, unit, helpText, disabled }) {
    const handleIncrement = () => {
        if (value < max) onChange(value + step);
    };

    const handleDecrement = () => {
        if (value > min) onChange(value - step);
    };

    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
            <div className="flex items-center gap-2">
                <button
                    onClick={handleDecrement}
                    disabled={disabled || value <= min}
                    className="w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-700"
                >
                    -
                </button>
                <div className="flex-1 relative">
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
                        min={min}
                        max={max}
                        step={step}
                        disabled={disabled}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg text-center font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                    {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{unit}</span>}
                </div>
                <button
                    onClick={handleIncrement}
                    disabled={disabled || value >= max}
                    className="w-10 h-10 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-700"
                >
                    +
                </button>
            </div>
            {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
        </div>
    );
}

// Tooltip 提示
function Tooltip({ children, text }) {
    const [show, setShow] = useState(false);

    return (
        <div className="relative inline-block">
            <div
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            >
                {children}
            </div>
            {show && (
                <div className="absolute z-10 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg -top-2 left-full ml-2 w-64">
                    {text}
                    <div className="absolute top-3 -left-1 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                </div>
            )}
        </div>
    );
}

// Switch 開關元件（使用 Headless UI）
function ToggleSwitch({ enabled, onChange, label, description, disabled }) {
    return (
        <Switch.Group>
            <div className="flex items-start">
                <Switch
                    checked={enabled}
                    onChange={onChange}
                    disabled={disabled}
                    className={`${enabled ? 'bg-blue-600' : 'bg-gray-200'
                        } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    <span
                        className={`${enabled ? 'translate-x-6' : 'translate-x-1'
                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                    />
                </Switch>
                {(label || description) && (
                    <Switch.Label className="ml-3 cursor-pointer">
                        {label && <span className="text-sm font-medium text-gray-900 block">{label}</span>}
                        {description && <span className="text-xs text-gray-500 block mt-0.5">{description}</span>}
                    </Switch.Label>
                )}
            </div>
        </Switch.Group>
    );
}

// 卡片容器
function Card({ title, icon: Icon, children, actions, variant = 'default' }) {
    const variants = {
        default: 'bg-white border-gray-200',
        primary: 'bg-blue-50 border-blue-200',
        warning: 'bg-orange-50 border-orange-200',
        success: 'bg-green-50 border-green-200',
    };

    return (
        <div className={`rounded-lg border ${variants[variant]} p-6 shadow-sm`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="w-5 h-5 text-gray-600" />}
                    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                </div>
                {actions && <div className="flex gap-2">{actions}</div>}
            </div>
            {children}
        </div>
    );
}

// ============= 會員轉贈功能開關 =============

function TransferToggleCard() {
    const [mode, setMode] = useState('test');
    const [phonesText, setPhonesText] = useState('');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await adminFetch('/api/voucher-ops/transfer-config');
                if (res.ok) {
                    const cfg = await res.json();
                    setMode(cfg.mode || 'test');
                    setPhonesText((cfg.testPhones || []).join('\n'));
                }
            } catch (e) {
                console.error('讀取轉贈設定失敗:', e);
            }
        })();
    }, []);

    const save = async () => {
        setLoading(true);
        setMsg('');
        try {
            const testPhones = phonesText.split(/[\s,，、]+/).map(s => s.trim()).filter(Boolean);
            const res = await adminFetch('/api/voucher-ops/transfer-config', {
                method: 'POST',
                body: JSON.stringify({ mode, testPhones }),
            });
            const data = await res.json();
            if (res.ok) {
                setMode(data.config.mode);
                setPhonesText((data.config.testPhones || []).join('\n'));
                setMsg('已儲存');
            } else {
                setMsg('儲存失敗：' + (data.error || res.status));
            }
        } catch (e) {
            setMsg('儲存失敗：' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const modeOptions = [
        { value: 'off', label: '關閉（所有會員都不能轉贈）' },
        { value: 'test', label: '僅測試人員（只有下方名單的手機可轉贈）' },
        { value: 'on', label: '開放全部會員（所有會員都可轉贈）' },
    ];

    return (
        <Card title="會員轉贈功能" icon={Users}>
            <p className="text-xs text-gray-500 mb-4">
                控制 LINE 會員專區「🎁 轉贈好友」功能的開放範圍。關閉或非名單會員將看不到轉贈按鈕，後端也會擋下。
            </p>
            <div className="space-y-3">
                {modeOptions.map(opt => (
                    <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="transfer-mode"
                            className="mt-1"
                            checked={mode === opt.value}
                            onChange={() => setMode(opt.value)}
                        />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                ))}
            </div>

            {mode === 'test' && (
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">測試人員手機（每行一組，格式 09xxxxxxxx）</label>
                    <textarea
                        value={phonesText}
                        onChange={e => setPhonesText(e.target.value)}
                        rows={4}
                        placeholder="0936923912"
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">會自動過濾非 09 開頭 10 碼的號碼並去重。</p>
                </div>
            )}

            <div className="mt-4 flex items-center gap-3">
                <button
                    onClick={save}
                    disabled={loading}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                    <Save className="w-4 h-4" />
                    {loading ? '儲存中...' : '儲存轉贈設定'}
                </button>
                {msg && (
                    <span className={`text-sm font-medium ${msg.includes('失敗') ? 'text-red-600' : 'text-green-600'}`}>{msg}</span>
                )}
            </div>
        </Card>
    );
}

// ============= 電子票券設定：底下再分子頁 =============

// 常見時區選項（offsetMinutes：距 UTC 的分鐘數）
const TZ_PRESETS = [
    { offsetMinutes: 480, label: '台灣（UTC+8）' },
    { offsetMinutes: 540, label: '日本／韓國（UTC+9）' },
    { offsetMinutes: 420, label: '泰國／越南（UTC+7）' },
    { offsetMinutes: 0, label: '世界標準時間（UTC+0）' },
    { offsetMinutes: -300, label: '美東（UTC-5）' },
    { offsetMinutes: -480, label: '美西（UTC-8）' },
];

function TimezoneCard() {
    const [current, setCurrent] = useState(null); // 後端目前設定 { offsetMinutes, label }
    const [selected, setSelected] = useState(480);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await adminFetch('/api/config/timezone');
                if (res.ok) {
                    const d = await res.json();
                    setCurrent(d);
                    setSelected(d.offsetMinutes);
                }
            } catch { /* 讀取失敗維持預設 */ } finally { setLoading(false); }
        })();
    }, []);

    const save = async () => {
        setSaving(true); setMsg('');
        try {
            const preset = TZ_PRESETS.find(p => p.offsetMinutes === selected) || { offsetMinutes: selected, label: `UTC${selected >= 0 ? '+' : ''}${selected / 60}` };
            const res = await adminFetch('/api/settings/timezone', { method: 'POST', body: JSON.stringify(preset) });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || '儲存失敗');
            setCurrent({ offsetMinutes: d.offsetMinutes, label: d.label });
            setTzOffsetMinutes(d.offsetMinutes); // 立即套用於本次工作階段
            setMsg('已儲存，全站報表與時間顯示已切換');
        } catch (e) { setMsg('儲存失敗：' + e.message); } finally { setSaving(false); }
    };

    if (loading) return null;
    const changed = current && selected !== current.offsetMinutes;

    return (
        <Card title="時區設定" icon={Clock}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '560px' }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px 14px', fontSize: '14px' }}>
                    <span style={{ color: '#0369a1', fontWeight: 600 }}>目前時區：</span>
                    <span style={{ fontWeight: 700 }}>{current?.label || '台灣（UTC+8）'}</span>
                </div>

                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>切換時區</label>
                    <select
                        value={selected}
                        onChange={e => setSelected(Number(e.target.value))}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
                    >
                        {TZ_PRESETS.map(p => <option key={p.offsetMinutes} value={p.offsetMinutes}>{p.label}</option>)}
                    </select>
                </div>

                <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#4b5563', lineHeight: 1.7 }}>
                    <div style={{ fontWeight: 700, color: '#374151', marginBottom: '4px' }}>這個設定影響什麼？</div>
                    系統時間都以 UTC 儲存，顯示時依此時區換算。切換後會影響：
                    <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                        <li>核銷明細／銷售明細／各報表的<b>時間顯示</b></li>
                        <li>報表的<b>日期分界</b>（哪一筆算哪一天）</li>
                        <li>員工核銷站「我的紀錄／今日統計」的時間</li>
                    </ul>
                    <div style={{ marginTop: '6px', color: '#6b7280' }}>預設為台灣（UTC+8）。台灣營運維持此設定即可，跨區營運再切換。</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={save}
                        disabled={saving || !changed}
                        style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: (saving || !changed) ? '#d1d5db' : '#2563eb', color: '#fff', fontWeight: 600, cursor: (saving || !changed) ? 'default' : 'pointer' }}
                    >
                        {saving ? '儲存中...' : changed ? '儲存並套用' : '目前已是此設定'}
                    </button>
                    {msg && <span style={{ fontSize: '14px', fontWeight: 500, color: msg.includes('失敗') ? '#dc2626' : '#16a34a' }}>{msg}</span>}
                </div>
            </div>
        </Card>
    );
}

// 散客自動併組設定（放營運管理分頁）
const GM_WEEKDAYS = [{ v: 0, l: '日' }, { v: 1, l: '一' }, { v: 2, l: '二' }, { v: 3, l: '三' }, { v: 4, l: '四' }, { v: 5, l: '五' }, { v: 6, l: '六' }];
// 票券到期提醒設定（放營運管理分頁）
function ExpiryReminderCard() {
    const [cfg, setCfg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await adminFetch('/api/expiry-reminder-settings');
                const d = await res.json();
                setCfg({
                    enabled: !!d.enabled, daysBefore: d.daysBefore || 100, windowDays: d.windowDays || 7,
                    runHour: d.runHour ?? 10, voucherTypes: d.voucherTypes || ['果嶺券', '商品券'], template: d.template || '',
                });
            } catch { setCfg({ enabled: false, daysBefore: 100, windowDays: 7, runHour: 10, voucherTypes: ['果嶺券', '商品券'], template: '' }); }
            finally { setLoading(false); }
        })();
    }, []);

    const patch = (p) => setCfg(c => ({ ...c, ...p }));
    const toggleType = (v) => setCfg(c => ({ ...c, voucherTypes: c.voucherTypes.includes(v) ? c.voucherTypes.filter(x => x !== v) : [...c.voucherTypes, v] }));

    const save = async () => {
        setSaving(true); setMsg('');
        try {
            const res = await adminFetch('/api/expiry-reminder-settings', { method: 'POST', body: JSON.stringify({ config: cfg }) });
            const d = await res.json(); if (!res.ok) throw new Error(d.error || '儲存失敗');
            setMsg('✅ 已儲存'); setTimeout(() => setMsg(''), 2500);
        } catch (e) { setMsg('❌ ' + e.message); } finally { setSaving(false); }
    };

    const doRun = async (dryRun) => {
        if (!dryRun && !confirm('確定「立即發送」提醒推播？符合條件的會員會立刻收到 LINE 訊息。')) return;
        setRunning(true); setRunResult(null);
        try {
            const res = await adminFetch('/api/admin/expiry-reminders/run', { method: 'POST', body: JSON.stringify({ dryRun }) });
            const d = await res.json(); if (!res.ok) throw new Error(d.error || '執行失敗');
            setRunResult(d);
        } catch (e) { setRunResult({ error: e.message }); } finally { setRunning(false); }
    };

    if (loading || !cfg) return <Card title="票券到期提醒" icon={Bell}><div style={{ color: '#9ca3af' }}>載入中…</div></Card>;

    const box = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '10px' };
    const sw = (on) => ({ width: 42, height: 24, borderRadius: 14, background: on ? '#1f6f52' : '#cbd5cf', position: 'relative', cursor: 'pointer', flexShrink: 0 });
    const knob = (on) => ({ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff' });
    const inp = { border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', width: 80 };

    return (
        <Card title="票券到期提醒" icon={Bell}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                會員電子券在「剩 N 天到期」時，自動用 LINE 個人化推播提醒（每人每批只發一次）。關閉時完全不發送。
            </div>

            <div style={box}>
                <div><b>功能總開關</b><div style={{ fontSize: 12, color: '#9ca3af' }}>關閉時排程不動作、不發送</div></div>
                <div style={sw(cfg.enabled)} onClick={() => patch({ enabled: !cfg.enabled })}><div style={knob(cfg.enabled)} /></div>
            </div>

            <div style={{ opacity: cfg.enabled ? 1 : 0.5, pointerEvents: cfg.enabled ? 'auto' : 'none' }}>
                <div style={box}><div><b>到期前幾天提醒</b></div><div><input type="number" min="1" max="365" value={cfg.daysBefore} onChange={e => patch({ daysBefore: Number(e.target.value) })} style={inp} /> 天</div></div>
                <div style={box}><div><b>每日執行時間</b><div style={{ fontSize: 12, color: '#9ca3af' }}>台灣時間，0-23</div></div><div><input type="number" min="0" max="23" value={cfg.runHour} onChange={e => patch({ runHour: Number(e.target.value) })} style={inp} /> 時</div></div>
                <div style={box}>
                    <div><b>適用券種</b></div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {['果嶺券', '商品券'].map(ty => (
                            <button key={ty} onClick={() => toggleType(ty)} style={{ border: '1px solid', borderColor: cfg.voucherTypes.includes(ty) ? '#1f6f52' : '#d1d5db', background: cfg.voucherTypes.includes(ty) ? '#1f6f52' : '#fff', color: cfg.voucherTypes.includes(ty) ? '#fff' : '#374151', borderRadius: 8, padding: '6px 12px', fontWeight: 600, cursor: 'pointer' }}>{ty}</button>
                        ))}
                    </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>訊息內容</div>
                    <textarea value={cfg.template} onChange={e => patch({ template: e.target.value })} rows={5}
                        placeholder="可用變數：{name} 姓名、{date} 到期日、{days} 剩餘天數、{count} 可用張數"
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit' }} />
                    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4 }}>變數：{'{name} {date} {days} {count}'}；留空用系統預設。</div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                <button onClick={save} disabled={saving} style={{ background: '#1f6f52', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? '儲存中…' : '儲存設定'}</button>
                <button onClick={() => doRun(true)} disabled={running} style={{ background: '#eef5f1', color: '#1f6f52', border: '1px solid #cfe4d9', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>試算（不發送）</button>
                <button onClick={() => doRun(false)} disabled={running || !cfg.enabled} style={{ background: '#fff', color: '#b45309', border: '1px solid #fcd9a8', borderRadius: 8, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>立即發送</button>
                {msg && <span style={{ fontSize: 13, color: msg.startsWith('✅') ? '#1f6f52' : '#dc2626' }}>{msg}</span>}
            </div>

            {running && <div style={{ marginTop: 10, color: '#9ca3af', fontSize: 13 }}>執行中…</div>}
            {runResult && !running && (
                <div style={{ marginTop: 10, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 13, color: '#374151' }}>
                    {runResult.error ? <span style={{ color: '#dc2626' }}>❌ {runResult.error}</span>
                        : runResult.skipped ? <span>目前狀態：{runResult.skipped === 'disabled' ? '功能未啟用' : runResult.skipped}</span>
                            : runResult.dryRun ? <><b>試算結果：</b>符合條件 <b style={{ color: '#1f6f52' }}>{runResult.dueCount}</b> 位會員（不會實際發送）。{runResult.sample?.length ? <div style={{ marginTop: 6, color: '#6b7280' }}>例：{runResult.sample.map(s => `${s.name}(剩${s.daysLeft}天/${s.count}張)`).join('、')}</div> : null}</>
                                : <><b>已發送：</b>{runResult.sent} 則（失敗 {runResult.failed}，符合 {runResult.dueCount}）。</>}
                </div>
            )}
        </Card>
    );
}

function GroupMatchingCard() {
    const [cfg, setCfg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [newDate, setNewDate] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await adminFetch('/api/group-matching-settings');
                const data = await res.json();
                setCfg({
                    enabled: !!data.enabled,
                    enabledWeekdays: Array.isArray(data.enabledWeekdays) ? data.enabledWeekdays : [],
                    enabledDates: Array.isArray(data.enabledDates) ? data.enabledDates : [],
                    force: !!data.force,
                    maxPerGroup: data.maxPerGroup || 4,
                });
            } catch { setCfg({ enabled: false, enabledWeekdays: [], enabledDates: [], force: false, maxPerGroup: 4 }); }
            finally { setLoading(false); }
        })();
    }, []);

    const patch = (p) => setCfg(c => ({ ...c, ...p }));
    const toggleWeekday = (v) => setCfg(c => ({ ...c, enabledWeekdays: c.enabledWeekdays.includes(v) ? c.enabledWeekdays.filter(x => x !== v) : [...c.enabledWeekdays, v].sort() }));
    const addDate = () => { if (/^\d{4}-\d{2}-\d{2}$/.test(newDate) && !cfg.enabledDates.includes(newDate)) { patch({ enabledDates: [...cfg.enabledDates, newDate].sort() }); setNewDate(''); } };
    const removeDate = (d) => patch({ enabledDates: cfg.enabledDates.filter(x => x !== d) });

    const save = async () => {
        setSaving(true); setMsg('');
        try {
            const res = await adminFetch('/api/group-matching-settings', { method: 'POST', body: JSON.stringify({ config: cfg }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '儲存失敗');
            setMsg('✅ 已儲存');
            setTimeout(() => setMsg(''), 2500);
        } catch (e) { setMsg('❌ ' + e.message); }
        finally { setSaving(false); }
    };

    if (loading || !cfg) return <Card title="散客自動併組" icon={Users}><div style={{ color: '#9ca3af' }}>載入中…</div></Card>;

    const box = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '10px' };
    const sw = (on) => ({ width: 42, height: 24, borderRadius: 14, background: on ? '#1f6f52' : '#cbd5cf', position: 'relative', cursor: 'pointer', transition: 'background .15s', flexShrink: 0 });
    const knob = (on) => ({ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' });

    return (
        <Card title="散客自動併組" icon={Users}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                1~2 人散客線上預約時，於「啟用日」自動找當天未滿 4 人的組別提示併組。未啟用時預約流程完全不變。
            </div>

            <div style={box}>
                <div><b>功能總開關</b><div style={{ fontSize: 12, color: '#9ca3af' }}>關閉時完全不影響現有預約</div></div>
                <div style={sw(cfg.enabled)} onClick={() => patch({ enabled: !cfg.enabled })}><div style={knob(cfg.enabled)} /></div>
            </div>

            <div style={{ opacity: cfg.enabled ? 1 : 0.45, pointerEvents: cfg.enabled ? 'auto' : 'none' }}>
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>啟用星期</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {GM_WEEKDAYS.map(w => (
                            <button key={w.v} onClick={() => toggleWeekday(w.v)}
                                style={{ width: 40, height: 38, borderRadius: 8, border: '1px solid', borderColor: cfg.enabledWeekdays.includes(w.v) ? '#1f6f52' : '#d1d5db', background: cfg.enabledWeekdays.includes(w.v) ? '#1f6f52' : '#fff', color: cfg.enabledWeekdays.includes(w.v) ? '#fff' : '#374151', fontWeight: 600, cursor: 'pointer' }}>
                                {w.l}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>指定日期（如國定假日、活動日）</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13 }} />
                        <button onClick={addDate} style={{ background: '#eef5f1', color: '#1f6f52', border: '1px solid #cfe4d9', borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer' }}>加入</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {cfg.enabledDates.length === 0 && <span style={{ fontSize: 12, color: '#9ca3af' }}>尚無指定日期</span>}
                        {cfg.enabledDates.map(d => (
                            <span key={d} style={{ background: '#f3f4f6', borderRadius: 16, padding: '3px 6px 3px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {d}<button onClick={() => removeDate(d)} style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}>×</button>
                            </span>
                        ))}
                    </div>
                </div>

                <div style={box}>
                    <div><b>啟用日強制併組</b><div style={{ fontSize: 12, color: '#9ca3af' }}>開：散客不同意併組則無法完成預約；關：可自己開組</div></div>
                    <div style={sw(cfg.force)} onClick={() => patch({ force: !cfg.force })}><div style={knob(cfg.force)} /></div>
                </div>

                <div style={box}>
                    <div><b>一組人數上限</b></div>
                    <select value={cfg.maxPerGroup} onChange={e => patch({ maxPerGroup: Number(e.target.value) })} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px' }}>
                        {[2, 3, 4].map(n => <option key={n} value={n}>{n} 人</option>)}
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button onClick={save} disabled={saving} style={{ background: '#1f6f52', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                    {saving ? '儲存中…' : '儲存設定'}
                </button>
                {msg && <span style={{ fontSize: 13, color: msg.startsWith('✅') ? '#1f6f52' : '#dc2626' }}>{msg}</span>}
            </div>
        </Card>
    );
}

function VoucherSettingsSubTabs() {
    const [sub, setSub] = useState('issue');
    const subs = [
        { k: 'issue', t: '發券設定' },
        { k: 'functions', t: 'LINE OA 功能權限' },
        { k: 'transfer', t: '會員轉贈' },
        { k: 'timezone', t: '時區設定' },
    ];
    return (
        <div>
            <div className="flex gap-1 mb-6 border-b border-gray-200 flex-wrap">
                {subs.map(s => (
                    <button
                        key={s.k}
                        onClick={() => setSub(s.k)}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${sub === s.k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        {s.t}
                    </button>
                ))}
            </div>
            {sub === 'issue' && <VoucherIssueSettings />}
            {sub === 'functions' && <OaFunctionMatrix />}
            {sub === 'transfer' && <TransferToggleCard />}
            {sub === 'timezone' && <TimezoneCard />}
        </div>
    );
}

// ============= 主元件 =============

export function AdminSettings() {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [selectedTab, setSelectedTab] = useState(0);
    const [previewMode, setPreviewMode] = useState('today'); // today, calendar
    const [peakPeriods, setPeakPeriods] = useState([]);

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        if (settings) {
            // 將 peak_a 和 peak_b 轉換為 peakPeriods 陣列
            const periods = [];
            if (settings.peak_a) {
                periods.push({ id: 'peak_a', name: 'Peak A (早場)', ...settings.peak_a, color: 'blue' });
            }
            if (settings.peak_b) {
                periods.push({ id: 'peak_b', name: 'Peak B (午場)', ...settings.peak_b, color: 'orange' });
            }
            setPeakPeriods(periods);
        }
    }, [settings]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await adminFetch('/api/settings');
            const data = await res.json();
            if (res.ok) {
                // 設定預設值
                const defaultSettings = {
                    interval: 10,
                    turn_time: 120,
                    booking_advance_days: 180,
                    overflow_enabled: false,
                    hop_mode: 'auto',
                    hop_timeout_minutes: 120,
                    weekday_mode: 'default',
                    member_guest_ratio: '3:1',
                    fees: {
                        electronic_fee: 0,
                        off_peak_discount: false,
                        caddie_fund_tiers: [
                            { min: 0, max: 11, rate: 0 },
                            { min: 12, max: 16, rate: 200 },
                            { min: 17, max: 99, rate: 300 }
                        ]
                    },
                    notifications: {
                        cancellation_template: '您的預約已取消',
                        waitlist_template: '候補通知：您的時段已開放'
                    },
                    ...data
                };
                setSettings(defaultSettings);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            console.error(err);
            setMsg('載入失敗: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        setMsg('');
        try {
            // 將 peakPeriods 轉換回 peak_a 和 peak_b
            const saveData = { ...settings };
            peakPeriods.forEach((period, index) => {
                if (period.id === 'peak_a') {
                    saveData.peak_a = {
                        start: period.start,
                        end: period.end,
                        max_groups: period.max_groups,
                        reserved: period.reserved
                    };
                } else if (period.id === 'peak_b') {
                    saveData.peak_b = {
                        start: period.start,
                        end: period.end,
                        max_groups: period.max_groups,
                        reserved: period.reserved
                    };
                }
            });

            const res = await adminFetch('/api/settings', {
                method: 'POST',
                body: JSON.stringify(saveData)
            });
            const data = await res.json();
            if (res.ok) {
                setSettings(data);
                setMsg('儲存成功！');
                setTimeout(() => setMsg(''), 3000);
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            console.error(err);
            setMsg('儲存失敗: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const addPeakPeriod = () => {
        const newId = `peak_${peakPeriods.length + 1}`;
        setPeakPeriods([...peakPeriods, {
            id: newId,
            name: `Peak ${String.fromCharCode(65 + peakPeriods.length)} (新時段)`,
            start: '07:00',
            end: '11:00',
            max_groups: 10,
            reserved: 2,
            color: ['blue', 'orange', 'green', 'purple'][peakPeriods.length % 4]
        }]);
    };

    const removePeakPeriod = (index) => {
        setPeakPeriods(peakPeriods.filter((_, i) => i !== index));
    };

    const updatePeakPeriod = (index, field, value) => {
        const updated = [...peakPeriods];
        updated[index] = { ...updated[index], [field]: value };
        setPeakPeriods(updated);
    };

    // 計算即時預覽
    const generateTimeSlotPreview = () => {
        if (!settings || !settings.interval) return [];

        const slots = [];
        const interval = parseInt(settings.interval);

        peakPeriods.forEach(period => {
            const [startH, startM] = (period.start || '07:00').split(':').map(Number);
            const [endH, endM] = (period.end || '11:00').split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;

            for (let m = startMinutes; m < endMinutes; m += interval) {
                const h = Math.floor(m / 60);
                const min = m % 60;
                slots.push({
                    time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
                    period: period.name,
                    color: period.color
                });
            }
        });

        return slots.sort((a, b) => a.time.localeCompare(b.time));
    };

    if (!settings) return (
        <div className="flex items-center justify-center h-64">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">載入中...</p>
            </div>
        </div>
    );

    const tabs = [
        { name: '時間規則', icon: Clock },
        { name: '收費與設備', icon: DollarSign },
        { name: '候補邏輯', icon: Users },
        { name: '營運管理', icon: Calendar },
        { name: '電子票券', icon: Ticket }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Settings className="w-8 h-8 text-blue-600" />
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">系統參數設定</h2>
                        <p className="text-sm text-gray-500 mt-1">管理預約系統的全局參數與規則</p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Save className="w-4 h-4" />
                    {loading ? '儲存中...' : '儲存設定'}
                </button>
            </div>

            {/* Message Alert */}
            {msg && (
                <div className={`p-4 rounded-lg ${msg.includes('失敗') ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
                    <div className="flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">{msg}</span>
                    </div>
                </div>
            )}

            {/* Tabs Navigation */}
            <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
                <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1">
                    {tabs.map((tab) => (
                        <Tab
                            key={tab.name}
                            className={({ selected }) =>
                                `w-full rounded-lg py-2.5 text-sm font-medium leading-5 transition-all
                                ${selected
                                    ? 'bg-white text-blue-700 shadow'
                                    : 'text-gray-600 hover:bg-white/[0.5] hover:text-gray-800'
                                }`
                            }
                        >
                            {({ selected }) => (
                                <div className="flex items-center justify-center gap-2">
                                    <tab.icon className={`w-4 h-4 ${selected ? 'text-blue-600' : 'text-gray-500'}`} />
                                    <span>{tab.name}</span>
                                </div>
                            )}
                        </Tab>
                    ))}
                </Tab.List>

                <Tab.Panels className="mt-6">
                    {/* ============= 分頁 1: 時間規則 ============= */}
                    <Tab.Panel>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* 左側：設定區 */}
                            <div className="lg:col-span-2 space-y-6">
                                {/* 營運時間範本 */}
                                <Card title="營運時間範本" icon={Clock}>
                                    <p className="text-xs text-gray-500 mb-4">
                                        此為全域預設值，營運日曆「套用範本」時會使用這組設定
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <TimePicker
                                            label="營運開始時間"
                                            value={settings.start_time || '05:30'}
                                            onChange={(val) => setSettings({ ...settings, start_time: val })}
                                        />
                                        <TimePicker
                                            label="營運結束時間"
                                            value={settings.end_time || '17:00'}
                                            onChange={(val) => setSettings({ ...settings, end_time: val })}
                                        />
                                    </div>
                                </Card>

                                {/* 預約間隔 */}
                                <Card title="預約間隔設定" icon={Clock}>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                                間隔時間 (Booking Interval)
                                            </label>
                                            <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
                                                {[3, 5, 6, 10, 15].map(min => (
                                                    <button
                                                        key={min}
                                                        onClick={() => setSettings({ ...settings, interval: min })}
                                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${parseInt(settings.interval) === min
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'text-gray-600 hover:text-gray-900'
                                                            }`}
                                                    >
                                                        {min} 分鐘
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-2">
                                                目前間隔：每小時可排 {Math.floor(60 / parseInt(settings.interval))} 組
                                            </p>
                                        </div>

                                        <div className="pt-4 border-t border-gray-200">
                                            <NumberStepper
                                                label="回場時間 (Turn Time)"
                                                value={settings.turn_time || 120}
                                                onChange={(val) => setSettings({ ...settings, turn_time: val })}
                                                min={60}
                                                max={300}
                                                step={10}
                                                unit="分鐘"
                                                helpText="18洞預約時，T與T+回場時間都需要空位"
                                            />
                                        </div>
                                    </div>
                                </Card>

                                {/* 尖峰時段管理 */}
                                <Card
                                    title="尖峰時段管理"
                                    icon={TrendingUp}
                                    actions={
                                        <button
                                            onClick={addPeakPeriod}
                                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                        >
                                            <Plus className="w-4 h-4" />
                                            新增時段
                                        </button>
                                    }
                                >
                                    <div className="space-y-4">
                                        {peakPeriods.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500">
                                                <TrendingUp className="w-12 h-12 mx-auto mb-2 opacity-30" />
                                                <p>尚未設定尖峰時段</p>
                                                <button
                                                    onClick={addPeakPeriod}
                                                    className="mt-3 text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    點擊新增
                                                </button>
                                            </div>
                                        ) : (
                                            peakPeriods.map((period, index) => (
                                                <div
                                                    key={period.id}
                                                    className={`p-4 rounded-lg border-2 ${period.color === 'blue' ? 'border-blue-200 bg-blue-50' :
                                                        period.color === 'orange' ? 'border-orange-200 bg-orange-50' :
                                                            period.color === 'green' ? 'border-green-200 bg-green-50' :
                                                                'border-purple-200 bg-purple-50'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-4">
                                                        <input
                                                            type="text"
                                                            value={period.name}
                                                            onChange={(e) => updatePeakPeriod(index, 'name', e.target.value)}
                                                            className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                                                        />
                                                        {peakPeriods.length > 1 && (
                                                            <button
                                                                onClick={() => removePeakPeriod(index)}
                                                                className="text-red-600 hover:text-red-700"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <TimePicker
                                                            label="開始時間"
                                                            value={period.start}
                                                            onChange={(val) => updatePeakPeriod(index, 'start', val)}
                                                        />
                                                        <TimePicker
                                                            label="結束時間"
                                                            value={period.end}
                                                            onChange={(val) => updatePeakPeriod(index, 'end', val)}
                                                        />
                                                        <NumberStepper
                                                            label="主組數"
                                                            value={period.max_groups || 0}
                                                            onChange={(val) => updatePeakPeriod(index, 'max_groups', val)}
                                                            min={0}
                                                            max={50}
                                                            unit="組"
                                                        />
                                                        <NumberStepper
                                                            label="預備組數"
                                                            value={period.reserved || 0}
                                                            onChange={(val) => updatePeakPeriod(index, 'reserved', val)}
                                                            min={0}
                                                            max={20}
                                                            unit="組"
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </Card>

                                {/* 溢流機制 */}
                                <Card title="溢流機制設定" icon={AlertCircle} variant="warning">
                                    <div className="space-y-4">
                                        <ToggleSwitch
                                            enabled={settings.overflow_enabled || false}
                                            onChange={(val) => setSettings({ ...settings, overflow_enabled: val })}
                                            label="啟用溢流機制"
                                            description="當 Peak A 額滿後，自動開放 07:30-11:00 時段"
                                        />

                                        {settings.overflow_enabled && (
                                            <div className="mt-4 p-3 bg-orange-100 rounded-lg border border-orange-200">
                                                <div className="flex gap-2">
                                                    <Info className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                                                    <div className="text-sm text-orange-800">
                                                        <p className="font-medium">溢流規則說明：</p>
                                                        <ul className="mt-1 space-y-1 list-disc list-inside">
                                                            <li>Peak A 主組數達 100% 時觸發</li>
                                                            <li>系統自動釋放預備組數至候補名單</li>
                                                            <li>依照候補順位自動通知</li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>

                            {/* 右側：即時預覽 */}
                            <div className="lg:col-span-1">
                                <div className="sticky top-6">
                                    <Card title="即時預覽" icon={Calendar} variant="primary">
                                        <div className="space-y-3">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setPreviewMode('today')}
                                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${previewMode === 'today'
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-white text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    今日時段
                                                </button>
                                            </div>

                                            <div className="bg-white rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
                                                {generateTimeSlotPreview().length === 0 ? (
                                                    <div className="p-4 text-center text-gray-500 text-sm">
                                                        尚未設定時段
                                                    </div>
                                                ) : (
                                                    <div className="divide-y divide-gray-100">
                                                        {generateTimeSlotPreview().map((slot, i) => (
                                                            <div key={i} className="px-3 py-2 flex items-center justify-between hover:bg-gray-50">
                                                                <span className="font-mono text-sm font-semibold text-gray-900">
                                                                    {slot.time}
                                                                </span>
                                                                <span className={`text-xs px-2 py-1 rounded-full ${slot.color === 'blue' ? 'bg-blue-100 text-blue-700' :
                                                                    slot.color === 'orange' ? 'bg-orange-100 text-orange-700' :
                                                                        slot.color === 'green' ? 'bg-green-100 text-green-700' :
                                                                            'bg-purple-100 text-purple-700'
                                                                    }`}>
                                                                    {slot.period.split(' ')[0]}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                                                共 {generateTimeSlotPreview().length} 個時段
                                            </div>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    </Tab.Panel>

                    {/* ============= 分頁 2: 收費與設備 ============= */}
                    <Tab.Panel>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* 電子設施費 */}
                            <Card title="電子設施費" icon={DollarSign}>
                                <NumberStepper
                                    label="費用"
                                    value={settings.fees?.electronic_fee || 0}
                                    onChange={(val) => setSettings({
                                        ...settings,
                                        fees: { ...settings.fees, electronic_fee: val }
                                    })}
                                    min={0}
                                    max={1000}
                                    step={50}
                                    unit="元"
                                    helpText="每組預約需支付的電子設施費用"
                                />
                            </Card>

                            {/* 桿弟基金階梯費率 */}
                            <Card title="桿弟基金（階梯式費率）" icon={Users} variant="success">
                                <div className="space-y-3">
                                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-2 text-left font-medium text-gray-700">時段範圍</th>
                                                    <th className="px-4 py-2 text-right font-medium text-gray-700">費率</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {settings.fees?.caddie_fund_tiers?.map((tier, index) => (
                                                    <tr key={index}>
                                                        <td className="px-4 py-2 text-gray-600">
                                                            {tier.min}:00 - {tier.max}:00
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <input
                                                                type="number"
                                                                value={tier.rate}
                                                                onChange={(e) => {
                                                                    const newTiers = [...settings.fees.caddie_fund_tiers];
                                                                    newTiers[index].rate = parseInt(e.target.value) || 0;
                                                                    setSettings({
                                                                        ...settings,
                                                                        fees: { ...settings.fees, caddie_fund_tiers: newTiers }
                                                                    });
                                                                }}
                                                                className="w-24 px-2 py-1 border border-gray-300 rounded text-right"
                                                            />
                                                            <span className="ml-1 text-gray-500">元</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <ToggleSwitch
                                        enabled={settings.fees?.off_peak_discount || false}
                                        onChange={(val) => setSettings({
                                            ...settings,
                                            fees: { ...settings.fees, off_peak_discount: val }
                                        })}
                                        label="啟用離峰優惠邏輯"
                                        description="非尖峰時段自動套用優惠費率"
                                    />
                                </div>
                            </Card>
                        </div>
                    </Tab.Panel>

                    {/* ============= 分頁 3: 候補邏輯 ============= */}
                    <Tab.Panel>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="候補規則設定" icon={Users} variant="primary">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-3">
                                            遞補模式
                                        </label>
                                        <div className="space-y-2">
                                            <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                                                <input
                                                    type="radio"
                                                    name="hop_mode"
                                                    value="auto"
                                                    checked={settings.hop_mode === 'auto'}
                                                    onChange={(e) => setSettings({ ...settings, hop_mode: e.target.value })}
                                                    className="mr-3"
                                                />
                                                <div>
                                                    <div className="font-medium text-gray-900">自動順位</div>
                                                    <div className="text-xs text-gray-500">系統依候補順序自動通知</div>
                                                </div>
                                            </label>
                                            <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                                                <input
                                                    type="radio"
                                                    name="hop_mode"
                                                    value="manual"
                                                    checked={settings.hop_mode === 'manual'}
                                                    onChange={(e) => setSettings({ ...settings, hop_mode: e.target.value })}
                                                    className="mr-3"
                                                />
                                                <div>
                                                    <div className="font-medium text-gray-900">人工篩選</div>
                                                    <div className="text-xs text-gray-500">管理員手動選擇候補對象</div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-gray-200">
                                        <NumberStepper
                                            label="回覆時效限制"
                                            value={settings.hop_timeout_minutes || 120}
                                            onChange={(val) => setSettings({ ...settings, hop_timeout_minutes: val })}
                                            min={30}
                                            max={480}
                                            step={30}
                                            unit="分鐘"
                                            helpText="候補通知後的保留時間，逾時自動通知下一位"
                                        />
                                    </div>
                                </div>
                            </Card>

                            <Card title="通知範本" icon={Bell}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            候補通知範本
                                        </label>
                                        <textarea
                                            value={settings.notifications?.waitlist_template || ''}
                                            onChange={(e) => setSettings({
                                                ...settings,
                                                notifications: {
                                                    ...settings.notifications,
                                                    waitlist_template: e.target.value
                                                }
                                            })}
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="候補通知：您的時段已開放"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            取消通知範本
                                        </label>
                                        <textarea
                                            value={settings.notifications?.cancellation_template || ''}
                                            onChange={(e) => setSettings({
                                                ...settings,
                                                notifications: {
                                                    ...settings.notifications,
                                                    cancellation_template: e.target.value
                                                }
                                            })}
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="您的預約已取消"
                                        />
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </Tab.Panel>

                    {/* ============= 分頁 4: 營運管理 ============= */}
                    <Tab.Panel>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="營運時程設定" icon={Calendar}>
                                <div className="space-y-4">
                                    <NumberStepper
                                        label="預約開放期限"
                                        value={settings.booking_advance_days || 180}
                                        onChange={(val) => setSettings({ ...settings, booking_advance_days: val })}
                                        min={30}
                                        max={365}
                                        step={30}
                                        unit="天"
                                        helpText="系統自動產生未來N天的可預約日曆"
                                    />

                                    <div className="pt-4 border-t border-gray-200">
                                        <label className="block text-sm font-medium text-gray-700 mb-3">
                                            平日/假日模式
                                        </label>
                                        <div className="space-y-2">
                                            <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                                                <input
                                                    type="radio"
                                                    name="weekday_mode"
                                                    value="default"
                                                    checked={settings.weekday_mode === 'default'}
                                                    onChange={(e) => setSettings({ ...settings, weekday_mode: e.target.value })}
                                                    className="mr-3"
                                                />
                                                <div>
                                                    <div className="font-medium text-gray-900">統一規則</div>
                                                    <div className="text-xs text-gray-500">平假日使用相同參數</div>
                                                </div>
                                            </label>
                                            <label className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                                                <input
                                                    type="radio"
                                                    name="weekday_mode"
                                                    value="separated"
                                                    checked={settings.weekday_mode === 'separated'}
                                                    onChange={(e) => setSettings({ ...settings, weekday_mode: e.target.value })}
                                                    className="mr-3"
                                                />
                                                <div>
                                                    <div className="font-medium text-gray-900">分別設定</div>
                                                    <div className="text-xs text-gray-500">平日與假日套用不同參數</div>
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <GroupMatchingCard />

                            <ExpiryReminderCard />

                            <Card title="身分限制設定" icon={Users}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-3">
                                            會員與來賓比例
                                        </label>
                                        <select
                                            value={settings.member_guest_ratio || '3:1'}
                                            onChange={(e) => setSettings({ ...settings, member_guest_ratio: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                            <option value="4:0">4:0 (僅限會員)</option>
                                            <option value="3:1">3:1 (3會員 + 1來賓)</option>
                                            <option value="2:2">2:2 (2會員 + 2來賓)</option>
                                            <option value="1:3">1:3 (1會員 + 3來賓)</option>
                                            <option value="0:4">0:4 (僅限來賓)</option>
                                        </select>
                                        <p className="text-xs text-gray-500 mt-2">
                                            每一組預約中會員與來賓的人數限制
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            <Card title="報到機 (Kiosk) 設定" icon={KeyRound}>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            報到機 PIN 碼
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={8}
                                            value={settings.kiosk_pin || '1688'}
                                            onChange={(e) => setSettings({ ...settings, kiosk_pin: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-lg tracking-widest"
                                            placeholder="1688"
                                        />
                                        <p className="text-xs text-gray-500 mt-2">
                                            用於 Kiosk 報到機頁面的進入驗證碼，修改後需重新驗證
                                        </p>
                                    </div>
                                    <div className="pt-3 border-t border-gray-200">
                                        <p className="text-xs text-gray-500">
                                            報到機網址：<code className="bg-gray-100 px-1.5 py-0.5 rounded text-blue-600">/kiosk/checkin</code>
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            <Card title="緊急操作" icon={AlertCircle} variant="warning">
                                <div className="space-y-4">
                                    <button
                                        className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
                                        onClick={() => {
                                            if (confirm('確定要啟動臨時關場？此操作將通知所有今日預約者。')) {
                                                alert('關場功能開發中');
                                            }
                                        }}
                                    >
                                        <Power className="w-5 h-5" />
                                        臨時關場（天候因素）
                                    </button>
                                    <p className="text-xs text-gray-500">
                                        一鍵處理緊急關場，系統將自動：
                                    </p>
                                    <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                                        <li>取消今日所有預約</li>
                                        <li>發送通知給所有預約者</li>
                                        <li>記錄關場原因與時間</li>
                                    </ul>
                                </div>
                            </Card>
                        </div>
                    </Tab.Panel>
                    {/* ============= 分頁 5: 電子票券（底下再分子頁） ============= */}
                    <Tab.Panel>
                        <VoucherSettingsSubTabs />
                    </Tab.Panel>
                </Tab.Panels>
            </Tab.Group>
        </div>
    );
}
