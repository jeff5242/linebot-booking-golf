import React, { useEffect, useState, useRef } from 'react';
import { format, addMinutes, isAfter, parseISO, isBefore } from 'date-fns';
import { supabase } from '../supabase';
import { Calendar } from '../components/Calendar';
import { generateDailySlots } from '../utils/golfLogic';
import { Html5QrcodeScanner } from 'html5-qrcode';

// Sub-component: Check-in List (New Feature)
function CheckInList({ bookings, selectedDate }) {
    // Filter only checked-in bookings
    const list = bookings.filter(b => b.status === 'checked_in');

    // Sort by check-in time (latest first) or scheduled time?
    // Usually "First In, First Out" or based on Reserved Time. 
    // Let's sort by Reserved Time to see who should go out first.
    list.sort((a, b) => a.time.localeCompare(b.time));

    const getStatusIndicator = (booking) => {
        // Condition 1: Helper assigned departure time -> Green
        if (booking.scheduled_departure_time) {
            return { color: '#22c55e', text: '已排定', bg: '#dcfce7' }; // Green
        }

        // Construct Booking Date Object
        const [h, m] = booking.time.split(':');
        const bookTime = new Date(selectedDate);
        bookTime.setHours(h, m, 0);
        const now = new Date();

        // Condition 2: Overdue -> Red
        if (isAfter(now, bookTime)) {
            return { color: '#ef4444', text: '延誤中', bg: '#fee2e2' }; // Red
        }

        // Condition 3: Waiting -> Yellow
        return { color: '#eab308', text: '等待中', bg: '#fef9c3' }; // Yellow
    };

    return (
        <div className="card animate-fade-in">
            <h2 className="title">現場報到組別清單 ({list.length})</h2>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                            <th style={{ padding: '12px', minWidth: '60px' }}>狀態</th>
                            <th style={{ padding: '12px' }}>報到時間</th>
                            <th style={{ padding: '12px' }}>訂位人</th>
                            <th style={{ padding: '12px' }}>組員名單</th>
                            <th style={{ padding: '12px' }}>預約時間</th>
                            <th style={{ padding: '12px' }}>排定出發</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>目前尚無已報到的組別</td></tr>
                        ) : list.map(b => {
                            const status = getStatusIndicator(b);
                            const checkInTimeDisplay = b.checkin_time ? format(new Date(b.checkin_time), 'HH:mm') : '-';

                            return (
                                <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px' }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            fontWeight: 'bold', fontSize: '0.9rem', color: status.color
                                        }}>
                                            <div style={{
                                                width: '12px', height: '12px', borderRadius: '50%',
                                                backgroundColor: status.color,
                                                boxShadow: `0 0 6px ${status.color}`
                                            }} />
                                            {status.text}
                                        </div>
                                    </td>
                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{checkInTimeDisplay}</td>
                                    <td style={{ padding: '12px' }}>
                                        {b.users?.display_name}<br />
                                        <span style={{ fontSize: '0.8rem', color: '#666' }}>{b.users?.phone}</span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {b.players_info?.map((p, i) => (
                                            p.name && <span key={i} style={{
                                                display: 'inline-block',
                                                background: '#f3f4f6',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.8rem',
                                                marginRight: '4px',
                                                marginBottom: '2px'
                                            }}>
                                                {p.name}
                                            </span>
                                        ))}
                                    </td>
                                    <td style={{ padding: '12px', fontSize: '1.1rem', fontWeight: 'bold' }}>{b.time.slice(0, 5)}</td>
                                    <td style={{ padding: '12px' }}>
                                        {b.scheduled_departure_time ? (
                                            <span style={{
                                                color: '#15803d', fontWeight: 'bold',
                                                background: '#dcfce7', padding: '4px 8px', borderRadius: '4px'
                                            }}>
                                                {b.scheduled_departure_time.slice(0, 5)}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#9ca3af' }}>-</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Sub-component: Scanner Tab
function QRScannerTab() {
    const [scanResult, setScanResult] = useState(null);
    const [lastScanned, setLastScanned] = useState('');

    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );

        scanner.render(onScanSuccess, onScanFailure);

        async function onScanSuccess(decodedText) {
            if (decodedText === lastScanned) return; // Prevent double scan
            setLastScanned(decodedText);

            try {
                let phone = decodedText;
                try {
                    const json = JSON.parse(decodedText);
                    if (json.phone) phone = json.phone;
                } catch (e) { }

                // Perform server check-in
                const dateStr = format(new Date(), 'yyyy-MM-dd');

                // Find user
                const { data: users } = await supabase.from('users').select('id, display_name').eq('phone', phone).limit(1);
                if (!users || users.length === 0) {
                    setScanResult({ error: `找不到用戶 (電話: ${phone})` });
                    return;
                }
                const user = users[0];

                // Find booking
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
                        setScanResult({
                            warning: '已重複報到',
                            user: user.display_name,
                            time: booking.time,
                            msg: '此用戶今日已完成報到'
                        });
                    } else {
                        await supabase.from('bookings').update({ status: 'checked_in', checkin_time: new Date() }).eq('id', booking.id);
                        setScanResult({
                            success: true,
                            user: user.display_name,
                            time: booking.time,
                            msg: '報到成功！'
                        });
                    }
                } else {
                    setScanResult({
                        error: '無今日預約',
                        user: user.display_name,
                        msg: `該用戶今日 (${dateStr}) 無有效預約`
                    });
                }

                // Clear after 3 seconds so they can scan next
                setTimeout(() => {
                    setScanResult(null);
                    setLastScanned('');
                }, 5000);

            } catch (err) {
                console.error(err);
                setScanResult({ error: '掃描處理錯誤' });
            }
        }

        function onScanFailure(error) { }

        return () => {
            scanner.clear().catch(e => console.error(e));
        };
    }, []);

    return (
        <div className="card animate-fade-in" style={{ textAlign: 'center', minHeight: '400px' }}>
            <h2 className="title">QR Code 掃碼報到</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>請將用戶手機 QR Code 對準下方鏡頭</p>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div id="reader" style={{ width: '100%', maxWidth: '500px' }}></div>
            </div>

            {scanResult && (
                <div className="animate-fade-in" style={{
                    marginTop: '20px', padding: '20px', borderRadius: '12px',
                    backgroundColor: scanResult.success ? '#dcfce7' : (scanResult.change ? '#fef3c7' : '#fee2e2'),
                    border: `2px solid ${scanResult.success ? '#166534' : (scanResult.warning ? '#d97706' : '#991b1b')}`
                }}>
                    {scanResult.user && <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{scanResult.user}</h3>}
                    <p style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: '10px 0' }}>
                        {scanResult.msg || scanResult.error || scanResult.warning}
                    </p>
                    {scanResult.time && <p>預約時間: {scanResult.time.slice(0, 5)}</p>}
                </div>
            )}
        </div>
    );
}

