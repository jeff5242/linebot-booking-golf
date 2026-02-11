const { createClient } = require('@supabase/supabase-js');
const { getSettings } = require('./SystemSettings');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Helper: Add minutes to HH:mm string
function addMinutes(timeStr, minutes) {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    date.setMinutes(date.getMinutes() + minutes);
    return date.toTimeString().slice(0, 5);
}

// Helper: Convert HH:mm to minutes from midnight
function toMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Generate available time slots for a given date.
 * Based on Peak A and Peak B settings.
 * @param {string} date - YYYY-MM-DD
 */
async function generateTimeSlots(date) {
    const settings = await getSettings();
    const interval = parseInt(settings.interval); // 3, 5, 6, 10, 15
    const slots = [];

    // Helper to generate slots for a range
    const generateForRange = (start, end, type) => {
        let current = start;
        const endMin = toMinutes(end);

        while (toMinutes(current) < endMin) {
            slots.push({
                time: current,
                type: type, // 'Peak A', 'Peak B', 'Overflow'
                allow_matching: false // Default
            });
            current = addMinutes(current, interval);
        }
    };

    // 1. Generate Peak A
    generateForRange(settings.peak_a.start, settings.peak_a.end, 'Peak A');

    // 2. Check Overflow Logic (Only Weekdays?)
    const dayOfWeek = new Date(date).getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // Check if Peak A is full (This requires querying DB)
    // For now, we assume frontend or separate logic checks overflow flag in settings
    // But requirement says "Auto unlock 07:30 - 11:00 if Peak A full"

    // We can check if `settings.is_peak_a_overflow` is true (which might be updated by a background job or hook)
    // Or we count bookings right here.
    // Let's count bookings for Peak A to be dynamic.

    const { count: peakABookings } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('date', date)
        .gte('time', settings.peak_a.start)
        .lt('time', settings.peak_a.end)
        .neq('status', 'cancelled');

    const limitA = parseInt(settings.peak_a.max_groups) + parseInt(settings.peak_a.reserved);

    if (isWeekday && peakABookings >= limitA) {
        // Overflow triggered: Open 07:30 - 11:00
        // (Assuming 07:30 is end of Peak A, and 11:00 is before Peak B)
        generateForRange(settings.peak_a.end, '11:00', 'Overflow');
    }

    // 3. Generate Peak B
    generateForRange(settings.peak_b.start, settings.peak_b.end, 'Peak B');

    return slots;
}

/**
 * Process Waitlist (HOP Algorithm)
 * Triggered when a booking is cancelled.
 * @param {string} cancelledBookingId 
 */
async function processWaitlist(cancelledBookingId) {
    // 1. Get cancelled booking details
    const { data: booking } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', cancelledBookingId)
        .single();

    if (!booking) return;

    console.log(`[HOP] Processing cancellation for ${booking.date} ${booking.time}`);

    // 2. Find Candidate
    const { data: candidates } = await supabase
        .from('waitlist')
        .select('*')
        .eq('date', booking.date)
        .eq('status', 'queued')
        .lte('desired_time_start', booking.time)
        .gte('desired_time_end', booking.time)
        .order('created_at', { ascending: true })
        .limit(1);

    if (candidates && candidates.length > 0) {
        const candidate = candidates[0];
        const lockExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours

        // 3. Lock & Notify
        await supabase
            .from('waitlist')
            .update({
                status: 'notified',
                lock_expiry: lockExpiry
            })
            .eq('id', candidate.id);

        console.log(`[HOP] Notifying candidate ${candidate.user_id}`);
        // TODO: Send LINE Notify here
        // sendLineNotify(candidate.user_id, '候補名額釋出通知...');
    }
}

module.exports = {
    generateTimeSlots,
    processWaitlist
};
