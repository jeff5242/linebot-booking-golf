-- Migration: Advanced Booking Features
-- Date: 2026-02-10

-- 1. System Settings Table (Key-Value Store for Config)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Insert Default Settings
INSERT INTO public.system_settings (key, value)
VALUES (
    'booking_rules',
    '{
        "interval": 10,
        "min_group_size": 4,
        "turn_time": 120,
        "peak_a": { "start": "05:30", "end": "07:30", "max_groups": 20, "reserved": 5 },
        "peak_b": { "start": "11:30", "end": "12:30", "max_groups": 15, "reserved": 2 },
        "is_peak_a_overflow": false,
        "fees": { "electronic_fee": 50, "off_peak_discount": true }
    }'::jsonb
) ON CONFLICT (key) DO NOTHING;

-- 2. Waitlist (HOP) Table
CREATE TABLE IF NOT EXISTS public.waitlist (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) NOT NULL,
    date date NOT NULL,
    desired_time_start time NOT NULL,
    desired_time_end time NOT NULL,
    players_count int NOT NULL DEFAULT 1,
    status text DEFAULT 'queued' CHECK (status IN ('queued', 'notified', 'confirmed', 'expired', 'cancelled')),
    lock_expiry timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 3. Update Bookings Table
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS allow_matching boolean DEFAULT false;

-- 4. RLS Policies
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anon/authenticated to read settings (public config)
CREATE POLICY "Allow public read settings" ON public.system_settings FOR SELECT USING (true);
-- Allow all for MVP (Admin controls updates)
CREATE POLICY "Allow all settings" ON public.system_settings FOR ALL USING (true);

-- Waitlist Policies
CREATE POLICY "Users can manage own waitlist" ON public.waitlist
    FOR ALL USING (auth.uid() = user_id); -- Note: Assuming Supabase Auth. If custom Line Auth, might need adjustment or allow all for MVP backend.

CREATE POLICY "Allow all waitlist" ON public.waitlist FOR ALL USING (true);
