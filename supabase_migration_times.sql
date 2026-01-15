-- Add time tracking columns
alter table public.bookings 
add column if not exists booked_time timestamp with time zone default timezone('utc'::text, now()),
add column if not exists checkin_time timestamp with time zone,
add column if not exists scheduled_departure_time time;

-- Note: 
-- booked_time: 預約時間 (自動記錄)
-- checkin_time: 報到時間 (報到時記錄)
-- scheduled_departure_time: 排定出發時間 (可手動調整)
