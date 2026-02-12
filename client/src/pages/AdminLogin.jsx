import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { adminFetch, storeLoginResult } from '../utils/adminApi';

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
    const [mockServerOtp, setMockServerOtp] = useState(null);

    // Detect if input is email
    const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);

    useEffect(() => {
        if (isEmail(username)) {
            setUseOtp(true);
        } else {
            setUseOtp(false);
        }
    }, [username]);

    const sendOtp = async () => {
        setLoading(true);
        try {
            // Check if admin exists first
            const { data: user } = await supabase
                .from('admins')
                .select('id')
                .eq('username', username)
                .maybeSingle();

            if (!user) {
                alert('此 Email 不是管理員帳號');
                setLoading(false);
                return;
            }

            // Generate Mock OTP
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            setMockServerOtp(code);
            setOtpSent(true);

            setTimeout(() => {
                alert(`[模擬信件] 您的後台登入驗證碼為: ${code}\n此為模擬功能，請填入此號碼。`);
            }, 1000);

        } catch (err) {
            console.error(err);
            alert('系統錯誤');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            if (useOtp) {
                // Email OTP Login
                if (!otpSent) {
                    await sendOtp();
                    return;
                }

                if (otp !== mockServerOtp) {
                    alert('驗證碼錯誤');
                    setLoading(false);
                    return;
                }

                // OTP 驗證成功，透過後端 API 取得 JWT
                // 使用管理員的密碼進行後端登入（OTP 已驗證身份）
                // 這裡暫時使用 Supabase 取得密碼後呼叫後端
                const { data: adminData } = await supabase
                    .from('admins')
                    .select('password')
                    .eq('username', username)
                    .single();

                if (adminData) {
                    await loginViaApi(username, adminData.password);
                }

            } else {
                // Username/Password Login - 透過後端 API
                await loginViaApi(username, password);
            }
        } catch (err) {
            console.error(err);
            alert('發生錯誤');
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
                                偵測到 Email，將發送驗證碼
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
                                placeholder="請查收信件輸入驗證碼"
                                value={otp}
                                onChange={e => setOtp(e.target.value)}
                            />
                        </div>
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
                            onClick={() => { setOtpSent(false); setOtp(''); }}
                        >
                            重新輸入帳號
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}
