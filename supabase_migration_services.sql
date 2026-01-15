-- Add service options columns
alter table public.bookings 
add column if not exists needs_cart boolean default true,
add column if not exists needs_caddie boolean default true;
