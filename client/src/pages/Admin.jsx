import React, { useEffect, useState, useRef } from 'react';
import { format, addMinutes, isAfter, parseISO, isBefore } from 'date-fns';
import { supabase } from '../supabase';
import { Calendar } from '../components/Calendar';
import { generateDailySlots } from '../utils/golfLogic';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { AdminSettings } from '../components/AdminSettings';
import { WaitlistMonitor } from '../components/WaitlistMonitor';
import { RateManagement } from '../components/RateManagement';
import { OperationalCalendar } from '../components/OperationalCalendar';
import ChargeCardModal from '../components/ChargeCardModal';
import CaddyManagement from '../components/CaddyManagement';
import RolePermissionManager from '../components/RolePermissionManager';
import { getAdminPermissions, getAdminInfo, adminFetch, clearAdminSession } from '../utils/adminApi';

const ALL_TABS = [
    { key: 'starter', label: '出發台看板' },
    { key: 'waitlist', label: '候補監控' },
    { key: 'scan', label: '📷 掃碼 (報到/核銷)' },
    { key: 'checkin_list', label: '📋 報到清單' },
    { key: 'vouchers', label: '🎫 票券管理' },
    { key: 'users', label: '用戶管理' },
    { key: 'settings', label: '參數設定' },
    { key: 'operational_calendar', label: '📅 營運日曆' },
    { key: 'rate_management', label: '💰 費率管理' },
    { key: 'caddy_management', label: '🏌️ 桿弟管理' },
    { key: 'admins', label: '後台權限' },
];

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
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

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

        // --- Robust Excel Parser (Handles quoted newlines) ---
        const parseExcelText = (text) => {
            const rows = [];
            let currentRow = [];
            let currentCell = '';
            let inQuote = false;

            // Normalize line endings
            text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const nextChar = text[i + 1];

                if (inQuote) {
                    if (char === '"') {
                        if (nextChar === '"') {
                            currentCell += '"'; // Escaped quote
                            i++;
                        } else {
                            inQuote = false; // End quote
                        }
                    } else {
                        currentCell += char;
                    }
                } else {
                    if (char === '"') {
                        inQuote = true;
                    } else if (char === '\t') {
                        currentRow.push(currentCell.trim()); // Cell complete
                        currentCell = '';
                    } else if (char === '\n') {
                        currentRow.push(currentCell.trim()); // Row complete
                        if (currentRow.length > 0 && currentRow.some(c => c)) { // Skip empty rows
                            rows.push(currentRow);
                        }
                        currentRow = [];
                        currentCell = '';
                    } else {
                        currentCell += char;
                    }
                }
            }
            // Add last cell/row
            if (currentCell || currentRow.length > 0) {
                currentRow.push(currentCell.trim());
                if (currentRow.length > 0 && currentRow.some(c => c)) {
                    rows.push(currentRow);
                }
            }
            return rows;
        };

        // Use the new parser
        const rows = parseExcelText(importText);
        const totalLines = rows.length;
        setImportProgress({ current: 0, total: totalLines });

        let successCount = 0;
        let failCount = 0;
        let errors = [];
        let newUsers = [];

        // Helper function to convert ROC date (民國年) to AD date
        const parseROCDate = (rocDateStr) => {
            try {
                if (!rocDateStr) return null;
                // Format: 114/07/04 (YYY/MM/DD in ROC calendar)
                const parts = rocDateStr.split('/');
                if (parts.length === 3) {
                    const rocYear = parseInt(parts[0]);
                    const month = parseInt(parts[1]);
                    const day = parseInt(parts[2]);
                    const adYear = rocYear + 1911; // Convert ROC year to AD year
                    return new Date(adYear, month - 1, day).toISOString();
                }
            } catch (e) {
                console.error('Date parse error:', e);
            }
            return null;
        };

        // Retry helper
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const retryOperation = async (operation, maxRetries = 3) => {
            for (let i = 0; i < maxRetries; i++) {
                try {
                    return await operation();
                } catch (err) {
                    if (i === maxRetries - 1) throw err;
                    await sleep(500 * (i + 1)); // Backoff
                }
            }
        };

        for (let i = 0; i < rows.length; i++) {
            const rowData = rows[i];
            setImportProgress({ current: i + 1, total: totalLines });

            // Allow UI to update
            await sleep(50);

            // Validate minimum columns (Excel headers: 票券日期, 客戶編號, 客戶全稱, 發票號碼, 產品金額...)
            // Actually our parser returns array of cells directly.

            if (rowData.length < 4) {
                failCount++;
                errors.push(`第 ${i + 1} 行格式錯誤 (欄位不足): ${rowData.join(', ').substring(0, 30)}...`);
                continue;
            }

            // Extract fields
            const rocDate = rowData[0];           // 票券日期
            const customerCode = rowData[1];      // 客戶編號
            const name = rowData[2];              // 客戶全稱
            const paperCode = rowData[3];         // 發票號碼
            const priceStr = rowData[4] || '0';   // 產品金額
            const productName = rowData[6] || '果嶺券'; // 分錄備註 (index 6)

            // Use customer code as phone number
            const phone = customerCode;

            // Parse fields
            const purchaseDate = parseROCDate(rocDate);
            const price = parseFloat(priceStr.replace(/,/g, '')) || 0;
            const baseDate = purchaseDate ? new Date(purchaseDate) : new Date();
            const validUntil = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

            try {
                // 1. Find or Create User by phone
                let user;

                await retryOperation(async () => {
                    let { data: users } = await supabase.from('users').select('id, display_name').eq('phone', phone).limit(1);

                    if (!users || users.length === 0) {
                        const { data: newUser, error: userError } = await supabase.from('users').insert([{
                            phone: phone,
                            display_name: name,
                            line_user_id: null,
                            created_at: new Date().toISOString()
                        }]).select().single();

                        if (userError) throw userError;
                        user = newUser;
                        if (!newUsers.includes(`${name} (${phone})`)) {
                            newUsers.push(`${name} (${phone})`);
                        }
                    } else {
                        user = users[0];
                    }
                });

                // 2. Insert Voucher
                const digitalCode = `EV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
                let insertedVoucher;

                await retryOperation(async () => {
                    const { data: voucher, error: vError } = await supabase.from('vouchers').insert([{
                        code: digitalCode,
                        product_id: 0,
                        product_name: productName,
                        user_id: user.id,
                        status: 'active',
                        source_type: 'paper_converted',
                        original_paper_code: paperCode,
                        valid_until: validUntil,
                        purchase_date: purchaseDate,
                        price: price
                    }]).select().single(); // Ensure .select().single() to get the inserted data

                    if (vError) throw vError;
                    insertedVoucher = voucher;
                });

                // 3. Log Action
                await retryOperation(async () => {
                    await supabase.from('voucher_logs').insert([{
                        voucher_id: insertedVoucher.id, // Use the ID from the inserted voucher
                        action: 'imported',
                        memo: `紙券轉入 (原號:${paperCode}, $${price}, 購買人:${name})`,
                        operator_name: 'Admin'
                    }]);
                });

                successCount++;

            } catch (err) {
                console.error(err);
                failCount++;
                errors.push(`第 ${i + 1} 行系統錯誤 (${phone} - ${name}): ${err.message}`);
            }
        }

        setIsImporting(false);
        setImportResult({ success: successCount, fail: failCount, errors, newUsers });
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
                    <option value="paper_converted">紙券轉入</option>
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
            {
                selectedVoucher && (
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
                )
            }

            {/* Import Modal */}
            {
                showImportModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
                        display: 'flex', justifyContent: 'center', alignItems: 'center'
                    }} onClick={() => setShowImportModal(false)}>
                        <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                            <h2 style={{ margin: '0 0 15px 0' }}>📥 紙券批次轉入</h2>
                            <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '10px' }}>
                                請直接從 Excel 複製貼上資料（支援 Tab 分隔）<br />
                                <b>欄位：票券日期 客戶編號 客戶全稱 發票號碼 產品金額 資料金額 分錄備註 本幣金額</b><br />
                                範例：<br />
                                <code style={{ background: '#f3f4f6', padding: '2px 5px', fontSize: '0.85rem' }}>114/07/04	0936627522	黃寶雲	PX18750376	3,000	3,000	@2024*15度	2,857</code>
                            </p>

                            <textarea
                                className="form-input"
                                style={{ width: '100%', height: '200px', fontFamily: 'monospace', fontSize: '14px' }}
                                placeholder="在此貼上 csv 資料..."
                                value={importText}
                                onChange={e => setImportText(e.target.value)}
                            />

                            {/* Progress Bar */}
                            {isImporting && importProgress.total > 0 && (
                                <div style={{ marginTop: '15px', padding: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: '#0369a1' }}>
                                        <span>處理進度</span>
                                        <span>{importProgress.current} / {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100)}%)</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: '#e0f2fe', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${(importProgress.current / importProgress.total) * 100}%`,
                                            height: '100%',
                                            background: 'linear-gradient(90deg, #0ea5e9, #06b6d4)',
                                            transition: 'width 0.3s ease'
                                        }}></div>
                                    </div>
                                </div>
                            )}

                            {importResult && (
                                <div style={{ marginTop: '15px', padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                                    <div style={{ fontWeight: 'bold', color: '#166534', marginBottom: '5px' }}>處理完成</div>

                                    {/* 成功統計 */}
                                    <div style={{ marginBottom: '5px' }}>
                                        ✅ 成功匯入: <b>{importResult.success}</b> 筆
                                    </div>

                                    {/* 自動建立新用戶清單 */}
                                    {importResult.newUsers && importResult.newUsers.length > 0 && (
                                        <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#0369a1' }}>
                                            <div style={{ fontWeight: 'bold' }}>✨ 自動建立新用戶 ({importResult.newUsers.length}):</div>
                                            <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px', maxHeight: '100px', overflowY: 'auto' }}>
                                                {importResult.newUsers.map((u, i) => <li key={i}>{u}</li>)}
                                            </ul>
                                        </div>
                                    )}

                                    {/* 失敗統計與明細 */}
                                    {importResult.fail > 0 && (
                                        <div style={{ color: '#991b1b', marginTop: '10px', borderTop: '1px solid #fee2e2', paddingTop: '10px' }}>
                                            <div style={{ fontWeight: 'bold' }}>❌ 失敗: {importResult.fail} 筆</div>
                                            <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px', fontSize: '0.85rem' }}>
                                                {importResult.errors.map((d, i) => <li key={i}>{d}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button onClick={() => setShowImportModal(false)} className="btn" style={{ background: 'white', color: '#666', width: 'auto' }}>關閉</button>
                                <button onClick={handleBulkImport} disabled={isImporting} className="btn" style={{ background: isImporting ? '#ccc' : '#eab308', color: 'white', width: 'auto' }}>
                                    {isImporting ? '處理中...' : '開始轉入'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}

// Sub-component: StarterDashboard (Existing)
function StarterDashboard({ selectedDate, setSelectedDate, bookings, fetchBookings, setChargeCardBooking, systemSettings }) {
    const [dateSettings, setDateSettings] = useState(null);
    const [slotFilter, setSlotFilter] = useState('all'); // 'all' | 'booked'
    const [hiddenSlots, setHiddenSlots] = useState([]);
    const [isSavingHidden, setIsSavingHidden] = useState(false);

    // 載入選定日期的營運日曆覆蓋設定
    useEffect(() => {
        const fetchDateSettings = async () => {
            try {
                const dateStr = format(selectedDate, 'yyyy-MM-dd');
                const res = await adminFetch(`/api/calendar/status/${dateStr}`);
                if (res.ok) {
                    const data = await res.json();
                    setDateSettings(data);
                    setHiddenSlots(data.hidden_slots || []);
                } else {
                    setDateSettings(null);
                    setHiddenSlots([]);
                }
            } catch (err) {
                console.error('載入日期營運設定失敗:', err);
                setDateSettings(null);
                setHiddenSlots([]);
            }
        };
        fetchDateSettings();
    }, [selectedDate]);

    // 合併營運日曆覆蓋設定與全域設定
    const effectiveSettings = dateSettings ? {
        ...systemSettings,
        start_time: dateSettings.start_time || systemSettings?.start_time,
        end_time: dateSettings.end_time || systemSettings?.end_time,
        interval: dateSettings.interval || systemSettings?.interval,
    } : (systemSettings || {});

    const slots = generateDailySlots(selectedDate, effectiveSettings);

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

    // Manual Booking State
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualData, setManualData] = useState({ time: '', holes: 18, players: [] });
    const [currentFriend, setCurrentFriend] = useState({ name: '', phone: '' });
    const [isSaving, setIsSaving] = useState(false);

    // Details Modal State (editable)
    const [viewingBooking, setViewingBooking] = useState(null);
    const [editingPlayers, setEditingPlayers] = useState([]);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const [isRescheduleMode, setIsRescheduleMode] = useState(false);
    const [rescheduleDate, setRescheduleDate] = useState('');
    const [rescheduleTime, setRescheduleTime] = useState('');
    const [rescheduleSlots, setRescheduleSlots] = useState([]);
    const [isSavingReschedule, setIsSavingReschedule] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);

    // ESC 鍵關閉詳情視窗
    useEffect(() => {
        if (!viewingBooking) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setViewingBooking(null);
                setIsEditMode(false);
                setIsRescheduleMode(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [viewingBooking]);

    // 果嶺隊預約 State
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupData, setGroupData] = useState({
        time: '', totalPlayers: '', leaderName: '', leaderPhone: '',
        holes: 18, needsCart: true, needsCaddie: true
    });
    const [isSavingGroup, setIsSavingGroup] = useState(false);

    const openEditMode = (booking) => {
        let playerList = [];
        if (booking.players_info && Array.isArray(booking.players_info) && booking.players_info.length > 0) {
            playerList = booking.players_info.map(p => ({ ...p }));
        } else if (booking.notes?.includes('手動預約球友清單:')) {
            const lines = booking.notes.split('手動預約球友清單:\n')[1].split('\n').filter(l => l.trim());
            playerList = lines.map(line => {
                const match = line.match(/(.+) \((.+)\)/);
                return { name: match ? match[1] : line, phone: match ? match[2] : '' };
            });
        } else {
            playerList = [{ name: booking.users?.display_name || '', phone: booking.users?.phone || '' }];
        }
        setEditingPlayers(playerList);
        setIsEditMode(true);
    };

    const saveEditedPlayers = async () => {
        if (!viewingBooking) return;
        setIsSavingEdit(true);
        try {
            const res = await adminFetch(`/api/bookings/${viewingBooking.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    players_info: editingPlayers,
                    players_count: editingPlayers.length
                })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            alert('儲存成功');
            setIsEditMode(false);
            setViewingBooking(null);
            fetchBookings();
        } catch (err) {
            alert('儲存失敗: ' + err.message);
        } finally {
            setIsSavingEdit(false);
        }
    };

    // 代客取消預約
    const handleAdminCancel = async () => {
        if (!viewingBooking) return;
        const name = viewingBooking.players_info?.[0]?.name || viewingBooking.users?.display_name || '-';
        if (!confirm(`確認取消 ${name} 於 ${viewingBooking.date} ${viewingBooking.time.slice(0, 5)} 的預約？\n取消後將自動觸發候補遞補流程。`)) return;
        setIsCancelling(true);
        try {
            const res = await adminFetch(`/api/bookings/${viewingBooking.id}/cancel`, { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error);
            alert('預約已取消');
            setViewingBooking(null);
            fetchBookings();
        } catch (err) {
            alert('取消失敗: ' + err.message);
        } finally {
            setIsCancelling(false);
        }
    };

    // 改期：載入目標日期可用時段
    const loadRescheduleSlots = async (dateStr) => {
        setRescheduleDate(dateStr);
        setRescheduleTime('');
        if (!dateStr) { setRescheduleSlots([]); return; }
        try {
            const res = await adminFetch(`/api/slots?date=${dateStr}`);
            if (!res.ok) throw new Error('載入時段失敗');
            const slots = await res.json();
            setRescheduleSlots(slots);
        } catch (err) {
            console.error(err);
            setRescheduleSlots([]);
        }
    };

    const openRescheduleMode = (booking) => {
        setRescheduleDate(booking.date);
        setRescheduleTime(booking.time.slice(0, 5));
        setIsRescheduleMode(true);
        loadRescheduleSlots(booking.date);
    };

    const saveReschedule = async () => {
        if (!viewingBooking || !rescheduleDate || !rescheduleTime) return;
        const newTime = rescheduleTime.length === 5 ? rescheduleTime + ':00' : rescheduleTime;
        if (rescheduleDate === viewingBooking.date && newTime === viewingBooking.time) {
            alert('日期與時間未變更');
            return;
        }
        const name = viewingBooking.players_info?.[0]?.name || viewingBooking.users?.display_name || '-';
        if (!confirm(`確認將 ${name} 的預約從\n${viewingBooking.date} ${viewingBooking.time.slice(0, 5)}\n改為\n${rescheduleDate} ${rescheduleTime}？`)) return;
        setIsSavingReschedule(true);
        try {
            const res = await adminFetch(`/api/bookings/${viewingBooking.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: rescheduleDate, time: newTime })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
            alert('改期成功');
            setIsRescheduleMode(false);
            setViewingBooking(null);
            fetchBookings();
        } catch (err) {
            alert('改期失敗: ' + err.message);
        } finally {
            setIsSavingReschedule(false);
        }
    };

    const handleGroupSubmit = async (e) => {
        e.preventDefault();
        if (!groupData.time || !groupData.totalPlayers || !groupData.leaderName || !groupData.leaderPhone) {
            alert('請填寫必要欄位');
            return;
        }
        if (groupData.totalPlayers < 1 || groupData.totalPlayers > 100) {
            alert('人數須介於 1 ~ 100 人');
            return;
        }
        setIsSavingGroup(true);
        try {
            const res = await adminFetch('/api/bookings/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date: format(selectedDate, 'yyyy-MM-dd'),
                    time: groupData.time + ':00',
                    total_players: Number(groupData.totalPlayers),
                    leader_name: groupData.leaderName,
                    leader_phone: groupData.leaderPhone,
                    holes: groupData.holes,
                    needs_cart: groupData.needsCart,
                    needs_caddie: groupData.needsCaddie
                })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            alert(`果嶺隊預約成功！共 ${result.group_count} 組，${result.total_players} 人`);
            setShowGroupModal(false);
            setGroupData({ time: '', totalPlayers: '', leaderName: '', leaderPhone: '', holes: 18, needsCart: true, needsCaddie: true });
            fetchBookings();
        } catch (err) {
            alert('果嶺隊預約失敗: ' + err.message);
        } finally {
            setIsSavingGroup(false);
        }
    };

    // 判斷預約屬於 Peak A / Peak B / 離峰
    const getBookingPeakType = (bookingTime) => {
        if (!effectiveSettings) return null;
        const t = bookingTime.slice(0, 5); // "HH:mm"
        const peakA = effectiveSettings.peak_a || systemSettings?.peak_a;
        const peakB = effectiveSettings.peak_b || systemSettings?.peak_b;
        if (peakA && t >= peakA.start && t <= peakA.end) return 'peak_a';
        if (peakB && t >= peakB.start && t <= peakB.end) return 'peak_b';
        return null;
    };

    // 取得同 Peak 可併組的預約（不足4人、同日、同 Peak、非取消）
    const getMergeableSamePeak = (booking) => {
        const peakType = getBookingPeakType(booking.time);
        if (!peakType) return [];
        return bookings.filter(b =>
            b.id !== booking.id &&
            b.status !== 'cancelled' &&
            b.players_count < 4 &&
            getBookingPeakType(b.time) === peakType
        );
    };

    // 執行併組：將 source 的球友合併到 target
    const handleMergeGroups = async (targetBooking, sourceBooking) => {
        const targetPlayers = targetBooking.players_info || [];
        const sourcePlayers = sourceBooking.players_info || [];
        const merged = [...targetPlayers, ...sourcePlayers];

        if (merged.length > 4) {
            alert(`合併後人數 ${merged.length} 人超過 4 人上限，無法併組`);
            return;
        }

        if (!confirm(`確認將 ${sourcePlayers.map(p => p.name).join('、')} 併入 ${targetPlayers[0]?.name || '-'} 的組別？\n合併後共 ${merged.length} 人`)) return;

        try {
            // 更新目標組
            const res1 = await adminFetch(`/api/bookings/${targetBooking.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ players_info: merged, players_count: merged.length })
            });
            if (!res1.ok) throw new Error((await res1.json()).error);

            // 取消來源組
            const res2 = await adminFetch(`/api/bookings/${sourceBooking.id}/cancel`, { method: 'POST' });
            if (!res2.ok) throw new Error((await res2.json()).error);

            alert('併組成功');
            setViewingBooking(null);
            fetchBookings();
        } catch (err) {
            alert('併組失敗: ' + err.message);
        }
    };

    const openManualBooking = (time) => {
        // Restriction: 18 holes only before 13:30
        const [h, m] = time.split(':').map(Number);
        const isLate = h > 13 || (h === 13 && m >= 30);
        setManualData({ ...manualData, time, holes: isLate ? 9 : 18, players: [] });
        setCurrentFriend({ name: '', phone: '' });
        setShowManualModal(true);
    };

    const addFriendToList = () => {
        if (!currentFriend.name || !currentFriend.phone) {
            alert('請填寫姓名與電話');
            return;
        }
        if (manualData.players.length >= 4) {
            alert('最多只能加入 4 位球友');
            return;
        }
        setManualData({
            ...manualData,
            players: [...manualData.players, { ...currentFriend }]
        });
        setCurrentFriend({ name: '', phone: '' });
    };

    const removeFriendFromList = (index) => {
        const newList = [...manualData.players];
        newList.splice(index, 1);
        setManualData({ ...manualData, players: newList });
    };

    const handleManualSubmit = async (e) => {
        e.preventDefault();
        if (manualData.players.length === 0) {
            alert('請至少加入一位球友資訊');
            return;
        }
        setIsSaving(true);
        try {
            // Process all players
            const playerUserIds = [];
            for (const p of manualData.players) {
                let { data: users } = await supabase.from('users').select('id').eq('phone', p.phone).limit(1);
                let userId;
                if (!users || users.length === 0) {
                    const { data: newUser, error: uErr } = await supabase.from('users').insert([{
                        phone: p.phone,
                        display_name: p.name,
                        created_at: new Date().toISOString()
                    }]).select().single();
                    if (uErr) throw uErr;
                    userId = newUser.id;
                } else {
                    userId = users[0].id;
                    await supabase.from('users').update({ display_name: p.name }).eq('id', userId);
                }
                playerUserIds.push(userId);
            }

            // 2. Create booking for the primary user (first one)
            const dateStr = format(selectedDate, 'yyyy-MM-dd');

            // Persist player details in notes for the "Details" view
            const playerDetailsNotes = manualData.players.map(p => `${p.name} (${p.phone})`).join('\n');

            const { error: bErr } = await supabase.from('bookings').insert([{
                user_id: playerUserIds[0],
                date: dateStr,
                time: manualData.time,
                holes: manualData.holes,
                players_count: manualData.players.length,
                status: 'confirmed',
                payment_status: 'pending',
                players_info: manualData.players, // Also save to players_info for consistency
                notes: `手動預約球友清單:\n${playerDetailsNotes}`
            }]);
            if (bErr) throw bErr;

            alert('手動預約成功');
            setShowManualModal(false);
            fetchBookings();
        } catch (err) {
            console.error(err);
            alert('建立失敗: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handlePhoneBlur = async () => {
        if (!currentFriend.phone) return;
        const { data } = await supabase.from('users').select('display_name').eq('phone', currentFriend.phone).limit(1);
        if (data && data.length > 0) {
            setCurrentFriend({ ...currentFriend, name: data[0].display_name });
        }
    };

    // 切換時段隱藏狀態並儲存到 system_settings
    const toggleSlotHidden = async (timeStr) => {
        const displayTime = timeStr.slice(0, 5); // "HH:mm:ss" -> "HH:mm"
        const newHidden = hiddenSlots.includes(displayTime)
            ? hiddenSlots.filter(t => t !== displayTime)
            : [...hiddenSlots, displayTime];
        setHiddenSlots(newHidden);
        setIsSavingHidden(true);
        try {
            const dateStr = format(selectedDate, 'yyyy-MM-dd');
            const res = await adminFetch(`/api/hidden-slots/${dateStr}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden_slots: newHidden })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error);
            }
        } catch (err) {
            alert('儲存失敗: ' + err.message);
            setHiddenSlots(hiddenSlots);
        } finally {
            setIsSavingHidden(false);
        }
    };

    const [showHiddenManager, setShowHiddenManager] = useState(false);

    const handleExportSheet = () => {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const dayOfWeek = format(selectedDate, 'EEEE', { locale: undefined }); // Monday, Tuesday...

        // Helper to generate time list
        const generateTimeList = (startHour, startMin, endHour, endMin, step) => {
            const list = [];
            let curr = new Date(selectedDate);
            curr.setHours(startHour, startMin, 0, 0);
            const end = new Date(selectedDate);
            end.setHours(endHour, endMin, 0, 0);

            while (curr <= end) {
                list.push(format(curr, 'HH:mm'));
                curr = addMinutes(curr, step);
            }
            return list;
        };

        // 從有效設定讀取營運時間（含日曆覆蓋），fallback 到預設值
        const [sH, sM] = (effectiveSettings?.start_time || '05:30').split(':').map(Number);
        const [eH, eM] = (effectiveSettings?.end_time || '15:54').split(':').map(Number);
        const interval = parseInt(effectiveSettings?.interval) || 6;

        const allTimes = generateTimeList(sH, sM, eH, eM, interval);
        const mid = Math.ceil(allTimes.length / 2);
        const leftTimes = allTimes.slice(0, mid);
        const rightTimes = allTimes.slice(mid);

        const maxRows = Math.max(leftTimes.length, rightTimes.length);

        // Use HTML for Excel styling support
        let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
            <style>
                table { border-collapse: collapse; width: 100%; }
                td { border: 1px solid #000000; text-align: center; width: 100px; height: 30px; font-family: "Microsoft JhengHei", sans-serif; }
                .header { font-weight: bold; background-color: #f3f4f6; }
                .time-col { background-color: #e5e7eb; font-weight: bold; }
                .row-even { background-color: #ffffff; }
                .row-odd { background-color: #f9fafb; }
                .title-row { font-size: 20pt; font-weight: bold; border: none; height: 50px; }
            </style>
        </head>
        <body>
            <table>
                <tr>
                    <td colspan="10" class="title-row">擊球預約表</td>
                </tr>
                <tr>
                    <td colspan="10" style="font-size: 12pt; border: none; text-align: left;">
                        日期: ${dateStr} (${dayOfWeek})
                    </td>
                </tr>
                <tr class="header">
                    <td>時間（備註）</td><td>球友 1</td><td>球友 2</td><td>球友 3</td><td>球友 4</td>
                    <td>時間（備註）</td><td>球友 1</td><td>球友 2</td><td>球友 3</td><td>球友 4</td>
                </tr>
        `;

        for (let i = 0; i < maxRows; i++) {
            const rowClass = i % 2 === 0 ? 'row-even' : 'row-odd';
            html += `<tr class="${rowClass}">`;

            // Helper to get player columns
            const getPlayerCols = (booking) => {
                if (!booking) return `<td></td><td></td><td></td><td></td>`;

                let players = [];
                // 1. Try players_info (Regular bookings and modern manual)
                if (booking.players_info && Array.isArray(booking.players_info) && booking.players_info.length > 0) {
                    players = booking.players_info.map(p => p.phone ? `${p.name} (${p.phone})` : p.name);
                }
                // 2. Fallback to notes (Legacy manual bookings)
                else if (booking.notes?.includes('手動預約球友清單:')) {
                    const lines = booking.notes.split('手動預約球友清單:\n')[1].split('\n').filter(l => l.trim());
                    players = lines.map(l => l.trim());
                }
                // 3. Last fallback: primary user info
                else {
                    const name = booking.users?.display_name || '';
                    const phone = booking.users?.phone || '';
                    players = [phone ? `${name} (${phone})` : name];
                }

                let cols = '';
                for (let pIdx = 0; pIdx < 4; pIdx++) {
                    cols += `<td style="font-size: 9pt;">${players[pIdx] || ''}</td>`;
                }
                return cols;
            };

            // Left Group
            if (i < leftTimes.length) {
                const t = leftTimes[i];
                html += `<td class="time-col">${t}</td>`;
                const b = bookings.find(bk => bk.time.startsWith(t) && bk.status !== 'cancelled');
                html += getPlayerCols(b);
            } else {
                html += `<td></td><td></td><td></td><td></td><td></td>`;
            }

            // Right Group
            if (i < rightTimes.length) {
                const t = rightTimes[i];
                html += `<td class="time-col">${t}</td>`;
                const b = bookings.find(bk => bk.time.startsWith(t) && bk.status !== 'cancelled');
                html += getPlayerCols(b);
            } else {
                html += `<td></td><td></td><td></td><td></td><td></td>`;
            }
            html += `</tr>`;
        }

        html += `</table></body></html>`;

        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `booking_sheet_${dateStr}.xls`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    營業時間 {effectiveSettings.start_time || '05:30'} ~ {effectiveSettings.end_time || '17:00'} ｜ 間隔 {effectiveSettings.interval || 10} 分鐘
                    {dateSettings?.source === 'calendar_override' && (
                        <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', background: '#fef3c7', color: '#92400e' }}>
                            日曆覆蓋
                        </span>
                    )}
                </span>
                <button
                    onClick={handleExportSheet}
                    className="btn"
                    style={{ width: 'auto', background: '#10b981', color: 'white', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}
                >
                    📊 匯出擊球預約表
                </button>
            </div>
            <div style={{ marginBottom: '10px' }}>
                <Calendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            </div>
            {dateSettings && (dateSettings.status === 'closed' || dateSettings.status === 'emergency_closed') && (
                <div style={{
                    padding: '12px 16px', marginBottom: '10px', borderRadius: '8px',
                    background: dateSettings.status === 'emergency_closed' ? '#fef2f2' : '#fef3c7',
                    border: `1px solid ${dateSettings.status === 'emergency_closed' ? '#fecaca' : '#fde68a'}`,
                    color: dateSettings.status === 'emergency_closed' ? '#991b1b' : '#92400e',
                    fontWeight: 'bold', textAlign: 'center'
                }}>
                    {dateSettings.status === 'emergency_closed' ? '緊急休場' : '本日休場'}
                    {dateSettings.closure_reason && (
                        <span style={{ fontWeight: 'normal', marginLeft: '8px' }}>— {dateSettings.closure_reason}</span>
                    )}
                </div>
            )}
            <div className="card" style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => setShowGroupModal(true)}
                        style={{ padding: '4px 12px', fontSize: '0.8rem', border: '1px solid #1d4ed8', borderRadius: '6px', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        + 果嶺隊預約
                    </button>
                    <button
                        onClick={() => setShowHiddenManager(!showHiddenManager)}
                        style={{
                            padding: '4px 12px', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
                            border: showHiddenManager ? '1px solid #dc2626' : '1px solid #6b7280',
                            background: showHiddenManager ? '#fef2f2' : '#f9fafb',
                            color: showHiddenManager ? '#dc2626' : '#6b7280'
                        }}
                    >
                        {showHiddenManager ? '完成隱藏管理' : `隱藏時段${hiddenSlots.length > 0 ? ` (${hiddenSlots.length})` : ''}`}
                    </button>
                    </div>
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #d1d5db' }}>
                        <button
                            onClick={() => setSlotFilter('all')}
                            style={{
                                padding: '4px 12px', fontSize: '0.8rem', border: 'none', cursor: 'pointer',
                                background: slotFilter === 'all' ? '#3b82f6' : '#f9fafb',
                                color: slotFilter === 'all' ? '#fff' : '#4b5563',
                                fontWeight: slotFilter === 'all' ? 'bold' : 'normal'
                            }}
                        >
                            全部時段
                        </button>
                        <button
                            onClick={() => setSlotFilter('booked')}
                            style={{
                                padding: '4px 12px', fontSize: '0.8rem', border: 'none', cursor: 'pointer',
                                borderLeft: '1px solid #d1d5db',
                                background: slotFilter === 'booked' ? '#3b82f6' : '#f9fafb',
                                color: slotFilter === 'booked' ? '#fff' : '#4b5563',
                                fontWeight: slotFilter === 'booked' ? 'bold' : 'normal'
                            }}
                        >
                            有預約時段
                        </button>
                    </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                            {showHiddenManager && <th style={{ padding: '12px', width: '50px' }}>隱藏</th>}
                            <th style={{ padding: '12px' }}>預約時段</th>
                            <th style={{ padding: '12px' }}>狀態</th>
                            <th style={{ padding: '12px' }}>訂位人</th>
                            <th style={{ padding: '12px' }}>洞數</th>
                            <th style={{ padding: '12px' }}>人數</th>
                            <th style={{ padding: '12px' }}>報到 / 出發</th>
                        </tr>
                    </thead>
                    <tbody>
                        {slots.filter(slot => {
                            if (slotFilter === 'all') return true;
                            const timeStr = format(slot, 'HH:mm:ss');
                            return getBookingAt(timeStr) || getLinkedBooking(slot);
                        }).map(slot => {
                            const timeStr = format(slot, 'HH:mm:ss');
                            const displayTime = format(slot, 'HH:mm');
                            const booking = getBookingAt(timeStr);
                            const linkedBooking = getLinkedBooking(slot);
                            const isHidden = hiddenSlots.includes(displayTime);
                            let bg = 'transparent';
                            if (isHidden && !booking) {
                                bg = '#f3f4f6';
                            } else if (booking) {
                                if (booking.status === 'checked_in') {
                                    bg = '#dcfce7';
                                } else if (booking.players_count === 1) {
                                    bg = '#fefce8';
                                } else if (booking.players_count === 2) {
                                    bg = '#fce7f3';
                                } else {
                                    bg = '#ffffff';
                                }
                            } else if (linkedBooking) {
                                bg = '#fef3c7';
                            }

                            return (
                                <tr key={timeStr} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: bg, opacity: isHidden && !booking ? 0.5 : 1 }}>
                                    {showHiddenManager && (
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={isHidden}
                                                onChange={() => toggleSlotHidden(timeStr)}
                                                disabled={isSavingHidden || !!booking}
                                                style={{ width: '18px', height: '18px', cursor: booking ? 'not-allowed' : 'pointer', accentColor: '#dc2626' }}
                                                title={booking ? '已有預約，無法隱藏' : (isHidden ? '取消隱藏此時段' : '隱藏此時段')}
                                            />
                                        </td>
                                    )}
                                    <td style={{ padding: '12px', fontWeight: 'bold', textDecoration: isHidden ? 'line-through' : 'none', color: isHidden ? '#dc2626' : 'inherit' }}>{displayTime}</td>
                                    {booking ? (
                                        <>
                                            <td style={{ padding: '12px' }}>{booking.status === 'checked_in' ? '已報到' : '已預約'}</td>
                                            <td style={{ padding: '12px' }}>
                                                {booking.users?.display_name || booking.players_info?.[0]?.name || '-'}
                                                {booking.notes?.includes('果嶺隊預約') && (
                                                    <span style={{ marginLeft: '4px', fontSize: '0.65rem', padding: '1px 5px', backgroundColor: '#dbeafe', color: '#1d4ed8', borderRadius: '3px', fontWeight: 'bold' }}>果嶺隊</span>
                                                )}
                                                <br />
                                                <small style={{ color: '#666' }}>{booking.users?.phone || booking.players_info?.[0]?.phone || ''}</small>
                                            </td>
                                            <td style={{ padding: '12px' }}>{booking.holes}洞</td>
                                            <td style={{ padding: '12px' }}>{booking.players_count}人</td>
                                            <td style={{ padding: '12px' }}>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                                    {!booking.checkin_time ? (
                                                        <button onClick={() => handleCheckIn(booking.id)} className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem', width: 'auto' }}>報到</button>
                                                    ) : (
                                                        <div style={{ background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                            {format(new Date(booking.checkin_time), 'HH:mm')}
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => setViewingBooking(booking)}
                                                        className="btn"
                                                        style={{ padding: '4px 8px', background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db', fontSize: '0.8rem', width: 'auto' }}
                                                    >
                                                        詳情
                                                    </button>
                                                    {booking.status === 'checked_in' && (
                                                        <button
                                                            onClick={() => handleScheduleDeparture(booking.id, booking.scheduled_departure_time?.slice(0, 5))}
                                                            className="btn"
                                                            style={{ padding: '4px 8px', color: '#2563eb', border: '1px solid #bfdbfe', background: '#eff6ff', fontSize: '0.8rem', width: 'auto' }}
                                                        >
                                                            {booking.scheduled_departure_time?.slice(0, 5) || '排定'}
                                                        </button>
                                                    )}
                                                    {booking.status === 'checked_in' && (
                                                        booking.charge_cards?.length > 0 && booking.charge_cards[0].status !== 'voided' ? (
                                                            <button
                                                                onClick={() => setChargeCardBooking(booking)}
                                                                className="btn"
                                                                style={{ padding: '4px 8px', color: '#2e7d32', border: '1px solid #a5d6a7', background: '#e8f5e9', fontSize: '0.8rem', width: 'auto' }}
                                                            >
                                                                查看收費卡
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setChargeCardBooking(booking)}
                                                                className="btn"
                                                                style={{ padding: '4px 8px', color: '#e65100', border: '1px solid #ffcc80', background: '#fff3e0', fontSize: '0.8rem', width: 'auto' }}
                                                            >
                                                                產生收費卡
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                        </>
                                    ) : linkedBooking ? (
                                        <td colSpan={5} style={{ padding: '12px', color: '#d97706' }}>
                                            轉場 (來自 {linkedBooking.time.slice(0, 5)}) - {linkedBooking.users?.display_name}
                                        </td>
                                    ) : (
                                        <td colSpan={5} style={{ padding: '12px' }}>
                                            {isHidden ? (
                                                <span style={{ fontSize: '0.8rem', color: '#dc2626' }}>此時段已對客人隱藏</span>
                                            ) : (
                                                <button
                                                    onClick={() => openManualBooking(timeStr)}
                                                    style={{ padding: '4px 10px', background: '#f3f4f6', border: '1px dashed #ccc', color: '#666', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    + 手動預約
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Manual Booking Modal */}
            {showManualModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', fontWeight: 'bold' }}>手動建立預約 ({manualData.time.slice(0, 5)})</h2>
                        <form onSubmit={handleManualSubmit}>
                            <div style={{ marginBottom: '15px', padding: '10px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '5px' }}>新增球友 (最多 4 位)</label>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                    <input
                                        className="form-input"
                                        style={{ flex: 1, marginBottom: 0 }}
                                        value={currentFriend.phone}
                                        onChange={e => setCurrentFriend({ ...currentFriend, phone: e.target.value })}
                                        onBlur={handlePhoneBlur}
                                        placeholder="手機號碼"
                                    />
                                    <button
                                        type="button"
                                        onClick={addFriendToList}
                                        className="btn"
                                        style={{ width: 'auto', background: '#3b82f6', color: 'white', border: 'none', padding: '0 15px' }}
                                    >
                                        加入
                                    </button>
                                </div>
                                <input
                                    className="form-input"
                                    style={{ width: '100%', marginBottom: '5px' }}
                                    value={currentFriend.name}
                                    onChange={e => setCurrentFriend({ ...currentFriend, name: e.target.value })}
                                    placeholder="球友人名"
                                />
                            </div>

                            {manualData.players.length > 0 && (
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '5px' }}>已加入球友:</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {manualData.players.map((p, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: '#f3f4f6', borderRadius: '4px', fontSize: '0.875rem' }}>
                                                <span>{p.name} ({p.phone})</span>
                                                <button type="button" onClick={() => removeFriendFromList(idx)} style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', padding: '2px 5px' }}>✕</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="form-group" style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '5px' }}>洞數</label>
                                <select
                                    className="form-input"
                                    value={manualData.holes}
                                    onChange={e => setManualData({ ...manualData, holes: parseInt(e.target.value) })}
                                >
                                    {/* Only show 18 holes if before 13:30 */}
                                    {(() => {
                                        const [h, m] = manualData.time.split(':').map(Number);
                                        const isLate = h > 13 || (h === 13 && m >= 30);
                                        return (
                                            <>
                                                {!isLate && <option value={18}>18洞</option>}
                                                <option value={9}>9洞</option>
                                            </>
                                        );
                                    })()}
                                </select>
                                {(() => {
                                    const [h, m] = manualData.time.split(':').map(Number);
                                    if (h > 13 || (h === 13 && m >= 30)) {
                                        return <small style={{ color: '#d97706' }}>13:30之後僅限預約9洞</small>;
                                    }
                                    return null;
                                })()}
                            </div>

                            <div style={{ display: 'flex', gap: '15px', marginTop: '25px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowManualModal(false)}
                                    className="btn"
                                    style={{ flex: 1, background: '#f3f4f6', color: '#666', border: 'none', padding: '12px 0' }}
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving || manualData.players.length === 0}
                                    className="btn btn-primary"
                                    style={{ flex: 1, padding: '12px 0' }}
                                >
                                    {isSaving ? '儲存中...' : '確認建立'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Booking Details Modal (Editable) */}
            {viewingBooking && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '450px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 15px 0', borderBottom: '2px solid #f3f4f6', paddingBottom: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>預約內容詳情</h2>
                            {viewingBooking.notes?.includes('果嶺隊預約') && (
                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', backgroundColor: '#dbeafe', color: '#1d4ed8', borderRadius: '4px', fontWeight: 'bold' }}>果嶺隊</span>
                            )}
                        </div>

                        <div style={{ display: 'grid', gap: '15px' }}>
                            <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <label style={{ fontSize: '0.75rem', color: '#666' }}>預約日期與時間</label>
                                    {!isEditMode && !isRescheduleMode && viewingBooking.status !== 'cancelled' && (
                                        <button
                                            onClick={() => openRescheduleMode(viewingBooking)}
                                            style={{ fontSize: '0.75rem', padding: '3px 10px', border: '1px solid #f59e0b', borderRadius: '4px', background: 'white', color: '#b45309', cursor: 'pointer' }}
                                        >
                                            改期
                                        </button>
                                    )}
                                </div>
                                {isRescheduleMode ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <input
                                            type="date"
                                            value={rescheduleDate}
                                            onChange={e => loadRescheduleSlots(e.target.value)}
                                            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.9rem' }}
                                        />
                                        <select
                                            value={rescheduleTime}
                                            onChange={e => setRescheduleTime(e.target.value)}
                                            style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.9rem' }}
                                        >
                                            <option value="">選擇時段</option>
                                            {rescheduleSlots.map(s => (
                                                <option key={s.time} value={s.time}>
                                                    {s.time} ({s.type})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div style={{ fontWeight: 'bold' }}>{viewingBooking.date} {viewingBooking.time.slice(0, 5)}</div>
                                )}
                            </div>

                            <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>主訂位人</label>
                                <div style={{ fontWeight: 'bold' }}>{viewingBooking.users?.display_name || viewingBooking.players_info?.[0]?.name || '-'}</div>
                                <div style={{ color: '#666' }}>{viewingBooking.users?.phone || viewingBooking.players_info?.[0]?.phone || '-'}</div>
                            </div>

                            <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <label style={{ fontSize: '0.75rem', color: '#666' }}>球友清單 (共 {isEditMode ? editingPlayers.length : viewingBooking.players_count} 位)</label>
                                    {!isEditMode && viewingBooking.status !== 'cancelled' && (
                                        <button
                                            onClick={() => openEditMode(viewingBooking)}
                                            style={{ fontSize: '0.75rem', padding: '3px 10px', border: '1px solid #3b82f6', borderRadius: '4px', background: 'white', color: '#3b82f6', cursor: 'pointer' }}
                                        >
                                            編輯
                                        </button>
                                    )}
                                </div>

                                {isEditMode ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {editingPlayers.map((p, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                <span style={{ color: '#9ca3af', fontSize: '0.8rem', width: '20px', flexShrink: 0 }}>{idx + 1}</span>
                                                <input
                                                    type="text" placeholder="姓名" value={p.name}
                                                    onChange={e => { const arr = [...editingPlayers]; arr[idx] = { ...arr[idx], name: e.target.value }; setEditingPlayers(arr); }}
                                                    style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                                                />
                                                <input
                                                    type="tel" placeholder="手機" value={p.phone}
                                                    onChange={e => { const arr = [...editingPlayers]; arr[idx] = { ...arr[idx], phone: e.target.value }; setEditingPlayers(arr); }}
                                                    style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.85rem' }}
                                                />
                                                <button
                                                    onClick={() => setEditingPlayers(editingPlayers.filter((_, i) => i !== idx))}
                                                    style={{ padding: '4px 8px', border: 'none', background: '#fee2e2', color: '#dc2626', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}
                                                >
                                                    刪除
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            onClick={() => setEditingPlayers([...editingPlayers, { name: '', phone: '' }])}
                                            style={{ padding: '6px', border: '1px dashed #9ca3af', borderRadius: '4px', background: 'white', color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem' }}
                                        >
                                            + 新增組員
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {(() => {
                                            let playerList = [];
                                            if (viewingBooking.players_info && Array.isArray(viewingBooking.players_info) && viewingBooking.players_info.length > 0) {
                                                playerList = viewingBooking.players_info;
                                            } else if (viewingBooking.notes?.includes('手動預約球友清單:')) {
                                                const lines = viewingBooking.notes.split('手動預約球友清單:\n')[1].split('\n').filter(l => l.trim());
                                                playerList = lines.map(line => {
                                                    const match = line.match(/(.+) \((.+)\)/);
                                                    return { name: match ? match[1] : line, phone: match ? match[2] : '' };
                                                });
                                            } else {
                                                playerList = [{ name: viewingBooking.users?.display_name, phone: viewingBooking.users?.phone }];
                                            }
                                            return playerList.map((p, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px 12px', borderRadius: '6px', border: '1px solid #eee' }}>
                                                    <div style={{ fontWeight: '500' }}>
                                                        <span style={{ color: '#9ca3af', marginRight: '8px' }}>{idx + 1}</span>
                                                        {p.name || '(待補)'}
                                                    </div>
                                                    <div style={{ color: '#4b5563', fontSize: '0.875rem' }}>{p.phone}</div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>洞數</label>
                                    <div style={{ fontWeight: 'bold' }}>{viewingBooking.holes}洞</div>
                                </div>
                                <div style={{ background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>狀態</label>
                                    <div style={{ fontWeight: 'bold' }}>{viewingBooking.status === 'confirmed' ? '已預約' : (viewingBooking.status === 'checked_in' ? '已報到' : '已取消')}</div>
                                </div>
                            </div>
                        </div>

                        {/* 併組區塊 - 人數不足4人時顯示 */}
                        {viewingBooking.players_count < 4 && viewingBooking.status !== 'cancelled' && !isEditMode && (() => {
                            const mergeable = getMergeableSamePeak(viewingBooking);
                            const peakLabel = getBookingPeakType(viewingBooking.time) === 'peak_a' ? 'Peak A' : getBookingPeakType(viewingBooking.time) === 'peak_b' ? 'Peak B' : '離峰';
                            return mergeable.length > 0 ? (
                                <div style={{ marginTop: '15px', padding: '12px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#92400e', marginBottom: '8px', fontWeight: 'bold' }}>
                                        同 {peakLabel} 可併組的預約
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {mergeable.map(b => {
                                            const combined = (viewingBooking.players_count || 0) + (b.players_count || 0);
                                            const canMerge = combined <= 4;
                                            return (
                                                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #eee' }}>
                                                    <div style={{ fontSize: '0.85rem' }}>
                                                        <span style={{ fontWeight: 'bold' }}>{b.time.slice(0, 5)}</span>
                                                        <span style={{ margin: '0 6px', color: '#9ca3af' }}>|</span>
                                                        {b.players_info?.[0]?.name || b.users?.display_name || '-'}
                                                        <span style={{ color: '#6b7280', marginLeft: '4px' }}>({b.players_count}人)</span>
                                                        {!canMerge && <span style={{ color: '#dc2626', fontSize: '0.75rem', marginLeft: '4px' }}>合計{combined}人超過4人</span>}
                                                    </div>
                                                    <button
                                                        onClick={() => handleMergeGroups(viewingBooking, b)}
                                                        disabled={!canMerge}
                                                        style={{
                                                            padding: '3px 10px', fontSize: '0.75rem', borderRadius: '4px', cursor: canMerge ? 'pointer' : 'not-allowed',
                                                            border: canMerge ? '1px solid #f59e0b' : '1px solid #d1d5db',
                                                            background: canMerge ? '#fef3c7' : '#f3f4f6',
                                                            color: canMerge ? '#92400e' : '#9ca3af',
                                                            fontWeight: 'bold'
                                                        }}
                                                    >
                                                        併組
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ marginTop: '15px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', fontSize: '0.8rem', color: '#9ca3af' }}>
                                    同 {peakLabel} 目前無其他不足 4 人的組別可併組
                                </div>
                            );
                        })()}

                        <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {isEditMode ? (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setIsEditMode(false)}
                                        className="btn"
                                        style={{ flex: 1, padding: '12px 0', backgroundColor: '#e5e7eb', color: '#374151' }}
                                    >
                                        取消編輯
                                    </button>
                                    <button
                                        onClick={saveEditedPlayers}
                                        className="btn btn-primary"
                                        style={{ flex: 1, padding: '12px 0' }}
                                        disabled={isSavingEdit}
                                    >
                                        {isSavingEdit ? '儲存中...' : '儲存變更'}
                                    </button>
                                </div>
                            ) : isRescheduleMode ? (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => setIsRescheduleMode(false)}
                                        className="btn"
                                        style={{ flex: 1, padding: '12px 0', backgroundColor: '#e5e7eb', color: '#374151' }}
                                    >
                                        取消改期
                                    </button>
                                    <button
                                        onClick={saveReschedule}
                                        className="btn"
                                        style={{ flex: 1, padding: '12px 0', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                        disabled={isSavingReschedule || !rescheduleTime}
                                    >
                                        {isSavingReschedule ? '改期中...' : '確認改期'}
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {viewingBooking.status !== 'cancelled' && (
                                        <button
                                            onClick={handleAdminCancel}
                                            className="btn"
                                            style={{ flex: 1, padding: '12px 0', backgroundColor: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                                            disabled={isCancelling}
                                        >
                                            {isCancelling ? '取消中...' : '代客取消'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setViewingBooking(null); setIsEditMode(false); setIsRescheduleMode(false); }}
                                        className="btn btn-primary"
                                        style={{ flex: 1, padding: '12px 0' }}
                                    >
                                        關閉內容
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 果嶺隊預約 Modal */}
            {showGroupModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '450px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ margin: '0 0 15px 0', fontSize: '1.25rem', fontWeight: 'bold', borderBottom: '2px solid #dbeafe', paddingBottom: '10px', color: '#1d4ed8' }}>果嶺隊預約</h2>
                        <form onSubmit={handleGroupSubmit}>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>開球時間 *</label>
                                    <select
                                        value={groupData.time}
                                        onChange={e => setGroupData({ ...groupData, time: e.target.value })}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                    >
                                        <option value="">選擇時間</option>
                                        {slots.map(slot => {
                                            const t = format(slot, 'HH:mm');
                                            return <option key={t} value={t}>{t}</option>;
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>總人數 * (1~100)</label>
                                    <input
                                        type="number" min="1" max="100"
                                        value={groupData.totalPlayers}
                                        onChange={e => setGroupData({ ...groupData, totalPlayers: e.target.value })}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', boxSizing: 'border-box' }}
                                        placeholder="輸入人數"
                                    />
                                    {groupData.totalPlayers > 0 && (
                                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#3b82f6' }}>
                                            將自動分為 {Math.ceil(groupData.totalPlayers / 4)} 組，從 {groupData.time || '--:--'} 開始每 5 分鐘一組
                                        </p>
                                    )}
                                </div>
                                <div style={{ background: '#f0f9ff', padding: '12px', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: '#0369a1', marginBottom: '8px', fontWeight: 'bold' }}>領隊資訊 *</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text" placeholder="領隊姓名"
                                            value={groupData.leaderName}
                                            onChange={e => setGroupData({ ...groupData, leaderName: e.target.value })}
                                            style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                        />
                                        <input
                                            type="tel" placeholder="手機號碼"
                                            value={groupData.leaderPhone}
                                            onChange={e => setGroupData({ ...groupData, leaderPhone: e.target.value })}
                                            style={{ flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>洞數</label>
                                        <select
                                            value={groupData.holes}
                                            onChange={e => setGroupData({ ...groupData, holes: Number(e.target.value) })}
                                            style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                                        >
                                            <option value={18}>18 洞</option>
                                            <option value={9}>9 洞</option>
                                        </select>
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', paddingBottom: '8px' }}>
                                        <input type="checkbox" checked={groupData.needsCart} onChange={e => setGroupData({ ...groupData, needsCart: e.target.checked })} />
                                        <span style={{ fontSize: '0.85rem' }}>球車</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', paddingBottom: '8px' }}>
                                        <input type="checkbox" checked={groupData.needsCaddie} onChange={e => setGroupData({ ...groupData, needsCaddie: e.target.checked })} />
                                        <span style={{ fontSize: '0.85rem' }}>桿弟</span>
                                    </label>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e', background: '#fef3c7', padding: '8px 10px', borderRadius: '6px' }}>
                                    隊員名單可在建立後透過「詳情 &gt; 編輯」逐組補填
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                                <button type="button" onClick={() => setShowGroupModal(false)} className="btn" style={{ flex: 1, padding: '12px 0', backgroundColor: '#e5e7eb', color: '#374151' }}>取消</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '12px 0' }} disabled={isSavingGroup}>
                                    {isSavingGroup ? '建立中...' : '確認建立'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-component: User Management (Existing)
function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Filter states
    const [filters, setFilters] = useState({
        member_no: '',
        display_name: '',
        phone: '',
        golfer_type: '',
        line_bound: ''
    });

    // Debounce timer ref
    const timerRef = useRef(null);

    useEffect(() => {
        // Debounce filter changes
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            fetchUsers();
        }, 300);
        return () => clearTimeout(timerRef.current);
    }, [filters, page]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 100 });
            if (filters.member_no) params.append('member_no', filters.member_no);
            if (filters.display_name) params.append('display_name', filters.display_name);
            if (filters.phone) params.append('phone', filters.phone);
            if (filters.golfer_type) params.append('golfer_type', filters.golfer_type);
            if (filters.line_bound) params.append('line_bound', filters.line_bound);

            const res = await adminFetch(`/api/users?${params.toString()}`);
            const data = await res.json();
            setUsers(data.users || []);
            setTotal(data.total || 0);
            setTotalPages(data.totalPages || 1);
        } catch (e) {
            console.error('Fetch users error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(1); // Reset to first page on filter change
    };

    const handleSyncUsers = async () => {
        if (!confirm('確定要執行 Google Sheets 會員資料同步嗎？這可能需要幾秒鐘。')) return;
        setLoading(true);
        try {
            const res = await adminFetch('/api/users/sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert(`同步成功！\n新增/更新: ${data.synced} 筆\n失敗: ${data.failed} 筆`);
                fetchUsers();
            } else {
                alert('同步失敗: ' + (data.message || data.error));
            }
        } catch (e) {
            alert('同步請求錯誤: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const golferTypes = ['白金會員', '社區會員', 'VIP-A', '一桿進洞', '金卡會員', '來賓'];

    return (
        <div className="card animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                <h2 className="title" style={{ fontSize: '1.2rem', marginBottom: 0 }}>平台用戶管理 ({total})</h2>
                <button
                    onClick={handleSyncUsers}
                    className="btn"
                    disabled={loading}
                    style={{ width: 'auto', background: '#0d9488', color: 'white', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                    {loading ? '處理中...' : '🔄 同步會員資料'}
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '15px', padding: '15px', background: '#f9fafb', borderRadius: '8px' }}>
                <input
                    type="text"
                    placeholder="🔍 會員編號"
                    value={filters.member_no}
                    onChange={e => handleFilterChange('member_no', e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
                />
                <input
                    type="text"
                    placeholder="🔍 名稱"
                    value={filters.display_name}
                    onChange={e => handleFilterChange('display_name', e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
                />
                <input
                    type="text"
                    placeholder="🔍 電話"
                    value={filters.phone}
                    onChange={e => handleFilterChange('phone', e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
                />
                <select
                    value={filters.golfer_type}
                    onChange={e => handleFilterChange('golfer_type', e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', background: 'white' }}
                >
                    <option value="">全部擊球身分</option>
                    {golferTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select
                    value={filters.line_bound}
                    onChange={e => handleFilterChange('line_bound', e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', background: 'white' }}
                >
                    <option value="">全部 LINE 狀態</option>
                    <option value="true">已綁定</option>
                    <option value="false">未綁定</option>
                </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                            <th style={{ padding: '10px' }}>會員編號</th>
                            <th style={{ padding: '10px' }}>名稱</th>
                            <th style={{ padding: '10px' }}>電話</th>
                            <th style={{ padding: '10px' }}>擊球身分</th>
                            <th style={{ padding: '10px' }}>有效日期</th>
                            <th style={{ padding: '10px' }}>LINE ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>載入中...</td></tr>
                        ) : users.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>無符合條件的用戶</td></tr>
                        ) : users.map(u => (
                            <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '10px', color: '#666' }}>{u.member_no || '-'}</td>
                                <td style={{ padding: '10px', fontWeight: 'bold' }}>{u.display_name || '-'}</td>
                                <td style={{ padding: '10px' }}>{u.phone}</td>
                                <td style={{ padding: '10px' }}>
                                    {u.golfer_type && <span style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85rem' }}>{u.golfer_type}</span>}
                                </td>
                                <td style={{ padding: '10px', fontSize: '0.9rem', color: u.member_valid_until && new Date(u.member_valid_until) < new Date() ? 'red' : 'inherit' }}>
                                    {u.member_valid_until || '-'}
                                </td>
                                <td style={{ padding: '10px', fontSize: '0.8rem', color: '#666' }}>
                                    {u.line_user_id ? '✅ 已綁定' : '未綁定'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px', padding: '10px' }}>
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', background: page <= 1 ? '#f3f4f6' : 'white', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                >
                    ← 上一頁
                </button>
                <span style={{ fontSize: '0.9rem', color: '#666' }}>
                    第 {page} / {totalPages} 頁 (共 {total} 筆)
                </span>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    style={{ padding: '8px 16px', border: '1px solid #ddd', borderRadius: '6px', background: page >= totalPages ? '#f3f4f6' : 'white', cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
                >
                    下一頁 →
                </button>
            </div>
        </div>
    );
}

// Sub-component: Admin Management (RBAC)
function AdminManagement() {
    const [admins, setAdmins] = useState([]);
    const [roles, setRoles] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [newAdmin, setNewAdmin] = useState({ name: '', username: '', password: '', role: 'starter' });
    const [error, setError] = useState('');

    useEffect(() => {
        fetchAdmins();
        fetchRoles();
    }, []);

    const fetchAdmins = async () => {
        try {
            const res = await adminFetch('/api/admin/list');
            const data = await res.json();
            setAdmins(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('載入管理員失敗:', err);
        }
    };

    const fetchRoles = async () => {
        try {
            const res = await adminFetch('/api/roles');
            const data = await res.json();
            setRoles(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('載入角色失敗:', err);
        }
    };

    const handleAddAdmin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const res = await adminFetch('/api/admin/create', {
                method: 'POST',
                body: JSON.stringify(newAdmin),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '新增失敗');
            alert('新增成功');
            setShowForm(false);
            setNewAdmin({ name: '', username: '', password: '', role: 'starter' });
            fetchAdmins();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('確定刪除此管理員？')) return;
        try {
            const res = await adminFetch(`/api/admin/${id}`, { method: 'DELETE' });
            if (res.ok) fetchAdmins();
            else {
                const data = await res.json();
                alert(data.error || '刪除失敗');
            }
        } catch (err) {
            alert('刪除失敗');
        }
    };

    const handleRoleChange = async (adminId, newRole) => {
        try {
            const res = await adminFetch(`/api/admin/${adminId}`, {
                method: 'PUT',
                body: JSON.stringify({ role: newRole }),
            });
            if (res.ok) fetchAdmins();
        } catch (err) {
            alert('更新角色失敗');
        }
    };

    const getRoleLabel = (roleName) => {
        const role = roles.find(r => r.name === roleName);
        return role ? role.label : roleName;
    };

    return (
        <div className="card animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <h2 className="title" style={{ fontSize: '1.2rem' }}>後台管理員 ({admins.length})</h2>
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => { setShowForm(!showForm); setError(''); }}>
                    {showForm ? '取消' : '+ 新增管理員'}
                </button>
            </div>
            {showForm && (
                <form onSubmit={handleAddAdmin} style={{ marginBottom: '20px', padding: '15px', background: '#f9fafb', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>名稱</label>
                            <input className="form-input" required value={newAdmin.name} onChange={e => setNewAdmin({ ...newAdmin, name: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>帳號 (Email/手機)</label>
                            <input className="form-input" required value={newAdmin.username} onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>密碼</label>
                            <input className="form-input" type="password" required value={newAdmin.password} onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })} />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label>角色</label>
                            <select className="form-input" value={newAdmin.role} onChange={e => setNewAdmin({ ...newAdmin, role: e.target.value })}>
                                {roles.map(r => (
                                    <option key={r.name} value={r.name}>{r.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {error && <p style={{ color: 'red', margin: '0 0 8px', fontSize: '13px' }}>{error}</p>}
                    <button className="btn btn-primary">確認新增</button>
                </form>
            )}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd', background: '#f5f5f5' }}>
                            <th style={{ padding: '10px' }}>名稱</th>
                            <th style={{ padding: '10px' }}>帳號</th>
                            <th style={{ padding: '10px' }}>角色</th>
                            <th style={{ padding: '10px' }}>建立時間</th>
                            <th style={{ padding: '10px' }}>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {admins.map(a => (
                            <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '10px' }}>{a.name}</td>
                                <td style={{ padding: '10px' }}>{a.username}</td>
                                <td style={{ padding: '10px' }}>
                                    <select
                                        value={a.role || 'super_admin'}
                                        onChange={e => handleRoleChange(a.id, e.target.value)}
                                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '13px' }}
                                    >
                                        {roles.map(r => (
                                            <option key={r.name} value={r.name}>{r.label}</option>
                                        ))}
                                    </select>
                                </td>
                                <td style={{ padding: '10px', fontSize: '0.8rem' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                                <td style={{ padding: '10px' }}>
                                    {a.username !== 'admin' && (
                                        <button onClick={() => handleDelete(a.id)} style={{
                                            padding: '4px 12px', borderRadius: '4px', border: '1px solid #c62828',
                                            background: '#ffebee', color: '#c62828', cursor: 'pointer', fontSize: '12px'
                                        }}>刪除</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 角色權限設定 */}
            <RolePermissionManager roles={roles} onRolesChanged={fetchRoles} />
        </div>
    );
}

export function AdminDashboard() {
    const permissions = getAdminPermissions();
    const adminInfo = getAdminInfo();
    const visibleTabs = ALL_TABS.filter(tab => permissions.includes(tab.key));
    const defaultTab = visibleTabs.length > 0 ? visibleTabs[0].key : 'starter';

    const [activeTab, setActiveTab] = useState(defaultTab);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [chargeCardBooking, setChargeCardBooking] = useState(null);
    const [systemSettings, setSystemSettings] = useState(null);

    // 載入系統設定（營運時間、間隔等）
    useEffect(() => {
        document.title = '出發台管理';
        const fetchSettings = async () => {
            try {
                const res = await adminFetch('/api/settings');
                if (res.ok) {
                    const data = await res.json();
                    setSystemSettings(data);
                }
            } catch (err) {
                console.error('載入系統設定失敗:', err);
            }
        };
        fetchSettings();
    }, []);

    useEffect(() => {
        if (['starter', 'checkin_list', 'departure_list'].includes(activeTab)) fetchBookings();
    }, [selectedDate, activeTab]);

    const fetchBookings = async () => {
        setLoading(true);
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const { data } = await supabase.from('bookings').select('*, users(display_name, phone, golfer_type, line_user_id, member_no), charge_cards(id, status)').eq('date', dateStr);
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
        clearAdminSession();
        window.location.href = '/admin/login';
    };

    const isSuperAdmin = adminInfo?.role === 'super_admin';

    return (
        <div className="container" style={{ maxWidth: '900px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 className="title" style={{ marginBottom: 0 }}>高爾夫後台系統</h1>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {adminInfo && <span style={{ fontSize: '13px', color: '#6b7280' }}>{adminInfo.name}</span>}
                    {isSuperAdmin && <button onClick={handleResetDatabase} style={{ backgroundColor: '#fca5a5', border: 'none', padding: '5px 10px', borderRadius: '4px', color: '#7f1d1d', cursor: 'pointer', fontSize: '0.75rem' }}>清空 DB</button>}
                    <button onClick={handleLogout} className="btn" style={{ width: 'auto', padding: '6px 12px', background: '#4b5563', color: 'white' }}>登出</button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e5e7eb', overflowX: 'auto' }}>
                {visibleTabs.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={getTabStyle(activeTab === tab.key)}>{tab.label}</button>
                ))}
            </div>

            {/* Content */}
            {activeTab === 'starter' && <StarterDashboard selectedDate={selectedDate} setSelectedDate={setSelectedDate} bookings={bookings} fetchBookings={fetchBookings} setChargeCardBooking={setChargeCardBooking} systemSettings={systemSettings} />}
            {activeTab === 'scan' && <QRScannerTab />}
            {activeTab === 'checkin_list' && <CheckInList bookings={bookings} selectedDate={selectedDate} />}
            {activeTab === 'departure_list' && <DepartureList bookings={bookings} selectedDate={selectedDate} />}
            {activeTab === 'vouchers' && <VoucherManagement />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'admins' && <AdminManagement />}
            {activeTab === 'waitlist' && <WaitlistMonitor />}
            {activeTab === 'settings' && <AdminSettings />}
            {activeTab === 'operational_calendar' && <OperationalCalendar />}
            {activeTab === 'rate_management' && <RateManagement />}
            {activeTab === 'caddy_management' && <CaddyManagement />}

            {/* 收費卡彈窗 */}
            {chargeCardBooking && (
                <ChargeCardModal
                    booking={chargeCardBooking}
                    onClose={() => setChargeCardBooking(null)}
                    onGenerated={() => fetchBookings()}
                />
            )}
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
