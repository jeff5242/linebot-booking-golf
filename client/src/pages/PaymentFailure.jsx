import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function PaymentFailure() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    return (
        <div className="container" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="card">
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>❌</div>
                <h1 className="title" style={{ color: '#ef4444' }}>支付失敗</h1>
                <p style={{ marginBottom: '24px', color: '#64748b' }}>
                    很抱歉，在處理您的款項時發生錯誤。您的預約尚未完成。
                </p>
                {(code || error) && (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '30px', padding: '10px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                        錯誤代碼: {code || error}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                    >
                        重新預約
                    </button>
                    <button
                        onClick={() => navigate('/my-bookings')}
                        className="btn"
                        style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#475569' }}
                    >
                        查看現有預約
                    </button>
                </div>
            </div>
        </div>
    );
}
