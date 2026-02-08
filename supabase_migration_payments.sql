-- Add payment columns to bookings table
ALTER TABLE public.bookings 
ADD COLUMN amount NUMERIC(10, 2),
ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
ADD COLUMN line_pay_transaction_id TEXT;

-- Update status check to include possible payment-related states if necessary
-- Current status: 'confirmed', 'checked_in', 'cancelled'
-- For now 'confirmed' will mean payment pending or verified depending on flow.
-- We'll keep the existing status as is for booking lifecycle, 
-- and use payment_status separately.
