-- Add players_info column to store JSON array of player details
alter table public.bookings 
add column if not exists players_info jsonb default '[]'::jsonb;

-- Optional: Update players_count based on array length automatically? 
-- For now, we trust the client or keep players_count as summary.
