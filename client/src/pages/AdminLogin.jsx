import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { storeLoginResult } from '../utils/adminApi';

export function AdminLogin() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    // Auth Mode: "password" (for username/phone) or "otp" (for email)
    const [useOtp, setUseOtp] = useState(false);

    // Login Details
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    // OTP State
    const [otpSent, setOtpSent] = useState(false);
    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');

    // Detect if input is email
    const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

    useEffect(() => {
        document.title = '管理員登入';
        if (isEmail(username)) {
            setUseOtp(true);
        } else {
            setUseOtp(false);
        }
    }, [username]);

    // 透過 Supabase Auth 發送 Email OTP
    const sendOtp = async () => {
        setLoading(true);
        setOtpError('');
        try {
            // 先確認是管理員帳號
            const { data: admin } = await supabase
                .from('admins')
                .select('id')
                .eq('username', username)
                .maybeSingle();

            if (!admin) {
                setOtpError('此 Email 不是管理員帳號');
                setLoading(false);
                return;
            }

            // 透過 Supabase Auth 發送 OTP 信件
            const { error } = await supabase.auth.signInWithOtp({
                email: username,
                options: { shouldCreateUser: true }
            });

            if (error) {
                if (error.message?.includes('rate limit')) {
                    setOtpError('發送次數過多，請稍後再試');
                } else {
                    setOtpError(error.message || '發送驗證碼失敗');
                }
                return;
            }

            setOtpSent(true);
        } catch (err) {
            console.error(err);
            setOtpError('系統錯誤：' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setOtpError('');

        try {
            if (useOtp) {
                // Email OTP Login
                if (!otpSent) {
                    await sendOtp();
                    return;
                }

                // 透過 Supabase Auth 驗證 OTP
                const { error: verifyError } = await supabase.auth.verifyOtp({
                    email: username,
                    token: otp,
                    type: 'email'
                });

                if (verifyError) {
                    setOtpError('驗證碼錯誤或已過期');
                    setLoading(false);
                    return;
                }

                // Supabase 驗證成功，取得後台 JWT
                const apiUrl = import.meta.env.VITE_API_URL || '';
                const res = await fetch(`${apiUrl}/api/admin/login-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username }),
                });
                const result = await res.json();
                if (!res.ok) {
                    setOtpError(result.error || '登入失敗');
                    return;
                }
                storeLoginResult(result);
                navigate('/admin');

            } else {
                // Username/Password Login
                await loginViaApi(username, password);
            }
        } catch (err) {
            console.error(err);
            setOtpError('發生錯誤：' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const loginViaApi = async (user, pass) => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass }),
            });

            const result = await res.json();
            if (!res.ok) {
                alert(result.error || '登入失敗');
                return;
            }

            storeLoginResult(result);
            navigate('/admin');
        } catch (err) {
            alert('登入失敗：' + err.message);
        }
    };

    const handleReset = () => {
        setOtpSent(false);
        setOtp('');
        setOtpError('');
    };

    return (
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '40px' }}>
                <h1 className="title" style={{ textAlign: 'center', marginBottom: '30px' }}>後台管理登入</h1>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">帳號 (手機 / Email)</label>
                        <input
                            type="text"
                            className="form-input"
                            required
                            placeholder="輸入 Email 將使用驗證碼登入"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            disabled={otpSent}
                        />
                        {useOtp && !otpSent && (
                            <small style={{ color: '#059669', marginTop: '4px', display: 'block' }}>
                                偵測到 Email，將透過信箱發送驗證碼
                            </small>
                        )}
                    </div>

                    {!useOtp && (
                        <div className="form-group animate-fade-in">
                            <label className="form-label">密碼</label>
                            <input
                                type="password"
                                className="form-input"
                                required
                                placeholder="請輸入密碼"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    )}

                    {otpSent && (
                        <div className="form-group animate-fade-in">
                            <label className="form-label">Email 驗證碼</label>
                            <input
                                type="text"
                                className="form-input"
                                required
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="請輸入信件中的 6 位數驗證碼"
                                value={otp}
                                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                                autoFocus
                            />
                            <small style={{ color: '#6b7280', marginTop: '4px', display: 'block' }}>
                                驗證碼已發送至 {username}
                            </small>
                        </div>
                    )}

                    {otpError && (
                        <p style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '8px' }}>{otpError}</p>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ marginTop: '20px' }}
                    >
                        {loading ? '處理中...' : (useOtp && !otpSent ? '發送驗證碼' : '登入')}
                    </button>

                    {otpSent && (
                        <button
                            type="button"
                            className="btn"
                            style={{ marginTop: '10px', background: '#f3f4f6', color: '#374151', width: '100%' }}
                            onClick={handleReset}
                        >
                            重新輸入帳號
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}
