/**
 * 營運日曆組件 - 前端實作範本
 *
 * 功能：
 * 1. 月曆視圖顯示營運狀態
 * 2. 單日編輯（側邊欄）
 * 3. 批次設定
 * 4. 衝突檢查與通知
 *
 * 依賴：
 * - npm install react-big-calendar date-fns
 * - 或使用 @fullcalendar/react
 */

import React, { useState, useEffect } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import zhTW from 'date-fns/locale/zh-TW';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { adminFetch } from '../utils/adminApi';

// Date-fns localizer
const locales = { 'zh-TW': zhTW };
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

// ============= 共用函數 =============
const getStatusLabel = (status) => {
    const labels = {
        normal: '正常營業',
        closed: '休場',
        emergency_closed: '臨時關閉'
    };
    return labels[status] || status;
};

// ============= 主組件 =============
export function OperationalCalendar() {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [calendarData, setCalendarData] = useState([]);
    const [selectedDates, setSelectedDates] = useState([]);
    const [showEditDrawer, setShowEditDrawer] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [loading, setLoading] = useState(false);

    // 載入該月營運日曆資料
    useEffect(() => {
        loadMonthCalendar(currentMonth);
    }, [currentMonth]);

    const loadMonthCalendar = async (month) => {
        setLoading(true);
        try {
            const start = format(startOfMonth(month), 'yyyy-MM-dd');
            const end = format(endOfMonth(month), 'yyyy-MM-dd');

            const res = await adminFetch(`/api/calendar/overrides?start=${start}&end=${end}`);
            const data = await res.json();

            // 轉換為日曆事件格式
            const events = data.map(override => {
                let title = getStatusLabel(override.status);

                // 加上額外資訊讓標記更明顯
                if (override.custom_start_time) {
                    title += ` (${override.custom_start_time})`;
                }
                if (override.closure_reason) {
                    title += ` - ${override.closure_reason}`;
                }

                return {
                    id: override.id,
                    title,
                    start: new Date(override.date),
                    end: new Date(override.date),
                    allDay: true,
                    resource: override, // 儲存完整資料
                };
            });

            setCalendarData(events);
        } catch (error) {
            console.error('載入日曆失敗:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSlot = ({ slots }) => {
        setSelectedDates(slots);
        setShowEditDrawer(true);
    };

    const handleSelectEvent = (event) => {
        setSelectedDates([event.start]);
        setShowEditDrawer(true);
    };

    // 自定義事件樣式
    const eventStyleGetter = (event) => {
        const override = event.resource;
        let backgroundColor = '#10b981'; // 綠色 - 正常

        if (override.status === 'closed') {
            backgroundColor = '#ef4444'; // 紅色 - 休場
        } else if (override.status === 'emergency_closed') {
            backgroundColor = '#6b7280'; // 灰色 - 臨時關閉
        } else if (override.custom_start_time || override.custom_interval) {
            backgroundColor = '#f59e0b'; // 黃色 - 有異動
        }

        return {
            style: {
                backgroundColor,
                borderRadius: '4px',
                opacity: 0.8,
                color: 'white',
                border: '0px',
                display: 'block',
            }
        };
    };

    return (
        <div className="operational-calendar-container">
            {/* 標題與快速操作區 */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">營運日曆管理</h2>
                <button
                    onClick={() => setShowBatchModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    📝 批次設定
                </button>
            </div>

            {/* 快速操作卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <QuickActionCard
                    title="批次休場設定"
                    icon="🚫"
                    description="快速設定多日休場"
                    onClick={() => setShowBatchModal(true)}
                />
                <QuickActionCard
                    title="批次自定義設定"
                    icon="📅"
                    description="選擇日期區間，自定義營運設定"
                    onClick={() => setShowBatchModal(true)}
                />
                <StatCard
                    title="本月營業天數"
                    value="28 天"
                    subtitle="休場: 2 天"
                />
            </div>

            {/* 日曆主體 */}
            <div className="bg-white rounded-lg shadow p-6">
                {loading && <div className="text-center py-4">載入中...</div>}

                <BigCalendar
                    localizer={localizer}
                    events={calendarData}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: 600 }}
                    onSelectSlot={handleSelectSlot}
                    onSelectEvent={handleSelectEvent}
                    selectable
                    eventPropGetter={eventStyleGetter}
                    culture="zh-TW"
                    messages={{
                        next: "下個月",
                        previous: "上個月",
                        today: "今天",
                        month: "月",
                        week: "週",
                        day: "日"
                    }}
                />

                {/* 圖例 */}
                <div className="mt-4 flex gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-green-500"></div>
                        <span>正常營業</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-yellow-500"></div>
                        <span>有異動設定</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-red-500"></div>
                        <span>休場</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded bg-gray-500"></div>
                        <span>臨時關閉</span>
                    </div>
                </div>
            </div>

            {/* 單日編輯側邊欄 */}
            {showEditDrawer && (
                <DateEditDrawer
                    dates={selectedDates}
                    onClose={() => setShowEditDrawer(false)}
                    onSave={() => {
                        setShowEditDrawer(false);
                        loadMonthCalendar(currentMonth);
                    }}
                />
            )}

            {/* 批次設定對話框 */}
            {showBatchModal && (
                <BatchSettingsModal
                    onClose={() => setShowBatchModal(false)}
                    onSave={() => {
                        setShowBatchModal(false);
                        loadMonthCalendar(currentMonth);
                    }}
                />
            )}
        </div>
    );
}

// ============= 子組件 =============

function QuickActionCard({ title, icon, description, onClick }) {
    return (
        <div
            onClick={onClick}
            className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition"
        >
            <div className="text-2xl mb-2">{icon}</div>
            <h3 className="font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
        </div>
    );
}

function StatCard({ title, value, subtitle }) {
    return (
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow p-4 text-white">
            <h3 className="text-sm opacity-90">{title}</h3>
            <p className="text-3xl font-bold mt-2">{value}</p>
            <p className="text-sm opacity-75 mt-1">{subtitle}</p>
        </div>
    );
}

// ============= 單日/多日編輯側邊欄 =============
function DateEditDrawer({ dates, onClose, onSave }) {
    const isMultiple = dates.length > 1;
    const [formData, setFormData] = useState({
        status: 'normal',
        custom_start_time: '',
        closure_reason: '',
        notes: ''
    });
    const [conflicts, setConflicts] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isMultiple) {
            loadDateSettings(dates[0]);
            checkConflicts(dates[0]);
        }
    }, [dates]);

    const loadDateSettings = async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        try {
            const res = await adminFetch(`/api/calendar/override/${dateStr}`);
            if (res.ok) {
                const data = await res.json();
                setFormData(data);
            }
        } catch (error) {
            console.error('載入設定失敗:', error);
        }
    };

    const checkConflicts = async (date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        try {
            const res = await adminFetch(`/api/calendar/conflicts/${dateStr}`);
            const data = await res.json();
            setConflicts(data);
        } catch (error) {
            console.error('衝突檢查失敗:', error);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const errors = [];

            for (const date of dates) {
                const dateStr = format(date, 'yyyy-MM-dd');

                const res = await adminFetch('/api/calendar/override', {
                    method: 'POST',
                    body: JSON.stringify({
                        date: dateStr,
                        ...formData
                    })
                });

                if (!res.ok) {
                    const result = await res.json();
                    errors.push(`${dateStr}: ${result.error || '儲存失敗'}`);
                }
            }

            if (errors.length > 0) {
                throw new Error(errors.join('\n'));
            }

            const dateRange = isMultiple
                ? `${format(dates[0], 'yyyy-MM-dd')} ~ ${format(dates[dates.length - 1], 'yyyy-MM-dd')} (共 ${dates.length} 天)`
                : format(dates[0], 'yyyy-MM-dd');

            alert(`✅ 設定已儲存\n日期: ${dateRange}\n狀態: ${getStatusLabel(formData.status)}`);
            onSave();
        } catch (error) {
            console.error('儲存失敗:', error);
            alert(`❌ 儲存失敗\n錯誤: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-end z-50">
            <div className="bg-white w-96 h-full overflow-y-auto shadow-xl">
                <div className="p-6">
                    {/* 標題 */}
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold">
                            📅 {isMultiple
                                ? `${format(dates[0], 'MM/dd')} ~ ${format(dates[dates.length - 1], 'MM/dd')} (共 ${dates.length} 天)`
                                : `${format(dates[0], 'yyyy年MM月dd日')} (${format(dates[0], 'EEEE', { locale: zhTW })})`
                            }
                        </h3>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                            ✕
                        </button>
                    </div>

                    {/* 營運狀態 */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            營運狀態
                        </label>
                        <div className="space-y-2">
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="normal"
                                    checked={formData.status === 'normal'}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="mr-2"
                                />
                                正常營業（套用全域範本）
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="closed"
                                    checked={formData.status === 'closed'}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="mr-2"
                                />
                                休場
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="emergency_closed"
                                    checked={formData.status === 'emergency_closed'}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="mr-2"
                                />
                                臨時關閉
                            </label>
                        </div>
                    </div>

                    {/* 休場原因 */}
                    {(formData.status === 'closed' || formData.status === 'emergency_closed') && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                關閉原因
                            </label>
                            <select
                                value={formData.closure_reason || ''}
                                onChange={(e) => setFormData({ ...formData, closure_reason: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                                <option value="">請選擇...</option>
                                <option value="球場維護">球場維護</option>
                                <option value="比賽包場">比賽包場</option>
                                <option value="天氣因素">天氣因素</option>
                                <option value="設施檢修">設施檢修</option>
                                <option value="其他">其他</option>
                            </select>

                            {/* 衝突警告 */}
                            {conflicts?.hasConflicts && (
                                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-sm text-yellow-800">
                                        ⚠️ 此日已有 {conflicts.count} 筆預約
                                    </p>
                                    <button className="text-sm text-blue-600 hover:underline mt-2">
                                        查看受影響預約名單
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 時間覆蓋 */}
                    {formData.status === 'normal' && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                時間覆蓋設定
                            </label>
                            <div className="space-y-3">
                                <div>
                                    <label className="flex items-center mb-1">
                                        <input
                                            type="checkbox"
                                            className="mr-2"
                                            onChange={(e) => {
                                                if (!e.target.checked) {
                                                    setFormData({ ...formData, custom_start_time: null });
                                                }
                                            }}
                                        />
                                        <span className="text-sm">自定義開始時間</span>
                                    </label>
                                    <input
                                        type="time"
                                        value={formData.custom_start_time || ''}
                                        onChange={(e) => setFormData({ ...formData, custom_start_time: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 備註 */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            管理備註
                        </label>
                        <textarea
                            value={formData.notes || ''}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            rows="3"
                            placeholder="例如：球場9號洞整修..."
                        />
                    </div>

                    {/* 按鈕 */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? '儲存中...' : '儲存設定'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============= 批次設定對話框 =============
function BatchSettingsModal({ onClose, onSave }) {
    const [formData, setFormData] = useState({
        start_date: '',
        end_date: '',
        operation_type: 'bulk_close',
        exclude_weekdays: []
    });

    const handleSave = async () => {
        try {
            const res = await adminFetch('/api/calendar/batch', {
                method: 'POST',
                body: JSON.stringify(formData)
            });

            const result = await res.json();

            if (res.ok) {
                alert(`✅ 批次設定成功\n影響日期數: ${result.affectedCount || 0} 個\n${result.message || ''}`);
                onSave(); // 重新載入日曆資料
            } else {
                throw new Error(result.error || '批次設定失敗');
            }
        } catch (error) {
            console.error('批次設定失敗:', error);
            alert(`❌ 批次設定失敗\n錯誤: ${error.message}`);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4">📝 批次設定營運日曆</h3>

                {/* 表單內容 - 簡化版本 */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            開始日期
                        </label>
                        <input
                            type="date"
                            value={formData.start_date}
                            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            結束日期
                        </label>
                        <input
                            type="date"
                            value={formData.end_date}
                            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                    </div>

                    {/* 操作類型 */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            操作類型
                        </label>
                        <select
                            value={formData.operation_type}
                            onChange={(e) => setFormData({ ...formData, operation_type: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        >
                            <option value="bulk_close">批次設為休場</option>
                            <option value="bulk_override">批次自定義設定</option>
                            <option value="apply_template">套用全域範本</option>
                        </select>
                    </div>
                </div>

                {/* 按鈕 */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        執行批次設定
                    </button>
                </div>
            </div>
        </div>
    );
}

export default OperationalCalendar;
