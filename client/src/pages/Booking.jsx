import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar } from '../components/Calendar';
import { generateDailySlots, isSlotAvailable, golferTypeToTier } from '../utils/golfLogic';
import { supabase } from '../supabase';
import { useNavigate } from 'react-router-dom';

export function Booking() {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedHoles, setSelectedHoles] = useState(18);
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [userName, setUserName] = useState('');
    const [settings, setSettings] = useState(null); // System settings

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

    // Error/Success Message Modal
    const [showMessageModal, setShowMessageModal] = useState(false);
    const [messageContent, setMessageContent] = useState({ type: 'error', message: '' });

    // Waitlist Modal State
    const [showWaitlistModal, setShowWaitlistModal] = useState(false);
    const [waitlistPeakType, setWaitlistPeakType] = useState(null); // 'peak_a' or 'peak_b'

    // Service Options
    const [needsCart, setNeedsCart] = useState(true);
    const [needsCaddie, setNeedsCaddie] = useState(true);

    // Rate Config & User Tier
    const [rateConfig, setRateConfig] = useState(null);
    const [userGolferType, setUserGolferType] = useState('來賓');

    // Load Main User Info and Settings
    useEffect(() => {
        loadMainUser();
        fetchSettings();
        fetchRateConfig();
        // Load user name for header
        const name = localStorage.getItem('golf_user_name');
        if (name) setUserName(name);
    }, []);

    const fetchSettings = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/settings`);
            const data = await res.json();
            if (res.ok) setSettings(data);
        } catch (err) {
            console.error('Failed to load settings:', err);
            // Fallback to defaults
            setSettings({
                interval: 10,
                turn_time: 120,
                peak_a: { start: '05:30', end: '07:30' },
                peak_b: { start: '11:30', end: '12:30' }
            });
        }
    };

    const fetchRateConfig = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/rates/active`);
            const data = await res.json();
            if (res.ok) setRateConfig(data);
        } catch (err) {
            console.error('Failed to load rate config:', err);
        }
    };

    const loadMainUser = async () => {
        try {
            const phone = localStorage.getItem('golf_user_phone');
            const name = localStorage.getItem('golf_user_name');

            if (phone) {
                // Try to get from database first - handle multiple records
                const { data: users, error } = await supabase
                    .from('users')
                    .select('display_name, phone, golfer_type')
                    .eq('phone', phone)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (users && users.length > 0 && !error) {
                    const data = users[0];
                    if (data.golfer_type) setUserGolferType(data.golfer_type);
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
        if (!pendingTime || loading) return;
        setLoading(true);

        // Validate main booker phone
        if (!validatePhone(players[0].phone)) {
            setLoading(false);
            setMessageContent({ type: 'error', message: '請輸入正確的台灣手機號碼格式 (09開頭，共10碼)' });
            setShowMessageModal(true);
            return;
        }

        // 驗證所有選定人數的人名都必須填寫
        for (let i = 0; i < playersCount; i++) {
            if (!players[i].name || players[i].name.trim() === '') {
                setMessageContent({
                    type: 'error',
                    message: `請填寫第 ${i + 1} 位球友的姓名`
                });
                setShowMessageModal(true);
                setLoading(false);
                return;
            }
        }

        try {
            const userPhone = localStorage.getItem('golf_user_phone');

            if (!userPhone) {
                setMessageContent({ type: 'error', message: '找不到使用者資料，請重新註冊' });
                setShowMessageModal(true);
                setTimeout(() => { navigate('/register'); }, 2000);
                return;
            }

            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: userPhone,
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    time: format(pendingTime, 'HH:mm:ss'),
                    holes: selectedHoles,
                    players_count: playersCount,
                    players_info: players.slice(0, playersCount),
                    needs_cart: needsCart,
                    needs_caddie: needsCaddie
                })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || '預約失敗');

            // 預約成功，顯示成功訊息
            setShowPlayerModal(false);
            setMessageContent({
                type: 'success',
                message: `預約成功！\n日期：${format(selectedDate, 'yyyy-MM-dd')}\n時間：${format(pendingTime, 'HH:mm')}\n人數：${playersCount}人\n請於現場付款`
            });
            setShowMessageModal(true);

            // 重新載入預約資料
            fetchBookings();

        } catch (e) {
            console.error('Booking error:', e);
            setMessageContent({ type: 'error', message: '預約失敗: ' + e.message });
            setShowMessageModal(true);
        } finally {
            setLoading(false);
        }
    };

    // 候補預約提交
    const submitWaitlist = async (e) => {
        e.preventDefault();

        // 驗證第一位球友的人名和電話
        if (!players[0].name || players[0].name.trim() === '') {
            setMessageContent({ type: 'error', message: '請填寫主要訂位人姓名' });
            setShowMessageModal(true);
            return;
        }

        if (!validatePhone(players[0].phone)) {
            setMessageContent({ type: 'error', message: '請輸入正確的台灣手機號碼格式 (09開頭，共10碼)' });
            setShowMessageModal(true);
            return;
        }

        try {
            setLoading(true);
            const userPhone = localStorage.getItem('golf_user_phone');

            if (!userPhone) {
                setMessageContent({ type: 'error', message: '找不到使用者資料，請重新註冊' });
                setShowMessageModal(true);
                return;
            }

            const apiUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${apiUrl}/api/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: userPhone,
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    players_count: playersCount,
                    peak_type: waitlistPeakType
                })
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.error || '加入候補失敗');
            }

            // 成功加入候補
            setShowWaitlistModal(false);
            setMessageContent({
                type: 'success',
                message: `已成功加入候補清單！\n日期：${format(selectedDate, 'yyyy-MM-dd')}\n時段：${waitlistPeakType === 'peak_a' ? 'Peak A (早場)' : 'Peak B (午場)'}\n人數：${playersCount}人\n\n系統會依順序通知，請保持電話暢通`
            });
            setShowMessageModal(true);

        } catch (e) {
            console.error('Waitlist error:', e);
            setMessageContent({ type: 'error', message: '加入候補失敗: ' + e.message });
            setShowMessageModal(true);
        } finally {
            setLoading(false);
        }
    };

    // 判斷是否為假日（週六日）
    const isHoliday = (date) => {
        const day = date.getDay();
        return day === 0 || day === 6;
    };

    // 使用費率表計算費用（以每人為單位）
    const calculateDynamicPrice = () => {
        if (!rateConfig) return null;

        const tier = golferTypeToTier(userGolferType);
        const holiday = isHoliday(selectedDate);
        const dayType = holiday ? 'holiday' : 'weekday';
        const holesKey = String(selectedHoles);

        try {
            // 果嶺費（每人）
            const greenFee = rateConfig.green_fees[tier][holesKey][dayType];

            // 清潔費（每人）
            const cleaningFee = rateConfig.base_fees.cleaning[holesKey] || 0;

            // 球車費（每人）
            const cartFee = needsCart ? (rateConfig.base_fees.cart_per_person[holesKey] || 0) : 0;

            // 桿弟費（每人，依人數對應配比）
            let caddyFee = 0;
            if (needsCaddie) {
                const ratio = `1:${playersCount}`;
                caddyFee = rateConfig.caddy_fees[ratio]?.[holesKey] || 0;
            }

            // 小計（每人）
            const subtotalPerPerson = greenFee + cleaningFee + cartFee + caddyFee;

            // 娛樂稅 = (果嶺費 + 球車費) * 5%（每人）
            const taxRate = rateConfig.tax_config?.entertainment_tax || 0.05;
            const entertainmentTaxPerPerson = Math.round((greenFee + cartFee) * taxRate);

            // 每人合計
            const totalPerPerson = subtotalPerPerson + entertainmentTaxPerPerson;

            // 整組預估總計
            const groupTotal = totalPerPerson * playersCount;

            return {
                breakdown: {
                    greenFee,
                    cleaningFee,
                    cartFee: needsCart ? cartFee : null,
                    caddyFee: needsCaddie ? caddyFee : null,
                    subtotalPerPerson,
                    entertainmentTaxPerPerson,
                    totalPerPerson,
                    taxRate
                },
                groupTotal,
                playersCount,
                tierName: userGolferType,
                isHoliday: holiday
            };
        } catch (err) {
            console.error('費率計算錯誤:', err);
            return null;
        }
    };

    // Helper: Check if a time is within a peak period
    const isInPeak = (slot, peakConfig) => {
        if (!peakConfig?.start || !peakConfig?.end) return false;
        const timeStr = format(slot, 'HH:mm');
        return timeStr >= peakConfig.start && timeStr <= peakConfig.end;
    };

    // Helper: Check if a slot is in Peak A or Peak B
    const getPeakType = (slot) => {
        if (isInPeak(slot, settings?.peak_a)) return 'peak_a';
        if (isInPeak(slot, settings?.peak_b)) return 'peak_b';
        return null;
    };

    // Count how many bookings are in each peak period
    const countPeakBookings = () => {
        let peakACount = 0;
        let peakBCount = 0;

        bookings.forEach(booking => {
            if (booking.status === 'cancelled') return;
            // Parse booking time and check if it's in peak
            const bookingDate = new Date(selectedDate);
            const [hours, minutes] = booking.time.split(':');
            bookingDate.setHours(parseInt(hours), parseInt(minutes), 0);

            if (isInPeak(bookingDate, settings?.peak_a)) peakACount++;
            if (isInPeak(bookingDate, settings?.peak_b)) peakBCount++;
        });

        return { peakACount, peakBCount };
    };

    if (!settings) {
        return <div className="container"><p>載入中...</p></div>;
    }

    const slots = generateDailySlots(selectedDate, settings);
    const { peakACount, peakBCount } = countPeakBookings();

    // Check if peaks are full (考慮保留名額)
    // 可用名額 = 最大組數 - 保留組數
    const peakAAvailable = (settings.peak_a?.max_groups || 0) - (settings.peak_a?.reserved || 0);
    const peakBAvailable = (settings.peak_b?.max_groups || 0) - (settings.peak_b?.reserved || 0);

    const isPeakAFull = peakACount >= peakAAvailable;
    const isPeakBFull = peakBCount >= peakBAvailable;
    const areBothPeaksFull = isPeakAFull && isPeakBFull;

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
                    <button
                        onClick={() => navigate('/member')}
                        style={{
                            fontSize: '0.85rem',
                            color: '#555',
                            padding: '4px 12px',
                            border: '1px solid #ddd',
                            borderRadius: '16px',
                            background: 'white',
                            cursor: 'pointer'
                        }}>
                        個人中心
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
                            const peakType = getPeakType(slot);
                            const isAvailable = isSlotAvailable(slot, bookings, selectedHoles, settings);
                            const timeLabel = format(slot, 'HH:mm');

                            // Peak logic: hide non-peak slots if both peaks are not full
                            if (!peakType && !areBothPeaksFull) {
                                return null; // Don't show non-peak slots
                            }

                            let isTooLateFor18Holes = false;
                            if (selectedHoles === 18) {
                                const h = slot.getHours();
                                const m = slot.getMinutes();
                                const turnTime = settings?.turn_time || 120;
                                // Calculate cutoff: END_HOUR:END_MINUTE - turnTime
                                // 15:30 - 120min = 13:30
                                if (h > 13 || (h === 13 && m > 30)) {
                                    isTooLateFor18Holes = true;
                                }
                            }

                            const isDisabled = !isAvailable || isTooLateFor18Holes;

                            // Determine if this is a peak slot that's full
                            const isPeakSlotFull = (peakType === 'peak_a' && isPeakAFull) || (peakType === 'peak_b' && isPeakBFull);

                            return (
                                <button
                                    key={timeLabel}
                                    disabled={isDisabled}
                                    onClick={() => handleBook(slot)}
                                    style={{
                                        padding: '10px 4px',
                                        borderRadius: '8px',
                                        border: peakType ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                                        backgroundColor: isDisabled ? '#f3f4f6' : (peakType ? '#fffbeb' : 'white'),
                                        color: isDisabled ? '#9ca3af' : (peakType ? '#d97706' : 'var(--primary-color)'),
                                        fontWeight: '600',
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        boxShadow: isDisabled ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                                        position: 'relative'
                                    }}
                                >
                                    {timeLabel}
                                    {peakType && (
                                        <span style={{
                                            position: 'absolute',
                                            top: '2px',
                                            right: '2px',
                                            fontSize: '0.6rem',
                                            backgroundColor: '#f59e0b',
                                            color: 'white',
                                            padding: '1px 3px',
                                            borderRadius: '3px'
                                        }}>
                                            {peakType === 'peak_a' ? 'A' : 'B'}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Waitlist Buttons */}
            {(isPeakAFull || isPeakBFull) && (
                <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', color: '#92400e', fontSize: '0.9rem', fontWeight: 'bold' }}>⏰ 尖峰時段已滿 - 加入候補</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {isPeakAFull && (
                            <button
                                onClick={() => {
                                    setWaitlistPeakType('peak_a');
                                    setShowWaitlistModal(true);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                候補 Peak A (早場)
                            </button>
                        )}
                        {isPeakBFull && (
                            <button
                                onClick={() => {
                                    setWaitlistPeakType('peak_b');
                                    setShowWaitlistModal(true);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    backgroundColor: '#f97316',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                候補 Peak B (午場)
                            </button>
                        )}
                    </div>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#78350f' }}>當有人取消預約時，系統會自動通知您</p>
                </div>
            )}

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
                                const pricing = calculateDynamicPrice();
                                if (!pricing) {
                                    return <p style={{ fontSize: '0.85rem', color: '#999' }}>費率載入中...</p>;
                                }
                                return (
                                    <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                        <div style={{ marginBottom: '6px', fontSize: '0.8rem', color: '#94a3b8' }}>
                                            {pricing.tierName} / {pricing.isHoliday ? '假日' : '平日'} / 每人
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>果嶺費</span>
                                            <span>${pricing.breakdown.greenFee}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>清潔費</span>
                                            <span>${pricing.breakdown.cleaningFee}</span>
                                        </div>
                                        {pricing.breakdown.cartFee != null && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span>球車費</span>
                                                <span>${pricing.breakdown.cartFee}</span>
                                            </div>
                                        )}
                                        {pricing.breakdown.caddyFee != null && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span>桿弟費 (1:{pricing.playersCount})</span>
                                                <span>${pricing.breakdown.caddyFee}</span>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span>娛樂稅 ({Math.round(pricing.breakdown.taxRate * 100)}%)</span>
                                            <span>${pricing.breakdown.entertainmentTaxPerPerson}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', paddingTop: '4px', borderTop: '1px dashed #e2e8f0', fontWeight: '600', color: '#334155' }}>
                                            <span>每人小計</span>
                                            <span>${pricing.breakdown.totalPerPerson}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #cbd5e1', color: '#1e293b', fontWeight: 'bold', fontSize: '1rem' }}>
                                            <span>預計總計金額 ({pricing.playersCount}人)</span>
                                            <span style={{ color: 'var(--primary-color)' }}>${pricing.groupTotal}</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <form onSubmit={confirmBooking} noValidate>
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

                            {playersCount < 4 && (
                                <div style={{ marginBottom: '12px', padding: '10px 12px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e', lineHeight: '1.4' }}>
                                        未滿 4 人之組別，球場將視當日情況安排併組，送出預約即表示同意接受併組安排。
                                    </p>
                                </div>
                            )}

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
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? '處理中...' : '確定預約'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Waitlist Modal */}
            {showWaitlistModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    animation: 'fade-in 0.3s ease-in-out'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: '2rem',
                        width: '90%',
                        maxWidth: '500px',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--primary-color)' }}>
                            🎯 加入候補清單
                        </h3>

                        <div style={{
                            padding: '1rem',
                            backgroundColor: '#fef3c7',
                            borderRadius: '8px',
                            marginBottom: '1.5rem',
                            border: '1px solid #fbbf24'
                        }}>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#92400e' }}>
                                <strong>{waitlistPeakType === 'peak_a' ? 'Peak A (早場)' : 'Peak B (午場)'}</strong> 時段已滿
                            </p>
                            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#92400e' }}>
                                加入候補後，系統會依順序通知有空位時，請保持電話暢通
                            </p>
                        </div>

                        <form onSubmit={submitWaitlist} noValidate>
                            {/* 人數選擇 */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="form-label" style={{ fontWeight: 'bold' }}>選擇人數</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {[1, 2, 3, 4].map(num => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => setPlayersCount(num)}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                borderRadius: '6px',
                                                border: playersCount === num ? '2px solid var(--primary-color)' : '1px solid #d1d5db',
                                                backgroundColor: playersCount === num ? 'var(--primary-light)' : 'white',
                                                cursor: 'pointer',
                                                fontWeight: playersCount === num ? 'bold' : 'normal'
                                            }}
                                        >
                                            {num}人
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 主要訂位人資訊 */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label className="form-label" style={{ fontWeight: 'bold' }}>主要訂位人</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="姓名"
                                    value={players[0].name}
                                    onChange={(e) => updatePlayer(0, 'name', e.target.value)}
                                    style={{ marginBottom: '0.5rem' }}
                                />
                                <input
                                    type="tel"
                                    className="form-input"
                                    placeholder="手機號碼 (09xxxxxxxx)"
                                    value={players[0].phone}
                                    onChange={(e) => updatePlayer(0, 'phone', e.target.value)}
                                />
                            </div>

                            {/* 按鈕 */}
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setShowWaitlistModal(false)}
                                    style={{ backgroundColor: '#e5e7eb', color: '#374151' }}
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? '處理中...' : '確定加入候補'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Message Modal (Error/Success) */}
            {showMessageModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2000,
                    animation: 'fade-in 0.3s ease-in-out'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        padding: '30px',
                        maxWidth: '400px',
                        width: '90%',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                        animation: 'slide-up 0.3s ease-out'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                fontSize: '48px',
                                marginBottom: '20px'
                            }}>
                                {messageContent.type === 'error' ? '⚠️' : '✅'}
                            </div>
                            <h2 style={{
                                fontSize: '1.5rem',
                                fontWeight: 'bold',
                                marginBottom: '10px',
                                color: messageContent.type === 'error' ? '#dc2626' : '#16a34a'
                            }}>
                                {messageContent.type === 'error' ? '錯誤' : '成功'}
                            </h2>
                            <p style={{
                                color: '#666',
                                marginBottom: '30px',
                                fontSize: '0.95rem',
                                lineHeight: '1.5'
                            }}>
                                {messageContent.message}
                            </p>
                            <button
                                onClick={() => setShowMessageModal(false)}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    backgroundColor: messageContent.type === 'error' ? '#dc2626' : '#16a34a',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                我知道了
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
