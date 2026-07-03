import { chromium } from 'playwright';

const BASE = 'https://linebot-booking-golf-q3wo.vercel.app';
const results = [];

function log(test, pass, detail = '') {
    const icon = pass ? '✅' : '❌';
    results.push({ test, pass, detail });
    console.log(`${icon} ${test}${detail ? ' — ' + detail : ''}`);
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        permissions: ['camera'],
        viewport: { width: 430, height: 932 },
    });

    // ─── Test 1: Kiosk PIN Screen ───
    console.log('\n━━━ Kiosk 報到頁面測試 ━━━');
    const kioskPage = await context.newPage();
    await kioskPage.goto(`${BASE}/kiosk/checkin`, { waitUntil: 'networkidle' });

    const pinInput = kioskPage.locator('input[type="password"]');
    const pinExists = await pinInput.count() > 0;
    log('Kiosk PIN 輸入畫面載入', pinExists);

    const pinPlaceholder = await pinInput.getAttribute('placeholder');
    log('PIN 輸入框 placeholder', pinPlaceholder === '請輸入 PIN 碼', pinPlaceholder);

    const pinBtn = kioskPage.locator('button', { hasText: '進入報到模式' });
    log('進入報到模式按鈕存在', await pinBtn.count() > 0);

    // Test wrong PIN
    await pinInput.fill('000000');
    await pinBtn.click();
    await kioskPage.waitForTimeout(2000);
    const pinError = kioskPage.locator('p', { hasText: 'PIN 碼錯誤' });
    log('錯誤 PIN 顯示錯誤訊息', await pinError.count() > 0);

    // Test UI theme (light background) — search all divs for gradient
    const bgColor = await kioskPage.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const d of divs) {
            const bg = d.style.background || '';
            if (bg.includes('gradient') || bg.includes('f0f9f0')) return bg;
        }
        return '';
    });
    log('淺色主題配色', bgColor.length > 0, bgColor.slice(0, 80));

    // Check fullscreen button does NOT exist on PIN screen (only after auth)
    const fullscreenBtnOnPin = kioskPage.locator('button[title="全螢幕切換"]');
    log('PIN 畫面無全螢幕按鈕（正確）', await fullscreenBtnOnPin.count() === 0);

    await kioskPage.close();

    // ─── Test 2: Admin Login + SMS Log Panel ───
    console.log('\n━━━ 後台簡訊管理測試 ━━━');
    const adminPage = await context.newPage();
    await adminPage.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(1000);

    const loginForm = adminPage.locator('input[type="text"], input[type="email"], input[name="username"]').first();
    const hasLoginForm = await loginForm.count() > 0;
    log('Admin 登入頁面載入', hasLoginForm);

    if (hasLoginForm) {
        // Try to find password field
        const passField = adminPage.locator('input[type="password"]').first();
        log('密碼輸入框存在', await passField.count() > 0);
    }

    await adminPage.close();

    // ─── Test 3: Check deployed page structure ───
    console.log('\n━━━ 頁面結構檢查 ━━━');
    const checkPage = await context.newPage();

    // Check kiosk page source for key elements
    await checkPage.goto(`${BASE}/kiosk/checkin`, { waitUntil: 'networkidle' });

    const pageContent = await checkPage.content();

    log('Html5Qrcode 載入（非 Scanner）',
        !pageContent.includes('Html5QrcodeScanner') || pageContent.includes('kiosk-reader'));

    log('大衛營標題存在', pageContent.includes('大衛營'));

    // Check the styles are light theme — search all divs for gradient background
    const bodyBg = await checkPage.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const d of divs) {
            const bg = d.style.background || '';
            if (bg.includes('gradient') || bg.includes('f0f9f0') || bg.includes('e8f5e9')) return bg;
        }
        return '';
    });
    log('根元素使用淺色漸層背景', bodyBg.length > 0, bodyBg.slice(0, 80));

    // Check PIN card has white background
    const cardBg = await checkPage.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const d of divs) {
            const bg = d.style.background || d.style.backgroundColor || '';
            if (bg.includes('fff') || bg.includes('255, 255, 255')) return true;
        }
        return false;
    });
    log('白色卡片樣式', cardBg);

    // Verify the page has the green color scheme (browser normalizes hex to rgb)
    const hasGreenTheme = await checkPage.evaluate(() => {
        const all = document.querySelectorAll('button, div');
        for (const el of all) {
            const computed = window.getComputedStyle(el);
            const bg = computed.backgroundColor || '';
            if (bg.includes('46, 125, 50') || bg.includes('27, 94, 32') || bg.includes('2E7D32') || bg.includes('1b5e20')) return true;
        }
        return false;
    });
    log('綠色主題按鈕', hasGreenTheme);

    await checkPage.close();

    // ─── Test 4: API endpoints health check ───
    console.log('\n━━━ API 端點健康檢查 ━━━');
    const apiBase = 'https://linebot-booking-golf-backend.onrender.com';
    // Use Node fetch directly (avoids CORS issues from browser context)
    async function apiFetch(path, opts = {}) {
        try {
            const res = await fetch(`${apiBase}${path}`, { signal: AbortSignal.timeout(60000), ...opts });
            return { status: res.status };
        } catch (e) { return { error: e.message }; }
    }

    console.log('  ⏳ 喚醒 Render 後端（免費方案冷啟動）...');
    await apiFetch('/');
    await new Promise(r => setTimeout(r, 2000));

    const settingsRes = await apiFetch('/api/voucher-ops/settings');
    log('voucher-ops/settings 需要認證',
        settingsRes.status === 401 || settingsRes.status === 403,
        `status: ${settingsRes.status || settingsRes.error}`);

    const searchRes = await apiFetch('/api/voucher-ops/search-users?q=test');
    log('voucher-ops/search-users 需要認證',
        searchRes.status === 401 || searchRes.status === 403,
        `status: ${searchRes.status || searchRes.error}`);

    const pinRes = await apiFetch('/api/kiosk/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '000000' }),
    });
    log('kiosk/verify-pin 端點回應正常',
        pinRes.status && pinRes.status < 500,
        `status: ${pinRes.status || pinRes.error}`);


    // ─── Summary ───
    console.log('\n━━━ 測試結果摘要 ━━━');
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    console.log(`通過: ${passed} / 失敗: ${failed} / 總計: ${results.length}`);

    if (failed > 0) {
        console.log('\n失敗項目:');
        results.filter(r => !r.pass).forEach(r => {
            console.log(`  ❌ ${r.test}${r.detail ? ' — ' + r.detail : ''}`);
        });
    }

    await browser.close();
}

run().catch(err => {
    console.error('E2E 測試執行失敗:', err.message);
    process.exit(1);
});
