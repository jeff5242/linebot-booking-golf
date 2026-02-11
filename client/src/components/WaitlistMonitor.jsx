import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { format, differenceInMinutes, parseISO } from 'date-fns';

export function WaitlistMonitor() {
    const [waitlist, setWaitlist] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    useEffect(() => {
        fetchWaitlist();

        // Setup Realtime Subscription
        const channel = supabase
            .channel('waitlist_changes')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'waitlist' },
                (payload) => {
                    console.log('Realtime update:', payload);
                    fetchWaitlist(); // Simple refresh for now
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [selectedDate]);

    const fetchWaitlist = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('waitlist')
            .select('*, users(display_name, phone)')
            .eq('date', selectedDate)
            .order('created_at', { ascending: true });

        if (data) setWaitlist(data);
        setLoading(false);
    };

    const handleSkip = async (id) => {
        if (!confirm('確定要跳過此候補嗎？')) return;
        await supabase.from('waitlist').update({ status: 'expired' }).eq('id', id);
        fetchWaitlist();
    };

    const handleForceConfirm = async (item) => {
        if (!confirm(`確定要將 ${item.users?.display_name} 轉為正式預約嗎？`)) return;

        // 1. Create Booking
        const { error: bookingError } = await supabase.from('bookings').insert([{
            user_id: item.user_id,
            date: item.date,
            time: item.desired_time_start, // Assign start of window for simplicity, or ask input? Assumed.
            holes: 18,
            players_count: item.players_count,
            status: 'confirmed'
        }]);

        if (bookingError) return alert('建立預約失敗: ' + bookingError.message);

        // 2. Update Waitlist Status
        await supabase.from('waitlist').update({ status: 'confirmed' }).eq('id', item.id);

        alert('轉正成功！');
        fetchWaitlist();
    };

    return (
        <div className="card animate-fade-in p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="title">候補監控 (HOP Monitor)</h2>
                <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="form-input w-40"
                />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50 text-left">
                            <th className="p-3 text-sm font-semibold text-gray-600">順位</th>
                            <th className="p-3 text-sm font-semibold text-gray-600">用戶</th>
                            <th className="p-3 text-sm font-semibold text-gray-600">期望時段</th>
                            <th className="p-3 text-sm font-semibold text-gray-600">人數</th>
                            <th className="p-3 text-sm font-semibold text-gray-600">狀態</th>
                            <th className="p-3 text-sm font-semibold text-gray-600">鎖定倒數</th>
                            <th className="p-3 text-sm font-semibold text-gray-600">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {waitlist.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-gray-400">目前無候補名單</td></tr>
                        ) : waitlist.map((item, index) => {
                            const isLocked = item.status === 'notified';
                            let timeLeftStr = '-';

                            if (isLocked && item.lock_expiry) {
                                const expiry = parseISO(item.lock_expiry);
                                const now = new Date();
                                const diff = differenceInMinutes(expiry, now);
                                if (diff > 0) {
                                    const h = Math.floor(diff / 60);
                                    const m = diff % 60;
                                    timeLeftStr = `${h}h ${m}m`;
                                } else {
                                    timeLeftStr = '已過期';
                                }
                            }

                            return (
                                <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="p-3 font-medium text-gray-500">#{index + 1}</td>
                                    <td className="p-3">
                                        <div className="font-bold text-gray-800">{item.users?.display_name}</div>
                                        <div className="text-xs text-gray-500">{item.users?.phone}</div>
                                    </td>
                                    <td className="p-3 text-gray-700 font-mono">
                                        {item.desired_time_start?.slice(0, 5)} - {item.desired_time_end?.slice(0, 5)}
                                    </td>
                                    <td className="p-3 text-gray-700">{item.players_count}</td>
                                    <td className="p-3">
                                        <Badge status={item.status} />
                                    </td>
                                    <td className="p-3 font-mono text-red-600 font-bold">
                                        {timeLeftStr}
                                    </td>
                                    <td className="p-3">
                                        {item.status === 'queued' && (
                                            <button onClick={() => handleForceConfirm(item)} className="btn text-xs px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 mr-2">
                                                強制轉正
                                            </button>
                                        )}
                                        {item.status === 'notified' && (
                                            <button onClick={() => handleSkip(item.id)} className="btn text-xs px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200">
                                                跳過 (Skip)
                                            </button>
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

function Badge({ status }) {
    const styles = {
        queued: 'bg-yellow-100 text-yellow-800',
        notified: 'bg-purple-100 text-purple-800 border-purple-300 border animate-pulse',
        confirmed: 'bg-green-100 text-green-800',
        expired: 'bg-gray-100 text-gray-400',
        cancelled: 'bg-red-50 text-red-400'
    };
    const label = {
        queued: '排隊中',
        notified: '已通知 (鎖定)',
        confirmed: '已轉正',
        expired: '已過期',
        cancelled: '已取消'
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${styles[status] || styles.queued}`}>
            {label[status] || status}
        </span>
    );
}
