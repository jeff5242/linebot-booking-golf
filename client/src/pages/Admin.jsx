import React, { useEffect, useState, useRef } from 'react';
import { format, addMinutes } from 'date-fns';
import { supabase } from '../supabase';
import { Calendar } from '../components/Calendar';
import { generateDailySlots } from '../utils/golfLogic';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Sub-component: Starter Dashboard (The original functionality)
function StarterDashboard({ selectedDate, setSelectedDate, bookings, fetchBookings }) {
    const slots = generateDailySlots(selectedDate);
    const [showScanner, setShowScanner] = useState(false);

    // Logic for linking bookings (18 holes turn)
    const getBookingAt = (timeStr) => bookings.find(b => b.time === timeStr && b.status !== 'cancelled');
    const getLinkedBooking = (slotTime) => {
        const timeStr = format(slotTime, 'HH:mm:ss');
        const startObj = bookings.find(b => {
            if (b.status === 'cancelled') return false;
            if (b.holes !== 18) return false;
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
        const { error } = await supabase.from('bookings').update({ status: 'checked_in', checkin_time: new Date() }).eq('id', id);
        if (!error) fetchBookings();
    };

    const handleScheduleDeparture = async (id, currentTime) => {
        const newTime = prompt('輸入排定時間 (HH:MM):', currentTime);
        if (newTime && /^\d{2}:\d{2}$/.test(newTime)) {
            const { error } = await supabase.from('bookings').update({ scheduled_departure_time: newTime + ':00' }).eq('id', id);
            if (!error) fetchBookings();
        }
    };

    // Scanner Logic
    useEffect(() => {
        if (showScanner) {
            const scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );

            scanner.render(onScanSuccess, onScanFailure);

            async function onScanSuccess(decodedText) {
                // Handle scanned code
                scanner.clear();
                setShowScanner(false);

                try {
                    let phone = decodedText;
                    // Try parsing JSON if applicable
                    try {
                        const json = JSON.parse(decodedText);
                        if (json.phone) phone = json.phone;
                    } catch (e) {
                        // assume text is phone
                    }

                    // Perform server check-in
                    const dateStr = format(new Date(), 'yyyy-MM-dd'); // Check-in is always for TODAY

                    // Find user first
                    const { data: users } = await supabase.from('users').select('id, display_name').eq('phone', phone).limit(1);
                    if (!users || users.length === 0) {
                        alert('找不到此手機號碼之用戶: ' + phone);
                        return;
                    }
                    const user = users[0];

                    // Find booking for today
                    const { data: booking } = await supabase
                        .from('bookings')
                        .select('*')
                        .eq('user_id', user.id)
                        .eq('date', dateStr)
                        .neq('status', 'cancelled')
                        .limit(1)
                        .maybeSingle();

                    if (booking) {
                        if (booking.status === 'checked_in') {
                            alert(`用戶 ${user.display_name} 今日已報到過！`);
                        } else {
                            await supabase.from('bookings').update({ status: 'checked_in', checkin_time: new Date() }).eq('id', booking.id);
                            alert(`✅ 報到成功！\n用戶: ${user.display_name}\n時間: ${booking.time}`);
                            fetchBookings(); // Refresh UI
                        }
                    } else {
                        alert(`用戶 ${user.display_name} 今日 (${dateStr}) 無有效預約！`);
                    }

                } catch (err) {
                    console.error(err);
                    alert('掃描處理錯誤');
                }
            }

            function onScanFailure(error) {
                // handle scan failure, usually better to ignore and keep scanning.
                // console.warn(`Code scan error = ${error}`);
            }

            return () => {
                scanner.clear().catch(error => console.error("Failed to clear html5-qrcode scanner. ", error));
            };
        }
    }, [showScanner]);

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />

                <button
                    onClick={() => setShowScanner(true)}
                    style={{
                        padding: '10px 15px',
                        backgroundColor: '#3b82f6', color: 'white',
                        border: 'none', borderRadius: '6px', cursor: 'pointer',
                        fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px',
                        whiteSpace: 'nowrap', height: 'fit-content'
                    }}
                >
                    📷 掃碼報到
                </button>
            </div>

            {/* Scanner Modal */}
            {showScanner && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px', width: '90%', maxWidth: '500px' }}>
                        <h3 style={{ marginTop: 0 }}>掃描用戶 QR Code</h3>
                        <div id="reader" style={{ width: '100%' }}></div>
                        <button onClick={() => setShowScanner(false)} className="btn" style={{ marginTop: '15px', color: 'red', borderColor: 'red' }}>取消關閉</button>
                    </div>
                </div>
            )}

            <div className="card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={{ padding: '12px' }}>預約時段</th>
                            <th style={{ padding: '12px' }}>狀態</th>
                            <th style={{ padding: '12px' }}>訂位人</th>
                            <th style={{ padding: '12px' }}>洞數</th>
                            <th style={{ padding: '12px' }}>人數</th>
                            <th style={{ padding: '12px' }}>報到 / 出發</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slots.map(slot => {
                            const timeStr = format(slot, 'HH:mm:ss');
                            const displayTime = format(slot, 'HH:mm');
                            const booking = getBookingAt(timeStr);
                            const linkedBooking = getLinkedBooking(slot);
                            let bg = booking ? '#ecfdf5' : (linkedBooking ? '#fef3c7' : 'transparent');
                            if (booking?.status === 'checked_in') bg = '#dcfce7';

                            return (
                                <tr key={timeStr} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: bg }}>
                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{displayTime}</td>
                                    {booking ? (
                                        <>
                                            <td style={{ padding: '12px' }}>{booking.status === 'checked_in' ? '已報到' : '已預約'}</td>
                                            <td style={{ padding: '12px' }}>
                                                {booking.users?.display_name}<br />
                                                <small style={{ color: '#666' }}>{booking.users?.phone}</small>
                                            </td>
                                            <td style={{ padding: '12px' }}>{booking.holes}洞</td>
                                            <td style={{ padding: '12px' }}>{booking.players_count}人</td>
                                            <td style={{ padding: '12px' }}>
                                                {!booking.checkin_time ? (
                                                    <button onClick={() => handleCheckIn(booking.id)} style={{ marginRight: '5px' }}>報到</button>
                                                ) : (
                                                    <small>{format(new Date(booking.checkin_time), 'HH:mm')}</small>
                                                )}
                                                {booking.status === 'checked_in' && (
                                                    <button onClick={() => handleScheduleDeparture(booking.id, booking.scheduled_departure_time?.slice(0, 5))} style={{ marginLeft: '5px', color: 'blue' }}>
                                                        {booking.scheduled_departure_time?.slice(0, 5) || '排定'}
                                                    </button>
                                                )}
                                            </td>
                                        </>
                                    ) : linkedBooking ? (
                                        <td colSpan={5} style={{ padding: '12px', color: '#d97706' }}>轉場 (來自 {linkedBooking.time.slice(0, 5)}) - {linkedBooking.users?.display_name}</td>
                                    ) : (
                                        <td colSpan={5}></td>
                                    )}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Sub-component: User Management
function UserManagement() {
    const [users, setUsers] = useState([]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false });
        setUsers(data || []);
    };

    return (
        <div className="card animate-fade-in">
            <h2 className="title" style={{ fontSize: '1.2rem' }}>平台用戶管理 ({users.length})</h2>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                            <th style={{ padding: '10px' }}>名稱</th>
                            <th style={{ padding: '10px' }}>電話</th>
                            <th style={{ padding: '10px' }}>LINE ID</th>
                            <th style={{ padding: '10px' }}>註冊時間</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '10px' }}>{u.display_name || '-'}</td>
                                <td style={{ padding: '10px' }}>{u.phone}</td>
                                <td style={{ padding: '10px', fontSize: '0.8rem', color: '#666' }}>{u.line_user_id}</td>
                                <td style={{ padding: '10px', fontSize: '0.8rem' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Sub-component: Admin Management
function AdminManagement() {
    const [admins, setAdmins] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newAdmin, setNewAdmin] = useState({ name: '', username: '', password: '' });

    useEffect(() => {
        fetchAdmins();
    }, []);

    const fetchAdmins = async () => {
        const { data } = await supabase.from('admins').select('*').order('created_at', { ascending: false });
        setAdmins(data || []);
    };

    const handleAddAdmin = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('admins').insert([newAdmin]);
        if (error) {
            alert('新增失敗: ' + error.message);
        } else {
            alert('新增成功');
            setShowForm(false);
            setNewAdmin({ name: '', username: '', password: '' });
            fetchAdmins();
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('確定刪除此管理員？')) return;
        const { error } = await supabase.from('admins').delete().eq('id', id);
        if (!error) fetchAdmins();
        else alert('刪除失敗');
    };

    return (
        <div className="card animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <h2 className="title" style={{ fontSize: '1.2rem' }}>後台管理員 ({admins.length})</h2>
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowForm(!showForm)}>
                    {showForm ? '取消' : '+ 新增管理員'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleAddAdmin} style={{ marginBottom: '20px', padding: '15px', background: '#f9fafb', borderRadius: '8px' }}>
                    <div className="form-group">
                        <label>名稱</label>
                        <input className="form-input" required value={newAdmin.name} onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>帳號 (Email/手機)</label>
                        <input className="form-input" required value={newAdmin.username} onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>密碼</label>
                        <input className="form-input" required value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} />
                    </div>
                    <button className="btn btn-primary">確認新增</button>
                </form>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                            <th style={{ padding: '10px' }}>名稱</th>
                            <th style={{ padding: '10px' }}>帳號</th>
                            <th style={{ padding: '10px' }}>建立時間</th>
                            <th style={{ padding: '10px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {admins.map(a => (
                            <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '10px' }}>{a.name}</td>
                                <td style={{ padding: '10px' }}>{a.username}</td>
                                <td style={{ padding: '10px', fontSize: '0.8rem' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                                <td style={{ padding: '10px' }}>
                                    {a.username !== 'admin' && (
                                        <button onClick={() => handleDelete(a.id)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>刪除</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function AdminDashboard() {
    const [activeTab, setActiveTab] = useState('starter'); // starter, users, admins
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'starter') fetchBookings();
    }, [selectedDate, activeTab]);

    const fetchBookings = async () => {
        setLoading(true);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const { data } = await supabase.from('bookings').select('*, users(display_name, phone)').eq('date', dateStr);
        setBookings(data || []);
        setLoading(false);
    };

    const handleResetDatabase = async () => {
        if (!window.confirm('警告：刪除所有資料？')) return;
        const p = prompt('輸入 "DELETE"');
        if (p !== 'DELETE') return;

        await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('admins').delete().neq('username', 'admin'); // Keep default admin
        alert('Done'); window.location.reload();
    };

    const handleLogout = () => {
        if (!confirm('登出?')) return;
        sessionStorage.clear();
        window.location.href = '/admin/login';
    };

    return (
        <div className="container" style={{ maxWidth: '900px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 className="title" style={{ marginBottom: 0 }}>高爾夫後台系統</h1>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleResetDatabase} style={{ backgroundColor: '#fca5a5', border: 'none', padding: '5px 10px', borderRadius: '4px', color: '#7f1d1d', cursor: 'pointer', fontSize: '0.75rem' }}>清空 DB</button>
                    <button onClick={handleLogout} className="btn" style={{ width: 'auto', padding: '6px 12px', background: '#4b5563', color: 'white' }}>登出</button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb' }}>
                <button
                    onClick={() => setActiveTab('starter')}
                    style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'starter' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        fontWeight: activeTab === 'starter' ? 'bold' : 'normal',
                        cursor: 'pointer',
                        color: activeTab === 'starter' ? 'var(--primary-color)' : '#6b7280'
                    }}
                >
                    出發台看板
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'users' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        fontWeight: activeTab === 'users' ? 'bold' : 'normal',
                        cursor: 'pointer',
                        color: activeTab === 'users' ? 'var(--primary-color)' : '#6b7280'
                    }}
                >
                    用戶管理
                </button>
                <button
                    onClick={() => setActiveTab('admins')}
                    style={{
                        padding: '10px 20px',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'admins' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        fontWeight: activeTab === 'admins' ? 'bold' : 'normal',
                        cursor: 'pointer',
                        color: activeTab === 'admins' ? 'var(--primary-color)' : '#6b7280'
                    }}
                >
                    後台權限
                </button>
            </div>

            {/* Content */}
            {activeTab === 'starter' && (
                <StarterDashboard
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    bookings={bookings}
                    fetchBookings={fetchBookings}
                />
            )}

            {activeTab === 'users' && <UserManagement />}

            {activeTab === 'admins' && <AdminManagement />}
        </div>
    );
}
