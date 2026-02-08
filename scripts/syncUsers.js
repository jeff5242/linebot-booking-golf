const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Configuration
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1cCgy5goR_INTdjTaBtKwlgx-f-iNGnejcu7Rz7yWuM8'; // Updated from user request
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'google-service-account.json'; // Support env var or file

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    if (require.main === module) {
        console.error('Error: Supabase environment variables missing.');
        console.log('URL:', supabaseUrl);
        console.log('Key:', supabaseKey ? '******' : 'undefined');
        process.exit(1);
    }
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncUsers() {
    console.log('Starting sync...');

    // 1. Authenticate with Google
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.metadata.readonly'
        ],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    const drive = google.drive({ version: 'v3', auth: client });

    try {
        // 2. Fetch Data from Sheet
        // Fetching from the first sheet by default
        const meta = await sheets.spreadsheets.get({
            spreadsheetId: SHEET_ID
        });
        const sheetName = meta.data.sheets[0].properties.title;
        console.log(`Syncing from sheet: ${sheetName}`);

        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: `${sheetName}!A2:O`, // Fetch A to O (includes all new columns)
        });

        const rows = res.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return { success: false, message: 'No data found in sheet' };
        }

        console.log(`Found ${rows.length} rows.`);

        // 3. Process each row
        let successCount = 0;
        let failCount = 0;

        for (const row of rows) {
            // Column Mapping (0-based index)
            // A (Index 0): Member No
            // B (Index 1): Name
            // E (Index 4): Gender
            // F (Index 5): Phone
            // J (Index 9): Tax ID
            // L (Index 11): Golfer Type
            // O (Index 14): Valid Until

            const memberNo = row[0]?.trim();
            const name = row[1]?.trim();
            const gender = row[4]?.trim();
            let phone = row[5];
            const taxId = row[9]?.trim();
            const golferType = row[11]?.trim();
            const validUntilStr = row[14]?.trim();

            if (!phone) {
                // console.log(`Skipping row without phone: ${JSON.stringify(row)}`);
                continue;
            }

            // Clean Phone Number (remove dashes, spaces)
            phone = phone.replace(/\D/g, '');

            // Validation: Tax ID
            let validTaxId = taxId;
            if (taxId && !/^\d{8}$/.test(taxId)) {
                console.warn(`Invalid Tax ID for ${name}: ${taxId}`);
                validTaxId = null; // or keep as is? User said "统一編號可以沒有，8碼數字". Let's restrict to 8 digits or null.
            }

            // Validation: Valid Until
            let validUntilDate = null;
            if (validUntilStr) {
                const date = new Date(validUntilStr);
                if (!isNaN(date.getTime())) {
                    validUntilDate = date.toISOString().split('T')[0]; // Format YYYY-MM-DD
                } else {
                    console.warn(`Invalid Valid Until Date for ${name}: ${validUntilStr}`);
                }
            }

            // Upsert to Supabase
            // Use phone as unique key (or combined with name)
            const { data, error } = await supabase
                .from('users')
                .upsert({
                    phone: phone,
                    display_name: name,
                    member_no: memberNo || null,
                    gender: gender || null,
                    tax_id: validTaxId || null,
                    golfer_type: golferType || null,
                    member_valid_until: validUntilDate || null
                    // Add other fields as needed
                }, { onConflict: 'phone' })
                .select();

            if (error) {
                console.error(`Error syncing ${name} (${phone}):`, error.message);
                failCount++;
            } else {
                successCount++;
            }
        }

        console.log(`Sync Complete. Success: ${successCount}, Failed: ${failCount}`);
        return { success: true, synced: successCount, failed: failCount };

    } catch (error) {
        console.error('The API returned an error: ' + error);
        return { success: false, error: error.message };
    }
}

// Run if called directly
if (require.main === module) {
    syncUsers();
}

module.exports = { syncUsers };
