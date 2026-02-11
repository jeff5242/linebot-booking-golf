import React, { useState, useEffect } from 'react';
import ChargeCardTemplate from './ChargeCardTemplate';

const apiUrl = import.meta.env.VITE_API_URL || '';

/**
 * 收費卡產生彈窗 - 兩階段介面
 * Stage 1: 設定（桿弟、配比、球道、費用預覽）
 * Stage 2: 預覽 + 列印 + LINE 通知
 */
export default function ChargeCardModal({ booking, onClose, onGenerated }) {
    const [stage, setStage] = useState('config'); // 'config' | 'preview'
    const [caddies, setCaddies] = useState([]);
    const [selectedCaddyId, setSelectedCaddyId] = useState('');
    const [caddyRatio, setCaddyRatio] = useState('1:4');
    const [course, setCourse] = useState('A -> B');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // 費用預覽
    const [feePreview, setFeePreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    // 產卡結果
    const [chargeCardResult, setChargeCardResult] = useState(null);
    const [notifyResult, setNotifyResult] = useState(null);
    const [notifyLoading, setNotifyLoading] = useState(false);

    // 載入桿弟列表
    useEffect(() => {
        fetchCaddies();
    }, []);

    // 自動計算費用預覽
    useEffect(() => {
        if (caddyRatio && booking) {
            calculatePreview();
        }
    }, [caddyRatio, booking]);

    const fetchCaddies = async () => {
        try {
            const res = await fetch(`${apiUrl}/api/caddies`);
            const data = await res.json();
            if (Array.isArray(data)) setCaddies(data);
        } catch (err) {
            console.error('載入桿弟失敗:', err);
        }
    };

    const calculatePreview = async () => {
        if (!booking) return;
        setPreviewLoading(true);
        try {
            // 使用後端計算費用
            const res = await fetch(`${apiUrl}/api/rates/calculate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: 'guest', // 預設用 guest，實際產卡時會依每人等級計算
                    holes: booking.holes,
                    isHoliday: isWeekend(booking.date),
                    caddyRatio: caddyRatio,
                    numPlayers: booking.players_count
                })
            });
            const data = await res.json();
            if (res.ok) setFeePreview(data);
        } catch (err) {
            console.error('計算費用失敗:', err);
        } finally {
            setPreviewLoading(false);
        }
    };

    const isWeekend = (dateStr) => {
        const d = new Date(dateStr);
        return d.getDay() === 0 || d.getDay() === 6;
    };

    const handleGenerate = async () => {
        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${apiUrl}/api/charge-cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    caddyId: selectedCaddyId || null,
                    caddyRatio,
                    course
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '產卡失敗');

            setChargeCardResult(data);
            setStage('preview');
            if (onGenerated) onGenerated(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleNotify = async () => {
        if (!chargeCardResult?.chargeCard?.id) return;
        setNotifyLoading(true);

        try {
            const res = await fetch(`${apiUrl}/api/charge-cards/${chargeCardResult.chargeCard.id}/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '通知發送失敗');
            setNotifyResult(data);
        } catch (err) {
            setNotifyResult({ error: err.message });
        } finally {
            setNotifyLoading(false);
        }
    };

    const formatMoney = (n) => n != null ? `$${n.toLocaleString()}` : '--';

    const selectedCaddy = caddies.find(c => c.id === selectedCaddyId);

    const modalOverlayStyle = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
        justifyContent: 'center', alignItems: 'flex-start',
        zIndex: 10000, overflowY: 'auto', padding: '20px'
    };

    const modalStyle = {
        background: '#fff', borderRadius: '12px', padding: '24px',
        maxWidth: stage === 'preview' ? '900px' : '600px',
        width: '100%', margin: '20px auto', maxHeight: '90vh', overflowY: 'auto'
    };

    return (
        <div style={modalOverlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>

                {/* Stage 1: 設定 */}
                {stage === 'config' && (
                    <>
                        <h2 style={{ margin: '0 0 20px', fontSize: '1.2rem' }}>
                            產生收費卡
                        </h2>

                        {/* 預約資訊 */}
                        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>
                            <strong>{booking.users?.display_name || booking.players_info?.[0]?.name || '未知'}</strong>
                            {' '}| {booking.date} {booking.time?.substring(0, 5)}
                            {' '}| {booking.holes}洞 | {booking.players_count}人
                        </div>

                        {/* 桿弟選擇 */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
                                指派桿弟
                            </label>
                            <select
                                value={selectedCaddyId}
                                onChange={e => setSelectedCaddyId(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                            >
                                <option value="">-- 選擇桿弟 --</option>
                                {caddies.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.caddy_number} - {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 桿弟配比 */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
                                桿弟配比
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {['1:1', '1:2', '1:3', '1:4'].map(ratio => (
                                    <button
                                        key={ratio}
                                        onClick={() => setCaddyRatio(ratio)}
                                        style={{
                                            flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                                            border: caddyRatio === ratio ? '2px solid #2e7d32' : '1px solid #ddd',
                                            background: caddyRatio === ratio ? '#e8f5e9' : '#fff',
                                            fontWeight: caddyRatio === ratio ? 'bold' : 'normal'
                                        }}
                                    >
                                        {ratio}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 球道 */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
                                球道
                            </label>
                            <select
                                value={course}
                                onChange={e => setCourse(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px' }}
                            >
                                <option value="A -> B">A → B</option>
                                <option value="B -> A">B → A</option>
                            </select>
                        </div>

                        {/* 費用預覽 */}
                        <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: '1rem' }}>費用預覽（預估）</h3>
                            {previewLoading ? (
                                <p style={{ color: '#999' }}>計算中...</p>
                            ) : feePreview ? (
                                <div style={{ fontSize: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>果嶺費</span>
                                        <span>{formatMoney(feePreview.breakdown?.greenFee)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>清潔費</span>
                                        <span>{formatMoney(feePreview.breakdown?.cleaningFee)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>球車費</span>
                                        <span>{formatMoney(feePreview.breakdown?.cartFee)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', background: '#fff9c4', padding: '4px 0' }}>
                                        <span>桿弟費 ({caddyRatio})</span>
                                        <span>{formatMoney(feePreview.breakdown?.caddyFee)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>娛樂稅 (5%)</span>
                                        <span>{formatMoney(feePreview.breakdown?.entertainmentTax)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', borderTop: '1px solid #ccc', paddingTop: '8px', marginTop: '8px' }}>
                                        <span>預估總額</span>
                                        <span>{formatMoney(feePreview.totalAmount)}</span>
                                    </div>
                                </div>
                            ) : (
                                <p style={{ color: '#999' }}>尚未計算</p>
                            )}
                        </div>

                        {error && (
                            <div style={{ color: 'red', marginBottom: '12px', padding: '8px', background: '#ffebee', borderRadius: '6px' }}>
                                {error}
                            </div>
                        )}

                        {/* 按鈕 */}
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={onClose}
                                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}
                            >
                                取消
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={loading}
                                style={{
                                    flex: 2, padding: '12px', borderRadius: '8px', border: 'none',
                                    background: loading ? '#ccc' : '#2e7d32', color: '#fff',
                                    cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '15px'
                                }}
                            >
                                {loading ? '產卡中...' : '確認產卡'}
                            </button>
                        </div>
                    </>
                )}

                {/* Stage 2: 預覽 + 列印 */}
                {stage === 'preview' && chargeCardResult && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#2e7d32' }}>
                                收費卡已產生
                            </h2>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={handlePrint}
                                    style={{
                                        padding: '8px 16px', borderRadius: '6px', border: '1px solid #1976d2',
                                        background: '#e3f2fd', color: '#1976d2', cursor: 'pointer', fontWeight: 'bold'
                                    }}
                                >
                                    列印
                                </button>
                                <button
                                    onClick={handleNotify}
                                    disabled={notifyLoading || notifyResult?.sent > 0}
                                    style={{
                                        padding: '8px 16px', borderRadius: '6px', border: 'none',
                                        background: notifyResult?.sent > 0 ? '#a5d6a7' : '#4caf50',
                                        color: '#fff', cursor: notifyLoading ? 'not-allowed' : 'pointer', fontWeight: 'bold'
                                    }}
                                >
                                    {notifyLoading ? '發送中...' :
                                     notifyResult?.sent > 0 ? `已通知 ${notifyResult.sent} 人` :
                                     '發送 LINE 通知'}
                                </button>
                                <button
                                    onClick={onClose}
                                    style={{
                                        padding: '8px 16px', borderRadius: '6px', border: '1px solid #ddd',
                                        background: '#fff', cursor: 'pointer'
                                    }}
                                >
                                    關閉
                                </button>
                            </div>
                        </div>

                        {/* 通知結果 */}
                        {notifyResult && (
                            <div style={{
                                padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px',
                                background: notifyResult.error ? '#ffebee' : '#e8f5e9',
                                color: notifyResult.error ? '#c62828' : '#2e7d32'
                            }}>
                                {notifyResult.error
                                    ? `通知失敗: ${notifyResult.error}`
                                    : `LINE 通知：已發送 ${notifyResult.sent} 人 / 跳過 ${notifyResult.failed} 人`
                                }
                            </div>
                        )}

                        {/* 收費卡模板 */}
                        <ChargeCardTemplate
                            booking={chargeCardResult.booking}
                            chargeCard={chargeCardResult.chargeCard}
                            caddy={chargeCardResult.caddy}
                            feesBreakdown={chargeCardResult.feesBreakdown}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
