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
 * @param {Date} baseDate - The base date
 * @param {Object} settings - System settings (interval, turn_time, etc.)
 */
export function generateDailySlots(baseDate, settings = {}) {
    const interval = settings?.interval || INTERVAL;
    let currentTime = set(baseDate, { hours: START_HOUR, minutes: START_MINUTE, seconds: 0, milliseconds: 0 });
    const endTime = set(baseDate, { hours: END_HOUR, minutes: END_MINUTE, seconds: 0, milliseconds: 0 });

    const slots = [];
    while (currentTime <= endTime) {
        slots.push(new Date(currentTime));
        currentTime = addMinutes(currentTime, interval);
    }
    return slots;
}

/**
 * Checks if a slot is available based on existing bookings and game type.
 * @param {Date} slotTime - The time to check
 * @param {Array} bookings - Array of booking objects { date, time, holes, status }
 * @param {number} holes - 9 or 18
 * @param {Object} settings - System settings (contains turn_time)
 * @returns {boolean}
 */
export function isSlotAvailable(slotTime, bookings, holes, settings = {}) {
    const turnTime = settings?.turn_time || TRANSITION_TIME;
    const timeStr = format(slotTime, 'HH:mm:ss');

    // 1. Check if the direct slot is taken
    const isDirectlyTaken = bookings.some(b => b.time === timeStr && b.status !== 'cancelled');
    if (isDirectlyTaken) return false;

    // 2. If 18 holes, check the transition slot (T + turnTime)
    if (holes === 18) {
        const transitionTime = addMinutes(slotTime, turnTime);

        // Check if T+turnTime is taken
        const transitionTimeStr = format(transitionTime, 'HH:mm:ss');
        const isTransitionTaken = bookings.some(b => b.time === transitionTimeStr && b.status !== 'cancelled');

        if (isTransitionTaken) return false;
    }

    // 3. Check for "Incoming" 18-hole bookings from previous times
    const conflictTime = addMinutes(slotTime, -turnTime);
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
 * @param {Date} dateObj - The slot time
 * @param {Object} settings - System settings (contains turn_time)
 * @returns {boolean}
 */
export function isTooLateFor18(dateObj, settings = {}) {
    const turnTime = settings?.turn_time || TRANSITION_TIME;
    const lastSlot = set(dateObj, { hours: END_HOUR, minutes: END_MINUTE, seconds: 0, milliseconds: 0 });
    const cutoffTime = addMinutes(lastSlot, -turnTime);

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
