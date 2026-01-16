import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

export function AdminLogin() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('admins')
                .select('*')
                .eq('username', formData.username)
                .eq('password', formData.password)
                .single();

            if (error || !data) {
                alert('登入失敗：帳號或密碼錯誤');
            } else {
                // Login Success
                // Use sessionStorage so session dies when tab closes (safer for admin)
                sessionStorage.setItem('admin_token', 'true');
                sessionStorage.setItem('admin_name', data.name);
                navigate('/admin');
            }
        } catch (err) {
            console.error(err);
            alert('發生錯誤');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
            <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '40px' }}>
                <h1 className="title" style={{ textAlign: 'center', marginBottom: '30px' }}>後台管理登入</h1>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">帳號 (手機/Email)</label>
                        <input
                            type="text"
                            className="form-input"
                            required
                            placeholder="請輸入帳號"
                            value={formData.username}
                            onChange={e => setFormData({ ...formData, username: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">密碼</label>
                        <input
                            type="password"
                            className="form-input"
                            required
                            placeholder="請輸入密碼"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ marginTop: '20px' }}
                    >
                        {loading ? '登入中...' : '登入'}
                    </button>
                </form>
            </div>
        </div>
    );
}
