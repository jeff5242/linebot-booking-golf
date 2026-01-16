import React, { useEffect, useState, useRef } from 'react';
import { format, addMinutes, isAfter, parseISO, isBefore } from 'date-fns';
import { supabase } from '../supabase';
import { Calendar } from '../components/Calendar';
import { generateDailySlots } from '../utils/golfLogic';
import { Html5QrcodeScanner } from 'html5-qrcode';

// ... (DepartureList, CheckInList components remain unchanged)
// Sub-component: Departure List (Existing)
function DepartureList({ bookings, selectedDate }) {
    // 1. Filter bookings that are checked-in AND have a scheduled departure time
    const list = bookings.filter(b => b.status === 'checked_in' && b.scheduled_departure_time);

    // 2. Sort by scheduled departure time
    list.sort((a, b) => a.scheduled_departure_time.localeCompare(b.scheduled_departure_time));

    const now = new Date();
    // Assuming scheduled_departure_time is HH:MM:SS, we need to compare with today's time
    // We construct a full Date object for comparison
    const getDepartureDate = (timeStr) => {
        const [h, m] = timeStr.split(':');
        const d = new Date(selectedDate);
        d.setHours(h, m, 0);
        return d;
    };

    return (
        <div className="card animate-fade-in">
            <h2 className="title">出發清單 ({list.length})</h2>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                            <th style={{ padding: '12px' }}>排定出發</th>
                            <th style={{ padding: '12px' }}>訂位人</th>
                            <th style={{ padding: '12px' }}>組員名單</th>
                            <th style={{ padding: '12px' }}>狀態</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.length === 0 ? (
                            <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#888' }}>尚無已排定出發的組別</td></tr>
                        ) : list.map(b => {
                            const departureDate = getDepartureDate(b.scheduled_departure_time);
                            const hasDeparted = isBefore(departureDate, now);

                            // Style Logic
                            const rowStyle = hasDeparted ? {
                                backgroundColor: '#f3f4f6', // Gray
                                color: '#9ca3af'
                            } : {
                                backgroundColor: '#ecfdf5', // Light Green
                                color: '#065f46'
                            };

                            return (
                                <tr key={b.id} style={{ borderBottom: '1px solid #e5e7eb', ...rowStyle }}>
                                    <td style={{ padding: '12px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                                        {b.scheduled_departure_time.slice(0, 5)}
                                    </td>
                                    <td style={{ padding: '12px', fontWeight: hasDeparted ? 'normal' : 'bold' }}>
                                        {b.users?.display_name}<br />
                                        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{b.users?.phone}</span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {b.players_info?.map((p, i) => (
                                            p.name && <span key={i} style={{
                                                display: 'inline-block',
                                                background: hasDeparted ? '#e5e7eb' : 'white',
                                                border: hasDeparted ? '1px solid #d1d5db' : '1px solid #a7f3d0',
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
                                    <td style={{ padding: '12px' }}>
                                        {hasDeparted ? (
                                            <span style={{
                                                padding: '4px 8px', borderRadius: '12px',
                                                background: '#d1d5db', color: '#4b5563', fontSize: '0.8rem'
                                            }}>已出發</span>
                                        ) : (
                                            <span style={{
                                                padding: '4px 8px', borderRadius: '12px',
                                                background: '#10b981', color: 'white', fontSize: '0.8rem', fontWeight: 'bold'
                                            }}>準備中</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#666', textAlign: 'right' }}>
                * 灰色代表時間已過的組別，綠色代表即將出發的組別
            </div>
        </div>
    );
}

// Sub-component: Check-in List (Existing)
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

// Sub-component: Scanner Tab (Updated for Voucher Redemption)
function QRScannerTab() {
    const [scanResult, setScanResult] = useState(null);
    const [userVouchers, setUserVouchers] = useState([]);
    const [lastScanned, setLastScanned] = useState('');
    const [scannerPaused, setScannerPaused] = useState(false);

    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );

        scanner.render(onScanSuccess, onScanFailure);

        async function onScanSuccess(decodedText) {
            if (decodedText === lastScanned || scannerPaused) return; // Prevent double scan
            setLastScanned(decodedText);
            setScannerPaused(true); // Pause effectively by state logic (though scanner keeps running, we ignore result)

            try {
                let phone = decodedText;
                try {
                    const json = JSON.parse(decodedText);
                    if (json.phone) phone = json.phone;
                } catch (e) { }

                // Filter user
                const { data: users } = await supabase.from('users').select('id, display_name').eq('phone', phone).limit(1);

                if (!users || users.length === 0) {
                    setScanResult({ error: `找不到用戶 (電話: ${phone})` });
                    setUserVouchers([]);
                    setTimeout(() => resetScanner(), 3000);
                    return;
                }
                const user = users[0];

                // 1. Handle Booking Check-in
                const dateStr = format(new Date(), 'yyyy-MM-dd');
                const { data: booking } = await supabase
                    .from('bookings')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('date', dateStr)
                    .neq('status', 'cancelled')
                    .limit(1)
                    .maybeSingle();

                let bookingMsg = '';
                let success = false;

                if (booking) {
                    if (booking.status === 'checked_in') {
                        bookingMsg = '已重複報到 (今日已完成)';
                        success = true; // Still consider it a successful "identification"
                    } else {
                        await supabase.from('bookings').update({ status: 'checked_in', checkin_time: new Date() }).eq('id', booking.id);
                        bookingMsg = '報到成功！';
                        success = true;
                    }
                } else {
                    bookingMsg = `今日 (${dateStr}) 無預約`;
                }

                // 2. Fetch Active Vouchers (For Redemption)
                const { data: vouchers } = await supabase
                    .from('vouchers')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .gt('valid_until', new Date().toISOString()) // Filter out expired ones just in case
                    .order('valid_until', { ascending: true });

                setScanResult({
                    success: success,
                    user: user.display_name,
                    bookingMsg: bookingMsg,
                    hasBooking: !!booking,
                    bookingTime: booking?.time
                });
                setUserVouchers(vouchers || []);

                // If no vouchers and no booking, auto reset faster. 
                // If there ARE vouchers, we keep the screen so admin can redeem.
                if ((!vouchers || vouchers.length === 0)) {
                    setTimeout(() => resetScanner(), 5000);
                }

            } catch (err) {
                console.error(err);
                setScanResult({ error: '掃描處理錯誤' });
                setTimeout(() => resetScanner(), 3000);
            }
        }

        function onScanFailure(error) { }

        const resetScanner = () => {
            setScanResult(null);
            setUserVouchers([]);
            setLastScanned('');
            setScannerPaused(false);
        };

        return () => {
            scanner.clear().catch(e => console.error(e));
        };
    }, [scannerPaused, lastScanned]); // Dependencies adjusted

    // Handle Voucher Redemption
    const handleRedeemVoucher = async (voucher) => {
        if (!confirm(`確定要核銷此票券嗎？\n${voucher.product_name} (${voucher.code})`)) return;

        try {
            // 1. Update Voucher
            const { error } = await supabase.from('vouchers')
                .update({ status: 'redeemed', redeemed_at: new Date() })
                .eq('id', voucher.id);

            if (error) throw error;

            // 2. Add Log
            await supabase.from('voucher_logs').insert([{
                voucher_id: voucher.id,
                action: 'redeemed',
                memo: '現場掃碼核銷',
                operator_name: 'Admin'
            }]);

            alert('核銷成功！');

            // 3. Remove from local list
            setUserVouchers(prev => prev.filter(v => v.id !== voucher.id));

        } catch (e) {
            alert('核銷失敗: ' + e.message);
        }
    };

    const handleResetScanner = () => {
        setScanResult(null);
        setUserVouchers([]);
        setLastScanned('');
        setScannerPaused(false);
    }

    return (
        <div className="card animate-fade-in" style={{ textAlign: 'center', minHeight: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className="title">QR Code 掃碼 (報到/核銷)</h2>
                {scanResult && <button onClick={handleResetScanner} className="btn" style={{ background: '#6b7280', color: 'white', width: 'auto', padding: '5px 15px' }}>繼續掃描下一位</button>}
            </div>

            <p style={{ color: '#666', marginBottom: '20px' }}>請將用戶手機 QR Code 對準下方鏡頭</p>

            {!scanResult && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div id="reader" style={{ width: '100%', maxWidth: '500px' }}></div>
                </div>
            )}

            {scanResult && (
                <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto' }}>
                    {/* Identity & Check-in Result */}
                    <div className="animate-fade-in" style={{
                        marginTop: '10px', padding: '20px', borderRadius: '12px',
                        backgroundColor: scanResult.success || scanResult.hasBooking ? '#dcfce7' : '#fee2e2',
                        border: `2px solid ${scanResult.success || scanResult.hasBooking ? '#166534' : '#991b1b'}`,
                        textAlign: 'center'
                    }}>
                        {scanResult.user && <h3 style={{ margin: 0, fontSize: '1.8rem' }}>{scanResult.user}</h3>}
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', margin: '10px 0', color: scanResult.hasBooking ? '#166534' : '#991b1b' }}>
                            {scanResult.bookingMsg || scanResult.error}
                        </div>
                        {scanResult.bookingTime && <p>預約時間: {scanResult.bookingTime.slice(0, 5)}</p>}
                    </div>

                    {/* Voucher List for Redemption */}
                    {userVouchers.length > 0 && (
                        <div className="animate-fade-in" style={{ marginTop: '20px', borderTop: '2px dashed #ccc', paddingTop: '20px' }}>
                            <h3 style={{ color: '#4b5563', marginBottom: '15px' }}>🎫 可核銷票券 ({userVouchers.length})</h3>
                            <div style={{ display: 'grid', gap: '10px' }}>
                                {userVouchers.map(v => (
                                    <div key={v.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '15px', background: '#fff', border: '1px solid #e5e7eb',
                                        borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}>
                                        <div>
                                            <strong style={{ fontSize: '1.1rem', color: '#374151' }}>{v.product_name}</strong>
                                            <div style={{ fontSize: '0.9rem', color: '#6b7280', fontFamily: 'monospace' }}>{v.code}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#059669' }}>
                                                有效期: {new Date(v.valid_until).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRedeemVoucher(v)}
                                            className="btn"
                                            style={{
                                                width: 'auto', padding: '8px 16px',
                                                background: '#2563eb', color: 'white',
                                                fontSize: '1rem'
                                            }}
                                        >
                                            立即使用
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {userVouchers.length === 0 && scanResult.user && (
                        <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: '20px' }}>此用戶目前無可用的電子票券</p>
                    )}
                </div>
            )}
        </div>
    );
}

// ... (VoucherManagement, StarterDashboard, UserManagement, AdminManagement, AdminDashboard, etc. remain unchanged)

// Sub-component: Voucher Management (Existing)
function VoucherManagement() {
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(false);

    // Filters
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterSource, setFilterSource] = useState('all');
    const [keyword, setKeyword] = useState('');

    // Detail Modal
    const [selectedVoucher, setSelectedVoucher] = useState(null);
    const [logs, setLogs] = useState([]);
    const [actionMode, setActionMode] = useState(null); // 'void', 'extend', 'reset'
    const [actionReason, setActionReason] = useState('');
    const [newExpiryDate, setNewExpiryDate] = useState('');

    // Import Modal
    const [showImportModal, setShowImportModal] = useState(false);
    const [importText, setImportText] = useState('');
    const [importResult, setImportResult] = useState(null);
    const [isImporting, setIsImporting] = useState(false);

    useEffect(() => {
        fetchVouchers();
    }, [filterStatus, filterSource]);

    const fetchVouchers = async () => {
        setLoading(true);
        let query = supabase.from('vouchers').select('*, users(display_name, phone)');

        if (filterStatus !== 'all') query = query.eq('status', filterStatus);
        if (filterSource !== 'all') query = query.eq('source_type', filterSource);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (data) {
            let filtered = data;
            if (keyword) {
                const k = keyword.toLowerCase();
                filtered = data.filter(v =>
                    v.code.toLowerCase().includes(k) ||
                    v.users?.display_name?.toLowerCase().includes(k) ||
                    v.users?.phone?.includes(k) ||
                    v.original_paper_code?.toLowerCase().includes(k)
                );
            }
            setVouchers(filtered);
        }
        setLoading(false);
    };

    const fetchLogs = async (voucherId) => {
        const { data } = await supabase.from('voucher_logs').select('*').eq('voucher_id', voucherId).order('created_at', { ascending: false });
        setLogs(data || []);
    };

    const handleOpenDetail = (voucher) => {
        setSelectedVoucher(voucher);
        fetchLogs(voucher.id);
        setActionMode(null);
        setActionReason('');
        setNewExpiryDate('');
    };

    const handleAction = async () => {
        if (!actionMode) return;
        if (actionMode === 'void' && !actionReason) return alert('請輸入作廢原因');
        if (actionMode === 'extend' && !newExpiryDate) return alert('請選擇新期限');

        const updates = {};
        let logAction = '';

        if (actionMode === 'void') {
            updates.status = 'void';
            logAction = 'voided';
        } else if (actionMode === 'extend') {
            updates.valid_until = new Date(newExpiryDate).toISOString();
            logAction = 'extended';
        } else if (actionMode === 'reset') {
            updates.status = 'active';
            updates.redeemed_at = null;
            logAction = 'reset';
        }

        // Update Voucher
        const { error: updateError } = await supabase.from('vouchers').update(updates).eq('id', selectedVoucher.id);

        if (!updateError) {
            // Create Log
            await supabase.from('voucher_logs').insert([{
                voucher_id: selectedVoucher.id,
                action: logAction,
                memo: actionReason || (actionMode === 'extend' ? `延期至 ${newExpiryDate}` : '重置狀態'),
                // operator_id: TBD (Needs auth context, assuming current user)
                operator_name: 'Admin'
            }]);

            alert('操作成功');
            setSelectedVoucher(null); // Close modal
            fetchVouchers(); // Refresh list
        } else {
            alert('操作失敗: ' + updateError.message);
        }
    };

    const handleBulkImport = async () => {
        if (!importText.trim()) return alert('請輸入資料');
        setIsImporting(true);
        setImportResult(null);

        const lines = importText.split('\n').filter(l => l.trim());
        let successCount = 0;
        let failCount = 0;
        let details = [];

        for (const line of lines) {
            // Format: Phone, PaperCode, ProductName, ValidUntil
            const parts = line.split(',').map(s => s.trim());
            if (parts.length < 3) {
                failCount++;
                details.push(`格式錯誤: ${line}`);
                continue;
            }

            const [phone, paperCode, productName, dateStr] = parts;
            const validUntil = dateStr ? new Date(dateStr).toISOString() : addMinutes(new Date(), 525600).toISOString(); // Default 1 year

            try {
                // 1. Find User
                const { data: users } = await supabase.from('users').select('id, display_name').eq('phone', phone).limit(1);

                if (!users || users.length === 0) {
                    failCount++;
                    details.push(`找不到用戶 (${phone})`);
                    continue;
                }
                const user = users[0];

                // 2. Insert Voucher
                // Generate a unique digital code: EV-{Timestamp}-{Random4}
                const digitalCode = `EV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

                const { data: voucher, error: vError } = await supabase.from('vouchers').insert([{
                    code: digitalCode,
                    product_id: 0, // Placeholder
                    product_name: productName,
                    user_id: user.id,
                    status: 'active',
                    source_type: 'paper_converted',
                    original_paper_code: paperCode,
                    valid_until: validUntil
                }]).select().single();

                if (vError) throw vError;

                // 3. Log
                await supabase.from('voucher_logs').insert([{
                    voucher_id: voucher.id,
                    action: 'imported',
                    memo: `紙券轉入 (原號:${paperCode})`,
                    operator_name: 'Admin'
                }]);

                successCount++;

            } catch (err) {
                console.error(err);
                failCount++;
                details.push(`系統錯誤 (${paperCode}): ${err.message}`);
            }
        }

        setIsImporting(false);
        setImportResult({ success: successCount, fail: failCount, details });
        if (successCount > 0) fetchVouchers();
    };

    // Dashboard Stats
    const totalCount = vouchers.length;
    const activeCount = vouchers.filter(v => v.status === 'active').length;
    const redeemedCount = vouchers.filter(v => v.status === 'redeemed').length;

    return (
        <div className="card animate-fade-in">
            {/* Dashboard Widgets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: '#f0f9ff', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#0369a1' }}>總發行量</h4>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0ea5e9' }}>{totalCount}</span>
                </div>
                <div style={{ background: '#ecfdf5', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#047857' }}>流通中 (Active)</h4>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>{activeCount}</span>
                </div>
                <div style={{ background: '#f5f3ff', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 5px 0', color: '#6d28d9' }}>已核銷 (Redeemed)</h4>
                    <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8b5cf6' }}>{redeemedCount}</span>
                </div>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
                <input
                    placeholder="搜尋序號、手機、姓名..."
                    className="form-input"
                    style={{ width: '200px' }}
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && fetchVouchers()}
                />
                <button onClick={fetchVouchers} className="btn btn-primary" style={{ width: 'auto' }}>搜尋</button>

                <select className="form-input" style={{ width: 'auto' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">所有狀態</option>
                    <option value="active">未使用 (Active)</option>
                    <option value="redeemed">已核銷 (Redeemed)</option>
                    <option value="void">已作廢 (Void)</option>
                    <option value="expired">已過期 (Expired)</option>
                </select>

                <select className="form-input" style={{ width: 'auto' }} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                    <option value="all">所有來源</option>
                    <option value="digital_purchase">線上購買</option>
                    <option value="paper_converted">紙本轉入</option>
                </select>

                <button onClick={() => setShowImportModal(true)} className="btn" style={{ width: 'auto', marginLeft: 'auto', background: '#eab308', color: '#fff' }}>
                    📥 紙券批次轉入
                </button>
            </div>

            {/* Voucher List */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                            <th style={{ padding: '12px' }}>序號 (Code)</th>
                            <th style={{ padding: '12px' }}>商品名稱</th>
                            <th style={{ padding: '12px' }}>會員</th>
                            <th style={{ padding: '12px' }}>狀態</th>
                            <th style={{ padding: '12px' }}>來源</th>
                            <th style={{ padding: '12px' }}>效期</th>
                            <th style={{ padding: '12px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vouchers.map(v => {
                            let statusColor = '#6b7280';
                            let statusBg = '#f3f4f6';
                            if (v.status === 'active') { statusColor = '#059669'; statusBg = '#d1fae5'; }
                            if (v.status === 'redeemed') { statusColor = '#2563eb'; statusBg = '#dbeafe'; }
                            if (v.status === 'void') { statusColor = '#9ca3af'; statusBg = '#e5e7eb'; textDecoration = 'line-through'; }
                            if (v.status === 'expired') { statusColor = '#dc2626'; statusBg = '#fee2e2'; }

                            return (
                                <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{v.code}</td>
                                    <td style={{ padding: '12px' }}>{v.product_name}</td>
                                    <td style={{ padding: '12px' }}>
                                        {v.users?.display_name}<br />
                                        <span style={{ fontSize: '0.8rem', color: '#666' }}>{v.users?.phone}</span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <span style={{ padding: '4px 8px', borderRadius: '4px', backgroundColor: statusBg, color: statusColor, fontSize: '0.85rem', fontWeight: 'bold' }}>
                                            {v.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {v.source_type === 'paper_converted' ? '📄 紙本轉入' : '📱 線上購買'}
                                    </td>
                                    <td style={{ padding: '12px', fontSize: '0.9rem' }}>
                                        {v.valid_until ? new Date(v.valid_until).toLocaleDateString() : '-'}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        <button onClick={() => handleOpenDetail(v)} style={{ border: '1px solid #ddd', background: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                                            查看
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Detail Modal */}
            {selectedVoucher && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }} onClick={() => setSelectedVoucher(null)}>
                    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>票券詳情</h2>
                            <button onClick={() => setSelectedVoucher(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ color: '#666', fontSize: '0.85rem' }}>票券序號</label>
                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{selectedVoucher.code}</div>
                            </div>
                            <div>
                                <label style={{ color: '#666', fontSize: '0.85rem' }}>商品名稱</label>
                                <div style={{ fontWeight: 'bold' }}>{selectedVoucher.product_name}</div>
                            </div>
                            <div>
                                <label style={{ color: '#666', fontSize: '0.85rem' }}>目前狀態</label>
                                <div>{selectedVoucher.status.toUpperCase()}</div>
                            </div>
                            <div>
                                <label style={{ color: '#666', fontSize: '0.85rem' }}>有效期限</label>
                                <div>{new Date(selectedVoucher.valid_until).toLocaleDateString()}</div>
                            </div>
                            {selectedVoucher.source_type === 'paper_converted' && (
                                <div style={{ gridColumn: 'span 2', background: '#fffbeb', padding: '10px', borderRadius: '6px' }}>
                                    <label style={{ color: '#d97706', fontSize: '0.85rem', fontWeight: 'bold' }}>⚠️ 原紙本票號</label>
                                    <div style={{ color: '#b45309' }}>{selectedVoucher.original_paper_code}</div>
                                </div>
                            )}
                        </div>

                        {/* Actions Area */}
                        <div style={{ borderTop: '1px solid #eee', marginTop: '20px', paddingTop: '20px' }}>
                            <h4 style={{ margin: '0 0 10px 0' }}>管理操作</h4>

                            {/* Action Buttons */}
                            {!actionMode && (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {selectedVoucher.status === 'active' && (
                                        <>
                                            <button onClick={() => setActionMode('void')} className="btn" style={{ background: '#fee2e2', color: '#ef4444' }}>作廢票券</button>
                                            <button onClick={() => setActionMode('extend')} className="btn" style={{ background: '#e0f2fe', color: '#0369a1' }}>延展效期</button>
                                        </>
                                    )}
                                    {(selectedVoucher.status === 'redeemed' || selectedVoucher.status === 'void') && (
                                        <button onClick={() => setActionMode('reset')} className="btn" style={{ background: '#f3f4f6', color: '#374151' }}>重置狀態 (Admin)</button>
                                    )}
                                </div>
                            )}

                            {/* Action Forms */}
                            {actionMode === 'void' && (
                                <div style={{ background: '#fef2f2', padding: '15px', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#991b1b' }}>請輸入作廢原因/備註：</label>
                                    <input className="form-input" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="例：客戶退款" />
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <button onClick={handleAction} className="btn" style={{ background: '#ef4444', color: 'white' }}>確認作廢</button>
                                        <button onClick={() => setActionMode(null)} className="btn" style={{ background: 'white', color: '#666' }}>取消</button>
                                    </div>
                                </div>
                            )}

                            {actionMode === 'extend' && (
                                <div style={{ background: '#f0f9ff', padding: '15px', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', color: '#075985' }}>選擇新有效期限：</label>
                                    <input type="date" className="form-input" value={newExpiryDate} onChange={e => setNewExpiryDate(e.target.value)} />
                                    <input className="form-input" style={{ marginTop: '5px' }} value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="延期原因 (選填)" />
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <button onClick={handleAction} className="btn" style={{ background: '#0ea5e9', color: 'white' }}>確認延期</button>
                                        <button onClick={() => setActionMode(null)} className="btn" style={{ background: 'white', color: '#666' }}>取消</button>
                                    </div>
                                </div>
                            )}

                            {actionMode === 'reset' && (
                                <div style={{ background: '#f3f4f6', padding: '15px', borderRadius: '8px' }}>
                                    <p style={{ color: '#374151', marginTop: 0 }}>確定要將此票券重置為 <b>Active</b> 狀態嗎？</p>
                                    <input className="form-input" value={actionReason} onChange={e => setActionReason(e.target.value)} placeholder="重置原因 (選填)" />
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <button onClick={handleAction} className="btn" style={{ background: '#4b5563', color: 'white' }}>確認重置</button>
                                        <button onClick={() => setActionMode(null)} className="btn" style={{ background: 'white', color: '#666' }}>取消</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Logs */}
                        <div style={{ marginTop: '25px' }}>
                            <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>操作履歷</h4>
                            {logs.length === 0 ? <p style={{ color: '#999' }}>無紀錄</p> : (
                                <ul style={{ listStyle: 'none', padding: 0, fontSize: '0.9rem' }}>
                                    {logs.map(log => (
                                        <li key={log.id} style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>
                                                <span style={{ fontWeight: 'bold', marginRight: '8px' }}>[{log.action.toUpperCase()}]</span>
                                                {log.memo}
                                                {log.operator_name && <span style={{ marginLeft: '5px', color: '#666', background: '#f3f4f6', padding: '2px 5px', borderRadius: '4px' }}>{log.operator_name}</span>}
                                            </span>
                                            <span style={{ color: '#888', fontSize: '0.8rem' }}>{new Date(log.created_at).toLocaleString()}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-component: StarterDashboard (Existing)
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

// Sub-component: User Management (Existing)
function UserManagement() {
    const [users, setUsers] = useState([]);
    useEffect(() => { fetchUsers(); }, []);
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

// Sub-component: Admin Management (Existing)
function AdminManagement() {
    const [admins, setAdmins] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newAdmin, setNewAdmin] = useState({ name: '', username: '', password: '' });
    useEffect(() => { fetchAdmins(); }, []);
    const fetchAdmins = async () => {
        const { data } = await supabase.from('admins').select('*').order('created_at', { ascending: false });
        setAdmins(data || []);
    };
    const handleAddAdmin = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('admins').insert([newAdmin]);
        if (error) alert('新增失敗: ' + error.message);
        else { alert('新增成功'); setShowForm(false); setNewAdmin({ name: '', username: '', password: '' }); fetchAdmins(); }
    };
    const handleDelete = async (id) => {
        if (!confirm('確定刪除此管理員？')) return;
        const { error } = await supabase.from('admins').delete().eq('id', id);
        if (!error) fetchAdmins(); else alert('刪除失敗');
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
                    <div className="form-group"><label>名稱</label><input className="form-input" required value={newAdmin.name} onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })} /></div>
                    <div className="form-group"><label>帳號 (Email/手機)</label><input className="form-input" required value={newAdmin.username} onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })} /></div>
                    <div className="form-group"><label>密碼</label><input className="form-input" required value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} /></div>
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
                                    {a.username !== 'admin' && <button onClick={() => handleDelete(a.id)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>刪除</button>}
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
    const [activeTab, setActiveTab] = useState('starter'); // starter, scan, checkin_list, departure_list, vouchers, users, admins
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (['starter', 'checkin_list', 'departure_list'].includes(activeTab)) fetchBookings();
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
        await supabase.from('admins').delete().neq('username', 'admin');
        await supabase.from('vouchers').delete().neq('id', -1); // Clear all test vouchers
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
                <button onClick={() => setActiveTab('starter')} style={getTabStyle(activeTab === 'starter')}>出發台看板</button>
                <button onClick={() => setActiveTab('scan')} style={getTabStyle(activeTab === 'scan')}>📷 掃碼 (報到/核銷)</button>
                <button onClick={() => setActiveTab('checkin_list')} style={getTabStyle(activeTab === 'checkin_list')}>📋 報到清單</button>
                <button onClick={() => setActiveTab('departure_list')} style={getTabStyle(activeTab === 'departure_list')}>🚩 出發清單</button>
                <button onClick={() => setActiveTab('vouchers')} style={getTabStyle(activeTab === 'vouchers')}>🎫 票券管理</button>
                <button onClick={() => setActiveTab('users')} style={getTabStyle(activeTab === 'users')}>用戶管理</button>
                <button onClick={() => setActiveTab('admins')} style={getTabStyle(activeTab === 'admins')}>後台權限</button>
            </div>

            {/* Content */}
            {activeTab === 'starter' && <StarterDashboard selectedDate={selectedDate} setSelectedDate={setSelectedDate} bookings={bookings} fetchBookings={fetchBookings} />}
            {activeTab === 'scan' && <QRScannerTab />}
            {activeTab === 'checkin_list' && <CheckInList bookings={bookings} selectedDate={selectedDate} />}
            {activeTab === 'departure_list' && <DepartureList bookings={bookings} selectedDate={selectedDate} />}
            {activeTab === 'vouchers' && <VoucherManagement />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'admins' && <AdminManagement />}
        </div>
    );
}

// Helper for consistent tab styling
function getTabStyle(isActive) {
    return {
        padding: '10px 16px',
        whiteSpace: 'nowrap',
        border: 'none',
        background: 'none',
        borderBottom: isActive ? '3px solid var(--primary-color)' : '3px solid transparent',
        fontWeight: isActive ? 'bold' : 'normal',
        cursor: 'pointer',
        color: isActive ? 'var(--primary-color)' : '#6b7280',
        display: 'flex', alignItems: 'center', gap: '5px',
        fontSize: '0.95rem'
    };
}
