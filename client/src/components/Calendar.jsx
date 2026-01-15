import React, { useRef } from 'react';
import { format, addDays, startOfToday, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';

export function Calendar({ selectedDate, onSelectDate }) {
    const dateInputRef = useRef(null);

    // Logic: Show a sliding window around selected date or just the selected date's week?
    // User asked for "switching functionality". 
    // Let's keep the horizontal strip but centered/focused on selected date, 
    // AND add a calendar icon to pick any date.

    // Let's generate days based on selectedDate to ensure it's visible.
    // Showing 7 days before and 7 days after selected date to give context
    // OR just always start from today if the requirement is "booking future". 
    // Usually golf booking is future only.

    const today = startOfToday();
    // Logic: Show 7 days before and 7 days after selected date
    const days = Array.from({ length: 15 }, (_, i) => addDays(addDays(selectedDate, -7), i));

    const handleDateChange = (e) => {
        if (e.target.value) {
            onSelectDate(new Date(e.target.value));
        }
    };

    return (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', padding: '0 4px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                    {format(selectedDate, 'yyyy年 M月', { locale: zhTW })}
                </h2>

                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => dateInputRef.current.showPicker()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            border: '1px solid #e5e7eb',
                            background: 'white',
                            fontSize: '0.9rem',
                            cursor: 'pointer'
                        }}
                    >
                        <CalendarIcon size={16} />
                        <span>切換日期</span>
                    </button>

                    <input
                        ref={dateInputRef}
                        type="date"
                        style={{
                            position: 'absolute',
                            opacity: 0,
                            top: '100%',
                            right: 0,
                            pointerEvents: 'none', // Managed by button click usually, or needs pointer-events auto if clicking directly.
                            // showPicker() works on modern browsers.
                            // Fallback: make it cover the button with opacity 0 if showPicker not supported?
                            // Let's rely on showPicker or just visibility hidden but clickable.
                            visibility: 'hidden'
                        }}
                        value={format(selectedDate, 'yyyy-MM-dd')}
                        onChange={handleDateChange}
                        min={format(today, 'yyyy-MM-dd')}
                    />
                </div>
            </div>

            <div style={{
                display: 'flex',
                overflowX: 'auto',
                gap: '8px',
                padding: '4px 0 10px 0',
                scrollbarWidth: 'none' /* Firefox */
            }} className="no-scrollbar">
                {days.map(date => {
                    const isSelected = isSameDay(date, selectedDate);
                    return (
                        <button
                            key={date.toISOString()}
                            onClick={() => onSelectDate(date)}
                            style={{
                                minWidth: '60px',
                                padding: '10px 4px',
                                borderRadius: '12px',
                                border: isSelected ? '2px solid var(--primary-color)' : '1px solid #e5e7eb',
                                backgroundColor: isSelected ? 'var(--primary-color)' : 'white',
                                color: isSelected ? 'white' : 'var(--secondary-color)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                cursor: 'pointer',
                                flexShrink: 0,
                                boxShadow: isSelected ? '0 4px 6px -1px rgba(46, 125, 50, 0.2)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                {format(date, 'EEE', { locale: zhTW })}
                            </span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                                {format(date, 'd')}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
