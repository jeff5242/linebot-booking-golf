import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export function MyBookings() {
    const [bookings, setBookings] = useState([]);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchMyBookings();
    }, []);

    const fetchMyBookings = async () => {
        const phone = localStorage.getItem('golf_user_phone');
        if (!phone) return;

        const { data: user } = await supabase.from('users').select('id').eq('phone', phone).single();
        if (!user) return;

        const { data } = await supabase
            .from('bookings')
            .select('*')
            .eq('user_id', user.id)
            .order('date', { ascending: true })
            .order('time', { ascending: true });

        setBookings(data || []);
    };

    const handleCancel = async (id) => {
        if (!confirm('確定取消?')) return;
        const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id);
        if (!error) fetchMyBookings();
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => navigate('/')} style={{ marginRight: '10px', background: 'none', border: 'none', fontSize: '1.2rem' }}>←</button>
                <h1 className="title" style={{ margin: 0 }}>我的預約</h1>
            </div>

            {bookings.length === 0 && <p style={{ textAlign: 'center', color: '#666' }}>尚無預約紀錄</p>}

            {bookings.map(b => (
                <div key={b.id} className="card" style={{ borderLeft: `4px solid ${b.status === 'cancelled' ? 'grey' : 'var(--primary-color)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                            <h3 style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{b.date} {b.time.slice(0, 5)}</h3>
                            <p>{b.holes} 洞 | {b.players_count} 人</p>
                            <p style={{ fontSize: '0.9rem', color: '#666' }}>狀態: {b.status}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                                onClick={() => setSelectedBooking(b)}
                                style={{ backgroundColor: '#e0f2fe', color: '#0369a1', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                                查看詳情
                            </button>
                            {b.status !== 'cancelled' && (
                                <button
                                    onClick={() => handleCancel(b.id)}
                                    style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', padding: '8px 12px', borderRadius: '4px' }}>
                                    取消
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {/* Booking Details Modal */}
            {selectedBooking && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }} onClick={() => setSelectedBooking(null)}>
                    <div className="card" style={{ width: '90%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h2 className="title" style={{ marginBottom: '16px' }}>預約詳情</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{selectedBooking.date} {selectedBooking.time.slice(0, 5)}</p>
                            <p>{selectedBooking.holes} 洞 | {selectedBooking.players_count} 人</p>
                            <p style={{ fontSize: '0.9rem', color: '#666' }}>狀態: {selectedBooking.status}</p>
                        </div>

                        {/* Services */}
                        {(selectedBooking.needs_cart !== undefined || selectedBooking.needs_caddie !== undefined) && (
                            <div style={{ marginBottom: '16px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                                <h4 style={{ marginBottom: '8px', fontSize: '0.9rem' }}>服務項目</h4>
                                <p style={{ fontSize: '0.85rem' }}>
                                    {selectedBooking.needs_cart ? '✓ 球車' : '✗ 球車'} | {selectedBooking.needs_caddie ? '✓ 桿弟' : '✗ 桿弟'}
                                </p>
                            </div>
                        )}

                        {/* Players */}
                        {selectedBooking.players_info && Array.isArray(selectedBooking.players_info) && selectedBooking.players_info.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <h4 style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 'bold' }}>組員名單</h4>
                                {selectedBooking.players_info.map((player, idx) => (
                                    player.name && (
                                        <div key={idx} style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px', marginBottom: '8px' }}>
                                            <p style={{ fontWeight: '600', marginBottom: '2px' }}>{idx + 1}. {player.name}</p>
                                            {player.phone && <p style={{ fontSize: '0.85rem', color: '#666' }}>{player.phone}</p>}
                                        </div>
                                    )
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => setSelectedBooking(null)}
                            className="btn btn-primary"
                            style={{ marginTop: '12px' }}>
                            關閉
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
