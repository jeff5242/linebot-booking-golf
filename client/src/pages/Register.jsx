import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import liff from '@line/liff';

export function Register() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isLineLoggedIn, setIsLineLoggedIn] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        phone: ''
    });

    useEffect(() => {
        checkLineLogin();
    }, []);

    const checkLineLogin = async () => {
        try {
            await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });
            if (liff.isLoggedIn()) {
                setIsLineLoggedIn(true);
                const profile = await liff.getProfile();
                localStorage.setItem('line_user_id', profile.userId);
            } else {
                setIsLineLoggedIn(false);
                // Optionally auto-login here, or let user click button
                // liff.login(); 
            }
        } catch (err) {
            console.error('LIFF check failed', err);
        }
    };

    const handleLineLogin = () => {
        liff.login({ redirectUri: window.location.href });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Updated to ensure we use REAL Line ID
            const lineUserId = localStorage.getItem('line_user_id');

            if (!lineUserId) {
                alert('無法取得 LINE 使用者資訊，請重新登入 LINE');
                handleLineLogin();
                return;
            }

            // 2. Insert or Update into Supabase
            // Check by Phone first
            const { data: existingUserByPhone } = await supabase
                .from('users')
                .select('id')
                .eq('phone', formData.phone)
                .single();

            // Check by Line ID
            const { data: existingUserById } = await supabase
                .from('users')
                .select('id')
                .eq('line_user_id', lineUserId)
                .single();

            let error;

            if (existingUserByPhone) {
                // Phone exists -> Bind this Line ID to this Phone user
                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                        line_user_id: lineUserId,
                        display_name: formData.name
                    })
                    .eq('id', existingUserByPhone.id);
                error = updateError;
            } else if (existingUserById) {
                // Line ID exists (but phone is different) -> Update phone for this user
                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                        phone: formData.phone,
                        display_name: formData.name
                    })
                    .eq('id', existingUserById.id);
                error = updateError;
            } else {
                // New user
                const { error: insertError } = await supabase
                    .from('users')
                    .insert([
                        {
                            line_user_id: lineUserId,
                            display_name: formData.name,
                            phone: formData.phone
                        }
                    ]);
                error = insertError;
            }

            if (error) {
                console.error('Registration error:', error);
                alert('註冊失敗: ' + error.message);
                return;
            }

            // 3. Save locally
            localStorage.setItem('golf_user_phone', formData.phone);
            localStorage.setItem('golf_user_name', formData.name);

            alert('註冊成功！');

            // 4. Force reload to ensure App.jsx re-checks user status
            window.location.href = '/';

        } catch (error) {
            console.error('Unexpected error:', error);
            alert('Error registering: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

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
                    歡迎使用高爾夫預約系統，請先綁定您的個人資訊。
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
                        <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="form-input"
                            required
                            placeholder="0912345678"
                            maxLength="10"
                            value={formData.phone}
                            onChange={e => {
                                const value = e.target.value.replace(/[^0-9]/g, '');
                                setFormData({ ...formData, phone: value });
                            }}
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? '處理中...' : '確認綁定'}
                    </button>
                </form>
            </div>
        </div>
    );
}
