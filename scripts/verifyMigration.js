const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyMigration() {
    console.log('🔍 Verifying database migration...\n');

    try {
        // 1. Check system_settings table and data
        console.log('1️⃣ Checking system_settings table...');
        const { data: settings, error: settingsError } = await supabase
            .from('system_settings')
            .select('*');

        if (settingsError) {
            console.log('   ❌ Error:', settingsError.message);
        } else {
            console.log(`   ✅ Table exists with ${settings.length} records`);
            if (settings.length > 0) {
                console.log('   📋 Current settings:');
                settings.forEach(s => {
                    console.log(`      - ${s.key}:`, JSON.stringify(s.value, null, 2).substring(0, 100) + '...');
                });
            } else {
                console.log('   ⚠️  No settings found. Inserting defaults...');

                const defaultSettings = {
                    key: 'booking_rules',
                    value: {
                        interval: 10,
                        min_group_size: 4,
                        turn_time: 120,
                        peak_a: { start: "05:30", end: "07:30", max_groups: 20, reserved: 5 },
                        peak_b: { start: "11:30", end: "12:30", max_groups: 15, reserved: 2 },
                        is_peak_a_overflow: false,
                        fees: { electronic_fee: 50, off_peak_discount: true }
                    }
                };

                const { error: insertError } = await supabase
                    .from('system_settings')
                    .insert([defaultSettings]);

                if (insertError) {
                    console.log('   ❌ Insert error:', insertError.message);
                } else {
                    console.log('   ✅ Default settings inserted');
                }
            }
        }

        // 2. Check waitlist table
        console.log('\n2️⃣ Checking waitlist table...');
        const { data: waitlist, error: waitlistError } = await supabase
            .from('waitlist')
            .select('*')
            .limit(5);

        if (waitlistError) {
            console.log('   ❌ Error:', waitlistError.message);
        } else {
            console.log(`   ✅ Table exists with ${waitlist.length} records (showing max 5)`);
        }

        // 3. Check bookings table for allow_matching column
        console.log('\n3️⃣ Checking bookings.allow_matching column...');
        const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('id, allow_matching')
            .limit(1);

        if (bookingsError) {
            console.log('   ❌ Error:', bookingsError.message);
        } else {
            console.log('   ✅ Column exists');
            if (bookings && bookings.length > 0) {
                console.log(`   📋 Sample: allow_matching = ${bookings[0].allow_matching}`);
            }
        }

        console.log('\n✅ Migration verification completed!\n');
        console.log('📌 Next steps:');
        console.log('   1. Restart the backend server (if needed)');
        console.log('   2. Open Admin dashboard and check the new tabs');
        console.log('   3. Configure settings in "參數設定" tab');

    } catch (err) {
        console.error('❌ Verification error:', err.message);
    }
}

verifyMigration();
