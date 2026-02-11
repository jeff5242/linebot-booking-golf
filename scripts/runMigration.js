const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('🔄 Starting database migration...\n');

    try {
        // 1. Create system_settings table
        console.log('1️⃣ Creating system_settings table...');
        const { error: createSettingsError } = await supabase.rpc('create_table_system_settings');

        // Since we can't execute raw SQL, we'll create the tables by inserting data
        // and letting Supabase create them if they don't exist

        // Try to insert a test record to see if table exists
        const { data: settingsTest, error: settingsError } = await supabase
            .from('system_settings')
            .select('*')
            .limit(1);

        if (settingsError && settingsError.code === '42P01') {
            console.log('   ⚠️  Table does not exist. Please create manually in Supabase Dashboard.');
            console.log('   📋 SQL to execute:');
            console.log(`
CREATE TABLE IF NOT EXISTS public.system_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.system_settings (key, value)
VALUES (
    'booking_rules',
    '{"interval": 10, "min_group_size": 4, "turn_time": 120, "peak_a": {"start": "05:30", "end": "07:30", "max_groups": 20, "reserved": 5}, "peak_b": {"start": "11:30", "end": "12:30", "max_groups": 15, "reserved": 2}, "is_peak_a_overflow": false, "fees": {"electronic_fee": 50, "off_peak_discount": true}}'::jsonb
) ON CONFLICT (key) DO NOTHING;

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

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS allow_matching boolean DEFAULT false;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow public read settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Allow all settings" ON public.system_settings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "Allow all waitlist" ON public.waitlist FOR ALL USING (true);
            `);

            console.log('\n📌 Please execute the SQL above in Supabase Dashboard > SQL Editor');
            console.log('   URL: https://supabase.com/dashboard/project/yjglsxbvjhdfwmdtaspj/sql');
            return;
        }

        console.log('   ✅ system_settings table exists or can be accessed');

        // 2. Check waitlist table
        console.log('\n2️⃣ Checking waitlist table...');
        const { error: waitlistError } = await supabase
            .from('waitlist')
            .select('*')
            .limit(1);

        if (waitlistError && waitlistError.code === '42P01') {
            console.log('   ⚠️  waitlist table does not exist');
        } else {
            console.log('   ✅ waitlist table exists');
        }

        // 3. Check bookings table for allow_matching column
        console.log('\n3️⃣ Checking bookings table...');
        const { data: bookingCheck } = await supabase
            .from('bookings')
            .select('allow_matching')
            .limit(1);

        if (bookingCheck) {
            console.log('   ✅ allow_matching column exists');
        }

        console.log('\n✅ Migration check completed!');
        console.log('⚠️  Note: Due to Supabase client limitations, please manually execute the SQL in the Dashboard.');

    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

runMigration();
