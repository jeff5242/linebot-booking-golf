import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar } from '../components/Calendar';
import { generateDailySlots, isSlotAvailable, calculateBookingPrice } from '../utils/golfLogic';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

export function Booking() {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedHoles, setSelectedHoles] = useState(18);
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [userName, setUserName] = useState('');

    // Player Details State
    const [showPlayerModal, setShowPlayerModal] = useState(false);
    const [pendingTime, setPendingTime] = useState(null);
    const [playersCount, setPlayersCount] = useState(4);
    const [players, setPlayers] = useState([
        { name: '', phone: '' },
        { name: '', phone: '' },
        { name: '', phone: '' },
        { name: '', phone: '' }
    ]);

    // Service Options
    const [needsCart, setNeedsCart] = useState(true);
    const [needsCaddie, setNeedsCaddie] = useState(true);

    // Load Main User Info
    useEffect(() => {
        loadMainUser();
        // Load user name for header
        const name = localStorage.getItem('golf_user_name');
        if (name) setUserName(name);
    }, []);

    const loadMainUser = async () => {
        try {
            const phone = localStorage.getItem('golf_user_phone');
            const name = localStorage.getItem('golf_user_name');

            if (phone) {
                // Try to get from database first - handle multiple records
                const { data: users, error } = await supabase
                    .from('users')
                    .select('display_name, phone')
                    .eq('phone', phone)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (users && users.length > 0 && !error) {
                    const data = users[0];
                    setPlayers(prev => {
                        const newPlayers = [...prev];
                        newPlayers[0] = { name: data.display_name || name || '', phone: data.phone };
                        return newPlayers;
                    });
                } else if (name && phone) {
                    // Fallback to localStorage if DB query fails
                    setPlayers(prev => {
                        const newPlayers = [...prev];
                        newPlayers[0] = { name: name, phone: phone };
                        return newPlayers;
                    });
                }
            }
        } catch (error) {
            console.error('Error loading user:', error);
            // Fallback to localStorage
            const phone = localStorage.getItem('golf_user_phone');
            const name = localStorage.getItem('golf_user_name');
            if (name && phone) {
                setPlayers(prev => {
                    const newPlayers = [...prev];
                    newPlayers[0] = { name: name, phone: phone };
                    return newPlayers;
                });
            }
        }
    };

    // Fetch bookings... (existing useEffect)
    useEffect(() => {
        fetchBookings();
    }, [selectedDate]);

    const fetchBookings = async () => {
        setLoading(true);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const { data, error } = await supabase.from('bookings').select('*').eq('date', dateStr);
        if (!error) setBookings(data || []);
        setLoading(false);
    };

    // Open Modal instead of direct alert
    const handleBook = (time) => {
        setPendingTime(time);
        setShowPlayerModal(true);
    };

    const updatePlayer = (index, field, value) => {
        setPlayers(prev => {
            const newPlayers = [...prev];
            newPlayers[index] = { ...newPlayers[index], [field]: value };
            return newPlayers;
        });
    };

    const validatePhone = (phone) => {
        // Taiwan mobile: 09XX-XXX-XXX (10 digits starting with 09)
        const phoneRegex = /^09\d{8}$/;
        return phoneRegex.test(phone.replace(/[^0-9]/g, ''));
    };

    const confirmBooking = async (e) => {
        e.preventDefault();
        if (!pendingTime) return;

        // Validate main booker phone
        if (!validatePhone(players[0].phone)) {
            alert('請輸入正確的台灣手機號碼格式 (09開頭，共10碼)');
            return;
        }

        try {
            const userPhone = localStorage.getItem('golf_user_phone');
            const userName = localStorage.getItem('golf_user_name');
            const lineUserId = localStorage.getItem('line_user_id') || 'temp_' + Date.now();

            // Try to find user - handle duplicate phones by taking the latset one
            const { data: users, error: userError } = await supabase
                .from('users')
                .select('id')
                .eq('phone', userPhone)
                .order('created_at', { ascending: false })
                .limit(1);

            let user = users && users.length > 0 ? users[0] : null;

            // If user not found but we have local info, try to register/restore user seamlessly
            if (!user && userPhone && userName) {
                console.log('User not found in DB, attempting auto-restore...');
                const { data: newUser, error: createError } = await supabase
                    .from('users')
                    .insert([{
                        line_user_id: lineUserId,
                        phone: userPhone,
                        display_name: userName
                    }])
                    .select('id')
                    .single();

                if (newUser && !createError) {
                    user = newUser;
                }
            }

            if (!user) {
                alert('找不到使用者資料，請重新註冊');
                navigate('/register');
                return;
            }

            const pricing = calculateBookingPrice(selectedHoles, playersCount, needsCart, needsCaddie);

            const { data: booking, error } = await supabase.from('bookings').insert([
                {
                    user_id: user.id,
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    time: format(pendingTime, 'HH:mm:ss'),
                    holes: selectedHoles,
                    players_count: playersCount,
                    status: 'confirmed',
                    players_info: players.slice(0, playersCount),
                    needs_cart: needsCart,
                    needs_caddie: needsCaddie,
                    amount: pricing.total,
                    payment_status: 'pending'
                }
            ]).select('id').single();

            if (error) throw error;

            // Trigger LINE Pay Payment
            setLoading(true);
            const response = await fetch('/api/payment/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: pricing.total,
                    bookingId: booking.id,
                    productName: `${selectedHoles}洞高爾夫預約 (${playersCount}人)`
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Payment request failed');
            }

            const paymentUrl = await response.json();
            window.location.href = paymentUrl;

        } catch (e) {
            alert('預約失敗: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const slots = generateDailySlots(selectedDate);

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>預約球場</h1>
                    <button
                        onClick={() => navigate('/my-bookings')}
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--primary-color)',
                            padding: '4px 12px',
                            border: '1px solid var(--primary-color)',
                            borderRadius: '16px',
                            background: 'white',
                            cursor: 'pointer'
                        }}>
                        我的預約
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {userName ? (
                        <>
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: 'var(--primary-color)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontWeight: 'bold',
                                fontSize: '0.9rem'
                            }}>
                                {userName.charAt(0)}
                            </div>
                            <span style={{ fontSize: '0.9rem', color: '#374151' }}>{userName}</span>
                        </>
                    ) : (
                        <button
                            onClick={() => navigate('/register')}
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                border: '1px solid #d1d5db',
                                background: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '1.2rem'
                            }}>
                            👤
                        </button>
                    )}
                </div>
            </div>

            <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            {/* Holes Selector */}
            <div className="card" style={{ padding: '0.5rem', display: 'flex', gap: '4px', marginBottom: '1rem' }}>
                <button
                    onClick={() => setSelectedHoles(9)}
                    className={`btn ${selectedHoles === 9 ? 'btn-primary' : ''}`}
                    style={{ flex: 1, backgroundColor: selectedHoles === 9 ? 'var(--primary-color)' : '#f3f4f6', color: selectedHoles === 9 ? 'white' : '#666' }}
                >
                    9 洞
                </button>
                <button
                    onClick={() => setSelectedHoles(18)}
                    className={`btn ${selectedHoles === 18 ? 'btn-primary' : ''}`}
                    style={{ flex: 1, backgroundColor: selectedHoles === 18 ? 'var(--primary-color)' : '#f3f4f6', color: selectedHoles === 18 ? 'white' : '#666' }}
                >
                    18 洞
                </button>
            </div>

            {/* Time Grid */}
            <div className="time-grid">
                <h3 className="form-label" style={{ marginBottom: '1rem' }}>選擇開球時間</h3>
                {loading ? (
                    <p>載入中...</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                        {slots.map(slot => {
                            const isAvailable = isSlotAvailable(slot, bookings, selectedHoles);
                            const timeLabel = format(slot, 'HH:mm');

                            let isTooLateFor18 = false;
                            if (selectedHoles === 18) {
                                // Cutoff is 13:00 (15:30 - 2.5h)
                                // So valid: <= 13:00.
                                const h = slot.getHours();
                                const m = slot.getMinutes();
                                if (h > 13 || (h === 13 && m > 0)) {
                                    isTooLateFor18 = true;
                                }
                            }

                            const isDisabled = !isAvailable || isTooLateFor18;

                            return (
                                <button
                                    key={timeLabel}
                                    disabled={isDisabled}
                                    onClick={() => handleBook(slot)}
                                    style={{
                                        padding: '10px 4px',
                                        borderRadius: '8px',
                                        border: '1px solid #e5e7eb',
                                        backgroundColor: isDisabled ? '#f3f4f6' : 'white',
                                        color: isDisabled ? '#9ca3af' : 'var(--primary-color)',
                                        fontWeight: '600',
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        boxShadow: isDisabled ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    {timeLabel}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedHoles === 18 && (
                <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#666', textAlign: 'center' }}>
                    * 18 洞最晚開球時間為 13:00 (需於 15:30 前轉場)
                </p>
            )}
            {/* Player Info Modal */}
            {showPlayerModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000,
                    padding: '0'
                }} onClick={() => setShowPlayerModal(false)}>
                    <div className="card" style={{
                        width: '100%',
                        maxWidth: '500px',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        borderRadius: '16px 16px 0 0',
                        margin: 0
                    }} onClick={e => e.stopPropagation()}>
                        <h2 className="title" style={{ marginBottom: '16px' }}>確認預約資訊</h2>
                        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '8px' }}>
                                {format(selectedDate, 'yyyy-MM-dd')} {pendingTime && format(pendingTime, 'HH:mm')} ({selectedHoles}洞)
                            </p>

                            {(() => {
                                const pricing = calculateBookingPrice(selectedHoles, playersCount, needsCart, needsCaddie);
                                return (
                                    <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>果嶺費 ({pricing.breakdown.greenFee.unit} x {pricing.breakdown.greenFee.count})</span>
                                            <span>${pricing.breakdown.greenFee.total}</span>
                                        </div>
                                        {pricing.breakdown.cartFee && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span>球車費 ({pricing.breakdown.cartFee.unit} x {pricing.breakdown.cartFee.count})</span>
                                                <span>${pricing.breakdown.cartFee.total}</span>
                                            </div>
                                        )}
                                        {pricing.breakdown.caddieFee && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span>桿弟費 ({pricing.breakdown.caddieFee.unit} x {pricing.breakdown.caddieFee.count})</span>
                                                <span>${pricing.breakdown.caddieFee.total}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #cbd5e1', color: '#1e293b', fontWeight: 'bold', fontSize: '1rem' }}>
                                            <span>總計金額</span>
                                            <span style={{ color: 'var(--primary-color)' }}>${pricing.total}</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <form onSubmit={confirmBooking}>
                            {/* Service Options */}
                            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
                                <h4 style={{ marginBottom: '10px', fontSize: '0.9rem', fontWeight: 'bold' }}>服務項目</h4>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={needsCart}
                                            onChange={e => setNeedsCart(e.target.checked)}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <span>球車</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={needsCaddie}
                                            onChange={e => setNeedsCaddie(e.target.checked)}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <span>桿弟</span>
                                    </label>
                                </div>

                                <div style={{ marginTop: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                                    <h4 style={{ marginBottom: '8px', fontSize: '0.9rem', fontWeight: 'bold' }}>預約人數</h4>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {[1, 2, 3, 4].map(num => (
                                            <button
                                                key={num}
                                                type="button"
                                                onClick={() => setPlayersCount(num)}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px',
                                                    borderRadius: '6px',
                                                    border: playersCount === num ? '2px solid var(--primary-color)' : '1px solid #d1d5db',
                                                    backgroundColor: playersCount === num ? 'var(--primary-color)' : 'white',
                                                    color: playersCount === num ? 'white' : '#374151',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {num}位
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {players.slice(0, playersCount).map((player, index) => (
                                <div key={index} style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4b5563', width: '70px', flexShrink: 0 }}>
                                            {index === 0 ? '主訂位人' : `組員 ${index + 1}`}
                                        </span>
                                        <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                                            <input
                                                type="text"
                                                placeholder="姓名"
                                                className="form-input"
                                                style={{
                                                    padding: '6px 8px',
                                                    fontSize: '0.9rem',
                                                    flex: 1, // Take available space
                                                    minWidth: '0' // Allow shrinking
                                                }}
                                                required={index === 0}
                                                value={player.name}
                                                onChange={e => updatePlayer(index, 'name', e.target.value)}
                                            />
                                            <input
                                                type="tel"
                                                placeholder="手機"
                                                className="form-input"
                                                style={{
                                                    padding: '6px 8px',
                                                    fontSize: '0.9rem',
                                                    flex: 1.4, // give slightly more space to phone
                                                    minWidth: '0'
                                                }}
                                                required={index === 0}
                                                pattern="09[0-9]{8}"
                                                maxLength="10"
                                                value={player.phone}
                                                onChange={e => {
                                                    const value = e.target.value.replace(/[^0-9]/g, '');
                                                    if (value.length <= 10) {
                                                        updatePlayer(index, 'phone', value);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setShowPlayerModal(false)}
                                    style={{ backgroundColor: '#e5e7eb', color: '#374151' }}
                                >
                                    取消
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    確定預約
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
