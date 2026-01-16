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

    // Auto-scroll to selected date
                const scrollContainerRef = useRef(null);
    
    React.useEffect(() => {
        if (scrollContainerRef.current) {
            // Calculate center position
            // Each item is min-width 60px + 8px gap approx = 68px
            // Selected item index is always 7 (middle of 15)
            // So we want to scroll to: (7 * itemWidth) - (containerWidth / 2) + (itemWidth / 2)
            
            const container = scrollContainerRef.current;
                const itemWidth = 68; // approximate width + gap
                const selectedIndex = 7;
                const scrollPos = (selectedIndex * itemWidth) - (container.offsetWidth / 2) + (itemWidth / 2);

                container.scrollTo({
                    left: scrollPos,
                behavior: 'smooth'
            });
        }
    }, [selectedDate]);

                return (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', padding: '0 4px' }}>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            {format(selectedDate, 'yyyy年 M月', { locale: zhTW })}
                        </h2>

                        <div style={{ position: 'relative' }}>
                            <input
                                type="date"
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '20px',
                                    border: '1px solid #e5e7eb',
                                    background: 'white',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    color: '#374151',
                                    outline: 'none',
                                    fontFamily: 'inherit'
                                }}
                                value={format(selectedDate, 'yyyy-MM-dd')}
                                onChange={handleDateChange}
                                min={format(today, 'yyyy-MM-dd')}
                            />
                        </div>
                    </div>

                    <div
                        ref={scrollContainerRef}
                        style={{
                            display: 'flex',
                            overflowX: 'auto',
                            gap: '8px',
                            padding: '4px 0 10px 0',
                            scrollbarWidth: 'none', /* Firefox */
                            msOverflowStyle: 'none'  /* IE 10+ */
                        }}
                        className="no-scrollbar"
                    >
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
