import { addMinutes, format, parse, set, isBefore } from 'date-fns';

// Constants
const START_HOUR = 5;
const START_MINUTE = 30;
const END_HOUR = 15;
const END_MINUTE = 30;
const INTERVAL = 10;
const TRANSITION_TIME = 150; // minutes (2.5 hours)

/**
 * Generates all possible slot times for a day.
 * Returns array of Date objects.
 */
export function generateDailySlots(baseDate) {
    let currentTime = set(baseDate, { hours: START_HOUR, minutes: START_MINUTE, seconds: 0, milliseconds: 0 });
    const endTime = set(baseDate, { hours: END_HOUR, minutes: END_MINUTE, seconds: 0, milliseconds: 0 });

    const slots = [];
    while (currentTime <= endTime) {
        slots.push(new Date(currentTime));
        currentTime = addMinutes(currentTime, INTERVAL);
    }
    return slots;
}

/**
 * Checks if a slot is available based on existing bookings and game type.
 * @param {Date} slotTime - The time to check
 * @param {Array} bookings - Array of booking objects { date, time, holes, status }
 * @param {number} holes - 9 or 18
 * @returns {boolean}
 */
export function isSlotAvailable(slotTime, bookings, holes) {
    const timeStr = format(slotTime, 'HH:mm:ss');

    // 1. Check if the direct slot is taken
    const isDirectlyTaken = bookings.some(b => b.time === timeStr && b.status !== 'cancelled');
    if (isDirectlyTaken) return false;

    // 2. If 18 holes, check the transition slot (T + 150m)
    if (holes === 18) {
        const transitionTime = addMinutes(slotTime, TRANSITION_TIME);
        // Check if transition time is within operating hours (Optional? User didn't specify, but usually yes)
        // Actually user requirement: "15:00 以後的時段應顯示灰色（因 2.5 小時後已關場）"
        // But our end time is 15:30. Let's check strictly if the transition slot exists in our valid range logic? 
        // Or just valid operating hours.
        // User said: "若為 18 洞須 T 與 T+150 同時有空位才顯示"

        // Check if T+150 is taken
        const transitionTimeStr = format(transitionTime, 'HH:mm:ss');
        const isTransitionTaken = bookings.some(b => b.time === transitionTimeStr && b.status !== 'cancelled');

        if (isTransitionTaken) return false;

        // Check if T+150 is valid "Start Time"? 
        // Not necessarily. T+150 is a "Turn" time. The system reserves it.
        // If someone else booked T+150 as their start time, it's a conflict.

        // Also, complex logic: What if someone booked 18 holes at (T - 150)?
        // Then they occupy T as their transition.
        // WE MUST CHECK incoming bookings to see if they occupy US.
    }

    // 3. Check for "Incoming" 18-hole bookings from previous times
    // If I want to book T.
    // I need to ensure no one booked (T - 150) with 18 holes.
    const conflictTime = addMinutes(slotTime, -TRANSITION_TIME);
    const conflictTimeStr = format(conflictTime, 'HH:mm:ss');
    const incomingConflict = bookings.some(b =>
        b.time === conflictTimeStr &&
        b.holes === 18 &&
        b.status !== 'cancelled'
    );

    if (incomingConflict) return false;

    return true;
}

/**
 * Checks if the time is too late for an 18-hole game.
 * Logic: Must start at least TRANSITION_TIME (2.5h) before the last slot.
 * Last Slot: 15:30
 * Cutoff: 13:00
 */
export function isTooLateFor18(dateObj) {
    // Construct the Last Slot Time for this specific date
    const lastSlot = set(dateObj, { hours: END_HOUR, minutes: END_MINUTE, seconds: 0, milliseconds: 0 });

    // Calculate the cutoff time (Last Slot - Transition Time)
    const cutoffTime = addMinutes(lastSlot, -TRANSITION_TIME);

    // Check if current dateObj is after the cutoff
    // We use > because 13:00 is allowed (13:00 + 2.5h = 15:30 Turn, which fits).
    // 13:10 + 2.5h = 15:40 Turn (Too late).
    return dateObj > cutoffTime;
}

/**
 * Calculates the total booking price based on selected options.
 * @param {number} holes - 9 or 18
 * @param {number} playersCount - Number of players
 * @param {boolean} needsCart - If golf cart is needed
 * @param {boolean} needsCaddie - If caddie service is needed
 * @returns {Object} - Breakdown and total amount
 */
export function calculateBookingPrice(holes, playersCount, needsCart, needsCaddie) {
    // Current rates (Placeholders - to be confirmed by user)
    const RATES = {
        GREEN_FEE_9: 1000,
        GREEN_FEE_18: 1800,
        CART_FEE: 500, // Per player? Or per cart? Assuming per person for now.
        CADDIE_FEE: 800 // Per player? Or per group? Assuming per person for now.
    };

    const greenFeeUnit = holes === 9 ? RATES.GREEN_FEE_9 : RATES.GREEN_FEE_18;
    const greenFeeTotal = greenFeeUnit * playersCount;

    const cartFeeTotal = needsCart ? RATES.CART_FEE * playersCount : 0;
    const caddieFeeTotal = needsCaddie ? RATES.CADDIE_FEE * playersCount : 0;

    const total = greenFeeTotal + cartFeeTotal + caddieFeeTotal;

    return {
        breakdown: {
            greenFee: { unit: greenFeeUnit, count: playersCount, total: greenFeeTotal },
            cartFee: needsCart ? { unit: RATES.CART_FEE, count: playersCount, total: cartFeeTotal } : null,
            caddieFee: needsCaddie ? { unit: RATES.CADDIE_FEE, count: playersCount, total: caddieFeeTotal } : null
        },
        total: total
    };
}
