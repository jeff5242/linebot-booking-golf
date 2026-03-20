import React, { useState, useEffect } from 'react';
import { adminFetch } from '../utils/adminApi';

const AUDIENCE_OPTIONS = [
    { value: 'all', label: '全體好友', desc: '發送給所有加入 LINE 好友的人' },
    { value: 'registered', label: '註冊會員', desc: '已綁定 LINE 的註冊用戶' },
    { value: 'has_bookings', label: '有預約紀錄', desc: '曾經預約過的會員' },
    { value: 'has_charges', label: '有收費紀錄', desc: '已有收費卡紀錄的會員' },
];

const AUDIENCE_LABEL = Object.fromEntries(AUDIENCE_OPTIONS.map(o => [o.value, o.label]));

export function BroadcastPanel() {
    const [audience, setAudience] = useState('all');
    const [message, setMessage] = useState('');
    const [estimatedCount, setEstimatedCount] = useState(null);
    const [estimateNote, setEstimateNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [logs, setLogs] = useState([]);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        fetchEstimate(audience);
    }, [audience]);

    const fetchEstimate = async (aud) => {
        try {
            setLoading(true);
            const res = await adminFetch(`/api/broadcast/estimate?audience=${aud}`);
            const data = await res.json();
            setEstimatedCount(data.estimated_count);
            setEstimateNote(data.note || '');
        } catch {
            setEstimatedCount(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await adminFetch('/api/broadcast/logs');
            const data = await res.json();
            setLogs(data.logs || []);
        } catch {
            // ignore
        }
    };

    const handleSend = async () => {
        setShowConfirm(false);
        setSending(true);
        setFeedback(null);
        try {
            const res = await adminFetch('/api/broadcast/send', {
                method: 'POST',
                body: JSON.stringify({ audience, message: message.trim() }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setFeedback({ type: 'success', text: '推播發送成功！' });
                setMessage('');
                fetchLogs();
            } else {
                setFeedback({ type: 'error', text: data.error || '發送失敗' });
            }
        } catch {
            setFeedback({ type: 'error', text: '發送失敗，請稍後再試' });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="card animate-fade-in">
            <h2 className="title" style={{ marginBottom: '20px' }}>訊息推播</h2>

            {/* Feedback */}
            {feedback && (
                <div style={{
                    padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
                    backgroundColor: feedback.type === 'success' ? '#dcfce7' : '#fef2f2',
                    color: feedback.type === 'success' ? '#166534' : '#991b1b',
                    fontWeight: 'bold'
                }}>
                    {feedback.text}
                </div>
            )}

            {/* 受眾選擇 */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>選擇受眾</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                    {AUDIENCE_OPTIONS.map(opt => (
                        <label key={opt.value} style={{
                            display: 'flex', alignItems: 'flex-start', gap: '8px',
                            padding: '12px', borderRadius: '8px', cursor: 'pointer',
                            border: `2px solid ${audience === opt.value ? '#3b82f6' : '#e5e7eb'}`,
                            backgroundColor: audience === opt.value ? '#eff6ff' : '#fff',
                            transition: 'all 0.15s'
                        }}>
                            <input
                                type="radio" name="audience" value={opt.value}
                                checked={audience === opt.value}
                                onChange={(e) => setAudience(e.target.value)}
                                style={{ marginTop: '2px' }}
                            />
                            <div>
                                <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{opt.label}</div>
                                <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{opt.desc}</div>
                            </div>
                        </label>
                    ))}
                </div>

                {/* 預估人數 */}
                <div style={{ marginTop: '10px', padding: '10px 14px', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '0.9rem' }}>
                    {loading ? (
                        <span style={{ color: '#9ca3af' }}>計算中...</span>
                    ) : estimateNote ? (
                        <span style={{ color: '#6b7280' }}>{estimateNote}</span>
                    ) : (
                        <span>預估發送人數：<strong style={{ color: '#3b82f6' }}>{estimatedCount ?? '—'}</strong> 人</span>
                    )}
                </div>
            </div>

            {/* 訊息輸入 */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>訊息內容</label>
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 5000))}
                    placeholder="輸入要推播的訊息..."
                    rows={6}
                    style={{
                        width: '100%', padding: '12px', borderRadius: '8px',
                        border: '1px solid #d1d5db', fontSize: '0.95rem',
                        resize: 'vertical', fontFamily: 'inherit',
                        boxSizing: 'border-box'
                    }}
                />
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: message.length > 4500 ? '#ef4444' : '#9ca3af' }}>
                    {message.length} / 5000
                </div>
            </div>

            {/* 訊息預覽 */}
            {message.trim() && (
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>預覽</label>
                    <div style={{ backgroundColor: '#e5e7eb', padding: '16px', borderRadius: '12px', maxWidth: '400px' }}>
                        <div style={{
                            backgroundColor: '#fff', padding: '12px 16px', borderRadius: '0 16px 16px 16px',
                            fontSize: '0.95rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
                        }}>
                            {message.trim()}
                        </div>
                    </div>
                </div>
            )}

            {/* 發送按鈕 */}
            <button
                onClick={() => setShowConfirm(true)}
                disabled={!message.trim() || sending}
                style={{
                    padding: '12px 28px', borderRadius: '8px', border: 'none',
                    backgroundColor: (!message.trim() || sending) ? '#d1d5db' : '#3b82f6',
                    color: 'white', fontWeight: 'bold', fontSize: '1rem',
                    cursor: (!message.trim() || sending) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s'
                }}
            >
                {sending ? '發送中...' : '發送推播'}
            </button>

            {/* 確認對話框 */}
            {showConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000
                }} onClick={() => setShowConfirm(false)}>
                    <div style={{
                        backgroundColor: '#fff', padding: '24px', borderRadius: '12px',
                        maxWidth: '450px', width: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
                    }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px 0' }}>確認發送推播？</h3>
                        <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '0.9rem' }}>
                            <p style={{ margin: '0 0 6px 0' }}><strong>受眾：</strong>{AUDIENCE_LABEL[audience]}</p>
                            <p style={{ margin: '0 0 6px 0' }}>
                                <strong>預估人數：</strong>
                                {estimatedCount != null ? `${estimatedCount} 人` : '所有 LINE 好友'}
                            </p>
                            <p style={{ margin: 0 }}><strong>訊息：</strong></p>
                            <div style={{ whiteSpace: 'pre-wrap', marginTop: '4px', color: '#374151', maxHeight: '150px', overflowY: 'auto' }}>
                                {message.trim()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowConfirm(false)}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSend}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#3b82f6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                確認發送
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 發送紀錄 */}
            <div style={{ marginTop: '32px' }}>
                <h3 style={{ marginBottom: '12px', fontWeight: 'bold' }}>發送紀錄</h3>
                {logs.length === 0 ? (
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>尚無發送紀錄</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                                    <th style={{ padding: '10px' }}>時間</th>
                                    <th style={{ padding: '10px' }}>受眾</th>
                                    <th style={{ padding: '10px' }}>訊息摘要</th>
                                    <th style={{ padding: '10px' }}>發送數</th>
                                    <th style={{ padding: '10px' }}>狀態</th>
                                    <th style={{ padding: '10px' }}>操作者</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                                            {new Date(log.sent_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td style={{ padding: '10px' }}>{AUDIENCE_LABEL[log.audience] || log.audience}</td>
                                        <td style={{ padding: '10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.message}
                                        </td>
                                        <td style={{ padding: '10px' }}>
                                            {log.actual_sent != null ? log.actual_sent : '全體'}
                                            {log.failed_count > 0 && <span style={{ color: '#ef4444' }}> ({log.failed_count} 失敗)</span>}
                                        </td>
                                        <td style={{ padding: '10px' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold',
                                                backgroundColor: log.status === 'completed' ? '#dcfce7' : '#fef2f2',
                                                color: log.status === 'completed' ? '#166534' : '#991b1b'
                                            }}>
                                                {log.status === 'completed' ? '成功' : '失敗'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px' }}>{log.sent_by}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
