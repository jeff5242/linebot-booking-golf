import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import liff from '@line/liff';
import { sendLiffMessage } from '../utils/liffHelper';

export function Register() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isCheckingLine, setIsCheckingLine] = useState(true); // New loading state for initial check
    const [isLineLoggedIn, setIsLineLoggedIn] = useState(false);

    // Rich Menu Sync Helper
    const refreshRichMenu = async (lineUserId) => {
        try {
            await fetch(`${apiUrl}/api/user/richmenu`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lineUserId })
            });
        } catch (e) {
            console.error('Rich Menu sync failed', e);
        }
    };

    // OTP State
    const [verificationSent, setVerificationSent] = useState(false);
    const [otp, setOtp] = useState('');
    const [countdown, setCountdown] = useState(0);
    const [sendingOtp, setSendingOtp] = useState(false);
    const [otpMessage, setOtpMessage] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        phone: ''
    });

    const apiUrl = import.meta.env.VITE_API_URL || '';

    useEffect(() => {
        // Send initial "I am registering/checking" log
        // But better inside checkLineLogin so we know context or after specific actions?
        // User asked: "1. 註冊會員" - likely on page load.
        // We need to be careful not to hold up the UI.

        // Let's rely on standard flow.
        checkLineLogin();
    }, []);

    // Countdown timer effect
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const checkLineLogin = async () => {
        try {
            let lineUserId;

            if (import.meta.env.DEV) {
                console.log('Dev mode: Mocking LIFF login');
                setIsLineLoggedIn(true);
                lineUserId = 'test_user_001';
                localStorage.setItem('line_user_id', lineUserId);
            } else {
                await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });
                if (liff.isLoggedIn()) {
                    setIsLineLoggedIn(true);
                    // Send "Page View" message
                    // User Example: 1. 註冊會員
                    // We only send it once per session if possible, or just on load.
                    // Doing it here covers both logged-in states.
                    // However, we need to check if we are redirecting first.
                    const context = liff.getContext();
                    if (context && context.type === 'utou') {
                        // Only send if not redirected yet... 
                        // But for now, let's just trigger it. 
                        // To avoid duplicate "Member Center" messages, we should check if they are already registered.
                    }

                    const profile = await liff.getProfile();
                    lineUserId = profile.userId;
                    localStorage.setItem('line_user_id', lineUserId);
                } else {
                    setIsLineLoggedIn(false);
                    return;
                }
            }

            // 檢查用戶是否已註冊
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, display_name')
                .eq('line_user_id', lineUserId)
                .single();

            // Always sync Rich Menu if we know the user ID, just in case
            await refreshRichMenu(lineUserId);

            if (existingUser) {
                console.log('用戶已註冊，跳轉到個人中心');
                // Store basics just in case
                if (existingUser.display_name) localStorage.setItem('golf_user_name', existingUser.display_name);

                // Logging for existing member
                await sendLiffMessage('登入會員中心');

                // Direct redirect, no form render
                window.location.href = '/member';
                return;
            } else {
                // New user landing on register page
                await sendLiffMessage('註冊會員');
            }
        } catch (err) {
            console.error('LIFF check failed', err);
            alert('系統檢查失敗，請稍後再試');
        } finally {
            setIsCheckingLine(false); // Stop loading
        }
    };

    const handleLineLogin = () => {
        liff.login({ redirectUri: window.location.href });
    };

    const sendVerificationCode = async () => {
        if (!formData.phone || formData.phone.length < 10) {
            alert('請先輸入正確的手機號碼');
            return;
        }

        setSendingOtp(true);
        setOtpMessage('');

        try {
            const res = await fetch(`${apiUrl}/api/otp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: formData.phone, purpose: 'registration' }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setVerificationSent(true);
                setCountdown(60);
                setOtpMessage('驗證碼已發送至您的手機');
            } else {
                setOtpMessage(data.error || '發送失敗，請稍後再試');
            }
        } catch (err) {
            console.error('Send OTP Error:', err);
            setOtpMessage('網路錯誤，請稍後再試');
        } finally {
            setSendingOtp(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!verificationSent) {
            alert('請先進行手機驗證');
            return;
        }
        if (!otp || otp.length !== 6) {
            alert('請輸入 6 位數驗證碼');
            return;
        }

        setLoading(true);
        setOtpMessage('');

        try {
            const lineUserId = localStorage.getItem('line_user_id');

            if (!lineUserId) {
                alert('無法取得 LINE 使用者資訊，請重新登入 LINE');
                handleLineLogin();
                return;
            }

            // 呼叫後端：OTP 驗證 + 綁定一步完成
            const res = await fetch(`${apiUrl}/api/member/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: formData.phone,
                    code: otp,
                    name: formData.name,
                    lineUserId,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setOtpMessage(data.error || '註冊失敗');
                return;
            }

            // 儲存到 localStorage
            localStorage.setItem('golf_user_phone', formData.phone);
            localStorage.setItem('golf_user_name', formData.name || data.user?.display_name || '');

            alert('註冊成功！');
            await refreshRichMenu(lineUserId);
            await sendLiffMessage('註冊成功');
            window.location.href = '/member';

        } catch (error) {
            console.error('Unexpected error:', error);
            setOtpMessage('發生錯誤，請稍後再試');
        } finally {
            setLoading(false);
        }
    };

    if (isCheckingLine) {
        return (
            <div className="container" style={{ textAlign: 'center', paddingTop: '60px' }}>
                <p style={{ color: '#999' }}>正在確認您的會員身份...</p>
            </div>
        );
    }

    if (!isLineLoggedIn) {
        return (
            <div className="container">
                <div className="card animate-fade-in" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <h1 className="title">歡迎使用</h1>
                    <p style={{ marginBottom: '30px', color: '#666' }}>
                        請先登入 LINE 帳號以進行球場預約
                    </p>
                    <button
                        onClick={handleLineLogin}
                        className="btn"
                        style={{ background: '#06C755', color: 'white', fontWeight: 'bold' }}
                    >
                        使用 LINE 登入
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container">
            <div className="card animate-fade-in">
                <h1 className="title">首次使用設定</h1>
                <p style={{ marginBottom: '20px', color: '#666', textAlign: 'center' }}>
                    歡迎使用高爾夫預約系統，請先驗證手機並綁定資訊。
                </p>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">真實姓名</label>
                        <input
                            type="text"
                            className="form-input"
                            required
                            placeholder="王小明"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">手機號碼</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="form-input"
                                required
                                placeholder="0912345678"
                                maxLength="10"
                                style={{ flex: 1 }}
                                value={formData.phone}
                                onChange={e => {
                                    const value = e.target.value.replace(/[^0-9]/g, '');
                                    setFormData({ ...formData, phone: value });
                                }}
                                disabled={verificationSent}
                            />
                            <button
                                type="button"
                                onClick={sendVerificationCode}
                                disabled={countdown > 0 || !formData.phone || sendingOtp}
                                style={{
                                    padding: '0 12px',
                                    backgroundColor: (countdown > 0 || sendingOtp) ? '#d1d5db' : 'var(--primary-color)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    whiteSpace: 'nowrap',
                                    cursor: (countdown > 0 || sendingOtp) ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {sendingOtp ? '發送中...' : countdown > 0 ? `${countdown}s` : (verificationSent ? '重發' : '發送驗證碼')}
                            </button>
                        </div>
                    </div>

                    {/* OTP 訊息提示 */}
                    {otpMessage && (
                        <div style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            fontSize: '0.9rem',
                            backgroundColor: otpMessage.includes('已發送') || otpMessage.includes('成功') ? '#dcfce7' : '#fee2e2',
                            color: otpMessage.includes('已發送') || otpMessage.includes('成功') ? '#166534' : '#dc2626',
                        }}>
                            {otpMessage}
                        </div>
                    )}

                    {verificationSent && (
                        <div className="form-group animate-fade-in">
                            <label className="form-label">驗證碼</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                className="form-input"
                                required
                                placeholder="請輸入6位數驗證碼"
                                maxLength="6"
                                value={otp}
                                onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                            />
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? '處理中...' : '確認綁定'}
                    </button>
                </form>
            </div>
        </div>
    );
}