// Sub-component: Starter Dashboard
function StarterDashboard({ selectedDate, setSelectedDate, bookings, fetchBookings }) {
    const slots = generateDailySlots(selectedDate);

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

    return (
        <div>
            <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />
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
    const [activeTab, setActiveTab] = useState('starter'); // starter, scan, checkin_list, users, admins
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Fetch bookings whenever date changes OR we are in a tab that displays bookings
        if (activeTab === 'starter' || activeTab === 'checkin_list') fetchBookings();
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
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', overflowX: 'auto' }}>
                <button
                    onClick={() => setActiveTab('starter')}
                    style={{
                        padding: '10px 16px',
                        whiteSpace: 'nowrap',
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
                    onClick={() => setActiveTab('scan')}
                    style={{
                        padding: '10px 16px',
                        whiteSpace: 'nowrap',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'scan' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        fontWeight: activeTab === 'scan' ? 'bold' : 'normal',
                        cursor: 'pointer',
                        color: activeTab === 'scan' ? 'var(--primary-color)' : '#6b7280',
                        display: 'flex', alignItems: 'center', gap: '5px'
                    }}
                >
                    📷 掃碼報到
                </button>
                <button
                    onClick={() => setActiveTab('checkin_list')}
                    style={{
                        padding: '10px 16px',
                        whiteSpace: 'nowrap',
                        border: 'none',
                        background: 'none',
                        borderBottom: activeTab === 'checkin_list' ? '3px solid var(--primary-color)' : '3px solid transparent',
                        fontWeight: activeTab === 'checkin_list' ? 'bold' : 'normal',
                        cursor: 'pointer',
                        color: activeTab === 'checkin_list' ? 'var(--primary-color)' : '#6b7280'
                    }}
                >
                    📋 報到清單
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '10px 16px',
                        whiteSpace: 'nowrap',
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
                        padding: '10px 16px',
                        whiteSpace: 'nowrap',
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

            {activeTab === 'scan' && <QRScannerTab />}

            {activeTab === 'checkin_list' && (
                <CheckInList
                    bookings={bookings}
                    selectedDate={selectedDate}
                />
            )}

            {activeTab === 'users' && <UserManagement />}

            {activeTab === 'admins' && <AdminManagement />}
        </div>
    );
}
