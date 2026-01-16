import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar } from '../components/Calendar';
import { generateDailySlots, isSlotAvailable } from '../utils/golfLogic';
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
                // Try to get from database first
                const { data, error } = await supabase
                    .from('users')
                    .select('display_name, phone')
                    .eq('phone', phone)
                    .single();

                if (data && !error) {
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
            const { data: user } = await supabase.from('users').select('id').eq('phone', userPhone).single();

            if (!user) {
                alert('找不到使用者資料，請重新註冊');
                navigate('/register');
                return;
            }

            const { error } = await supabase.from('bookings').insert([
                {
                    user_id: user.id,
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    time: format(pendingTime, 'HH:mm:ss'),
                    holes: selectedHoles,
                    players_count: 4,
                    status: 'confirmed',
                    players_info: players,
                    needs_cart: needsCart,
                    needs_caddie: needsCaddie
                }
            ]);

            if (error) throw error;

            alert('預約成功!');
            setShowPlayerModal(false);
            setPendingTime(null);
            fetchBookings();

        } catch (e) {
            alert('預約失敗: ' + e.message);
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

                            // Checking if it's too late for 18 holes
                            // We use the shared logic now
                            // const isTooLateFor18 = selectedHoles === 18 && slot.getHours() >= 15; 

                            // Import logic from utils ideally, but here we can just do simple hour check or move logic.
                            // Better: use the utility I just added if I imported it.
                            // Wait, I haven't imported it in this file yet. I need to update imports first.
                            // BUT since I can't do multiple edits easily without context, I will just implement the logic directly or rely on "isTooLateFor18" if I imported it.
                            // Let's assume I will import it.

                            // ACTUALLY, I missed adding the import in the `replace_file_content` above. 
                            // I should have done `view_file` -> `multi_replace`.

                            // Let's rely on manual hour check that MATCHES the logic:
                            // Cutoff is 13:00. 13:00 OK. 13:10 BAD.
                            // So if hours >= 13 and minutes > 0... NO. 
                            // If hours > 13 ... NO.

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
                        <p style={{ marginBottom: '16px', fontWeight: 'bold' }}>
                            {format(selectedDate, 'yyyy-MM-dd')} {pendingTime && format(pendingTime, 'HH:mm')} ({selectedHoles}洞)
                        </p>

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
                            </div>

                            {players.map((player, index) => (
                                <div key={index} style={{ marginBottom: '16px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                                    <h4 style={{ marginBottom: '8px', fontSize: '0.9rem', color: '#4b5563' }}>
                                        {index === 0 ? '主訂位人 (您)' : `組員 ${index + 1}`}
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="姓名"
                                            className="form-input"
                                            required={index === 0} // Only main booker required? Or all? Usually golf course needs all names.
                                            value={player.name}
                                            onChange={e => updatePlayer(index, 'name', e.target.value)}
                                        />
                                        <input
                                            type="tel"
                                            placeholder="手機 (09XX-XXX-XXX)"
                                            className="form-input"
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
