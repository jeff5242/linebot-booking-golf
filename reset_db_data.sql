-- DANGER: This script wipes all user data and bookings!
-- Use only for development testing.

BEGIN;

-- 1. Delete all bookings first (due to foreign key constraints, though ON DELETE CASCADE might handle it)
DELETE FROM public.bookings;

-- 2. Delete all users
DELETE FROM public.users;

-- 3. Reset sequences if needed (optional)
-- ALTER SEQUENCE users_id_seq RESTART WITH 1;

COMMIT;

-- Verification
SELECT count(*) as user_count FROM public.users;
SELECT count(*) as booking_count FROM public.bookings;
