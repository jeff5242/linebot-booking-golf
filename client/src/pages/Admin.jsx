import React, { useEffect, useState } from 'react';
import { format, addMinutes } from 'date-fns';
import { supabase } from '../supabase';
import { Calendar } from '../components/Calendar';
import { generateDailySlots } from '../utils/golfLogic';

export function AdminDashboard() {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchBookings();
    }, [selectedDate]);

    const fetchBookings = async () => {
        setLoading(true);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const { data } = await supabase
            .from('bookings')
            .select('*, users(display_name, phone)')
            .eq('date', dateStr);
        setBookings(data || []);
        setLoading(false);
    };

    const handleResetDatabase = async () => {
        if (!window.confirm('警告：這將會刪除「所有」使用者與預約資料！此動作無法復原。確定要執行嗎？')) {
            return;
        }

        const prompt = window.prompt('為了確認，請輸入 "DELETE"');
        if (prompt !== 'DELETE') return;

        setLoading(true);
        try {
            // 1. Delete all bookings
            const { error: bookingError } = await supabase
                .from('bookings')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');

            if (bookingError) throw bookingError;

            // 2. Delete all users
            const { error: userError } = await supabase
                .from('users')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');

            if (userError) throw userError;

            alert('資料庫已清空');
            window.location.reload();
        } catch (err) {
            console.error('Reset failed:', err);
            alert('清空失敗 (可能權限不足): ' + err.message + '\n建議使用 Supabase SQL Editor 執行 reset_db_data.sql');
        } finally {
            setLoading(false);
        }
    };

    const slots = generateDailySlots(selectedDate);

    // Helper to find booking at a specific time
    const getBookingAt = (timeStr) => bookings.find(b => b.time === timeStr && b.status !== 'cancelled');

    // Helper to find if this slot is a "Second Half" of an 18-hole game
    const getLinkedBooking = (slotTime) => {
        const timeStr = format(slotTime, 'HH:mm:ss');
        // Check if there is a booking 150 mins ago that is 18 holes
        const startObj = bookings.find(b => {
            if (b.status === 'cancelled') return false;
            if (b.holes !== 18) return false;

            // Calculate expected turn time
            const [h, m] = b.time.split(':');
            const bookTime = new Date(selectedDate);
            bookTime.setHours(parseInt(h), parseInt(m), 0);
            const turnTime = addMinutes(bookTime, 150);

            return format(turnTime, 'HH:mm:ss') === timeStr;
        });
        return startObj;
    };

    const handleCheckIn = async (id) => {
        if (!confirm('確認報到?')) return;
        const { error } = await supabase
            .from('bookings')
            .update({
                status: 'checked_in',
                checkin_time: new Date().toISOString()
            })
            .eq('id', id);
        if (!error) fetchBookings();
    };

    const handleScheduleDeparture = async (id, currentTime) => {
        const newTime = prompt('請輸入排定出發時間 (HH:MM):', currentTime || '');
        if (!newTime) return;

        // Validate time format
        if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(newTime)) {
            alert('時間格式錯誤，請使用 HH:MM 格式');
            return;
        }

        const { error } = await supabase
            .from('bookings')
            .update({ scheduled_departure_time: newTime + ':00' })
            .eq('id', id);

        if (!error) fetchBookings();
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="container" style={{ maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className="title" style={{ marginBottom: 0 }}>出發台看板 (Starter)</h1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleResetDatabase}
                        style={{
                            backgroundColor: '#dc2626',
                            color: 'white',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '0.8rem'
                        }}
                    >
                        ⚠️ 清空資料庫
                    </button>
                    <button onClick={() => location.reload()} className="btn" style={{ width: 'auto', padding: '8px 16px' }}>↻</button>
                </div>
            </div>

            <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            <div className="card">
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                                <th style={{ padding: '12px' }}>預約時段</th>
                                <th style={{ padding: '12px' }}>狀態</th>
                                <th style={{ padding: '12px' }}>訂位人</th>
                                <th style={{ padding: '12px' }}>洞數</th>
                                <th style={{ padding: '12px' }}>人數</th>
                                <th style={{ padding: '12px' }}>預約時間</th>
                                <th style={{ padding: '12px' }}>報到時間</th>
                                <th style={{ padding: '12px' }}>排定出發</th>
                            </tr>
                        </thead>
                        <tbody>
                            {slots.map(slot => {
                                const timeStr = format(slot, 'HH:mm:ss');
                                const displayTime = format(slot, 'HH:mm');
                                const booking = getBookingAt(timeStr);
                                const linkedBooking = getLinkedBooking(slot);

                                // Row Style
                                let bg = 'transparent';
                                if (booking) bg = '#ecfdf5'; // Green-ish for booking
                                if (linkedBooking) bg = '#fef3c7'; // Yellow-ish for turn
                                if (booking?.status === 'checked_in') bg = '#dcfce7'; // Darker green

                                return (
                                    <tr key={timeStr} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: bg }}>
                                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                                            <div>{displayTime}</div>
                                            {booking && (
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'normal',
                                                    color: '#059669',
                                                    marginTop: '2px'
                                                }}>
                                                    {booking.users?.display_name} | {booking.holes === 18 ? '18(前9)' : '9洞'}
                                                </div>
                                            )}
                                            {linkedBooking && (
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'normal',
                                                    color: '#d97706',
                                                    marginTop: '2px'
                                                }}>
                                                    {linkedBooking.users?.display_name} | 18(後9)
                                                </div>
                                            )}
                                        </td>

                                        {/* Content */}
                                        {booking ? (
                                            <>
                                                <td style={{ padding: '12px' }}>
                                                    <span style={{
                                                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem',
                                                        backgroundColor: booking.status === 'checked_in' ? '#166534' : '#15803d',
                                                        color: 'white'
                                                    }}>
                                                        {booking.status === 'checked_in' ? '已報到' : '已預約'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px' }}>
                                                    {booking.users?.display_name}<br />
                                                    <span style={{ fontSize: '0.8rem', color: '#666' }}>{booking.users?.phone}</span>

                                                    {/* Show Team Members if available */}
                                                    {booking.players_info && Array.isArray(booking.players_info) && booking.players_info.length > 0 && (
                                                        <div style={{ marginTop: '4px', fontSize: '0.75rem', color: '#4b5563', borderTop: '1px dashed #ccc', paddingTop: '4px' }}>
                                                            {booking.players_info.map((p, idx) => (
                                                                p.name ? <div key={idx}>{idx + 1}. {p.name}</div> : null
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px' }}>{booking.holes} 洞</td>
                                                <td style={{ padding: '12px' }}>{booking.players_count} 人</td>

                                                {/* Time Tracking Columns */}
                                                <td style={{ padding: '12px', fontSize: '0.85rem' }}>
                                                    {booking.time.slice(0, 5)}
                                                </td>
                                                <td style={{ padding: '12px', fontSize: '0.85rem' }}>
                                                    {booking.checkin_time ? (
                                                        new Date(booking.checkin_time).toLocaleString('zh-TW', {
                                                            hour: '2-digit', minute: '2-digit'
                                                        })
                                                    ) : (
                                                        <button
                                                            onClick={() => handleCheckIn(booking.id)}
                                                            style={{
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                border: '1px solid #166534',
                                                                backgroundColor: 'white',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem'
                                                            }}>
                                                            報到
                                                        </button>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px', fontSize: '0.85rem' }}>
                                                    {booking.status === 'checked_in' ? (
                                                        <button
                                                            onClick={() => handleScheduleDeparture(booking.id, booking.scheduled_departure_time?.slice(0, 5) || booking.time.slice(0, 5))}
                                                            style={{
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                border: '1px solid #0369a1',
                                                                backgroundColor: 'white',
                                                                cursor: 'pointer',
                                                                fontSize: '0.8rem',
                                                                color: '#0369a1'
                                                            }}>
                                                            {booking.scheduled_departure_time?.slice(0, 5) || '排定'}
                                                        </button>
                                                    ) : '-'}
                                                </td>
                                            </>
                                        ) : linkedBooking ? (
                                            <>
                                                <td style={{ padding: '12px', color: '#d97706' }}>
                                                    ↻ 轉場 (來自 {linkedBooking.time.slice(0, 5)})
                                                </td>
                                                <td style={{ padding: '12px', opacity: 0.6 }}>
                                                    {linkedBooking.users?.display_name}
                                                </td>
                                                <td style={{ padding: '12px' }}>-</td>
                                                <td style={{ padding: '12px' }}>-</td>
                                                <td style={{ padding: '12px' }}>-</td>
                                                <td style={{ padding: '12px' }}>-</td>
                                                <td style={{ padding: '12px' }}>-</td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{ padding: '12px', color: '#9ca3af' }}>-</td>
                                                <td style={{ padding: '12px' }}></td>
                                                <td style={{ padding: '12px' }}></td>
                                                <td style={{ padding: '12px' }}></td>
                                                <td style={{ padding: '12px' }}></td>
                                                <td style={{ padding: '12px' }}></td>
                                                <td style={{ padding: '12px' }}></td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
