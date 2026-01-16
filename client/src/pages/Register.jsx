import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

// Mock LIFF for web dev if not in LIFF browser
const mockLiffId = "mock-user-" + Math.floor(Math.random() * 1000);

export function Register() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        phone: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // 1. Get LINE ID (Mock or Real)
            // In production, use liff.getProfile().userId
            const lineUserId = localStorage.getItem('line_user_id') || mockLiffId;

            // 2. Insert or Update into Supabase
            // First check if phone exists
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('phone', formData.phone)
                .single();

            let error;

            if (existingUser) {
                // User exists, update line_user_id and name
                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                        line_user_id: lineUserId,
                        display_name: formData.name
                    })
                    .eq('phone', formData.phone);
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
