import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function PaymentSuccess() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const transactionId = searchParams.get('transactionId');

    return (
        <div className="container" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="card">
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>✅</div>
                <h1 className="title" style={{ color: 'var(--primary-color)' }}>預約成功！</h1>
                <p style={{ marginBottom: '24px', color: '#64748b' }}>
                    您的款項已支付成功，系統已為您保留時段。
                </p>
                {transactionId && (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '30px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                        交易編號: {transactionId}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/my-bookings')}
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                    >
                        查看我的預約
                    </button>
                    <button
                        onClick={() => navigate('/')}
                        className="btn"
                        style={{ width: '100%', backgroundColor: '#f1f5f9', color: '#475569' }}
                    >
                        回到首頁
                    </button>
                </div>
            </div>
        </div>
    );
}
