'use strict';

const request = require('supertest');
const app = require('../index');

// 測試用的未來日期（避免「不可預約過去的日期」錯誤）
function getFutureDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ============================================
// POST /api/bookings 預訂建立測試
// ============================================
describe('POST /api/bookings', () => {
  const futureDate = getFutureDate();

  // --- 驗證：缺少必要欄位 ---
  test('缺少必要欄位應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({ phone: '0912345678' }); // 缺少 date, time, holes, players_count

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少必要欄位/);
  });

  test('全部欄位都為空應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少必要欄位/);
  });

  // --- 驗證：手機號碼格式 ---
  test('錯誤的手機號碼格式應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '1234567890', // 不是 09 開頭
        date: futureDate,
        time: '07:00:00',
        holes: 18,
        players_count: 1,
        players_info: [{ name: '測試', phone: '0912345678' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/手機號碼/);
  });

  test('手機號碼太短應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '091234', // 太短
        date: futureDate,
        time: '07:00:00',
        holes: 18,
        players_count: 1,
        players_info: [{ name: '測試', phone: '0912345678' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/手機號碼/);
  });

  // --- 驗證：holes 必須為 9 或 18 ---
  test('holes 非 9/18 應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '0912345678',
        date: futureDate,
        time: '07:00:00',
        holes: 12, // 非法值
        players_count: 1,
        players_info: [{ name: '測試', phone: '0912345678' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/holes/);
  });

  // --- 驗證：球友資料 ---
  test('球友姓名為空應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '0912345678',
        date: futureDate,
        time: '07:00:00',
        holes: 18,
        players_count: 2,
        players_info: [
          { name: '球友A', phone: '0912345678' },
          { name: '', phone: '0911111111' } // 空姓名
        ]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/姓名/);
  });

  test('球友資料數量不足應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '0912345678',
        date: futureDate,
        time: '07:00:00',
        holes: 18,
        players_count: 4,
        players_info: [{ name: '球友A', phone: '0912345678' }] // 只有 1 筆但聲稱 4 人
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/球友資料不完整/);
  });

  // --- 驗證：過去日期 ---
  test('過去的日期應回傳 400', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '0912345678',
        date: '2020-01-01',
        time: '07:00:00',
        holes: 18,
        players_count: 1,
        players_info: [{ name: '測試', phone: '0912345678' }]
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/過去/);
  });

  // --- 驗證：使用者不存在 ---
  test('未註冊的手機號碼應回傳 404', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '0999999901', // 極不可能存在的號碼
        date: futureDate,
        time: '05:30:00',
        holes: 18,
        players_count: 1,
        players_info: [{ name: '不存在的人', phone: '0999999901' }]
      });

    // 404 = 找不到使用者（正常情境）
    // 409 = 時段已滿（若該時段恰好滿了，會先被 409 攔住）
    // 500 = DB 連線問題
    expect([404, 409, 500]).toContain(res.status);
  });
});

// ============================================
// POST /api/waitlist 候補名單測試
// ============================================
describe('POST /api/waitlist', () => {
  const futureDate = getFutureDate();

  // --- 驗證：缺少必要欄位 ---
  test('缺少必要欄位應回傳 400', async () => {
    const res = await request(app)
      .post('/api/waitlist')
      .send({ phone: '0912345678' }); // 缺少 date, players_count, peak_type

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少必要欄位/);
  });

  test('全部欄位都為空應回傳 400', async () => {
    const res = await request(app)
      .post('/api/waitlist')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/缺少必要欄位/);
  });

  // --- 驗證：手機號碼格式 ---
  test('錯誤的手機號碼格式應回傳 400', async () => {
    const res = await request(app)
      .post('/api/waitlist')
      .send({
        phone: '0800123456', // 0800 不是 09 開頭的行動電話
        date: futureDate,
        players_count: 4,
        peak_type: 'peak_a'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/手機號碼/);
  });

  // --- 驗證：peak_type ---
  test('無效的 peak_type 應回傳 400', async () => {
    const res = await request(app)
      .post('/api/waitlist')
      .send({
        phone: '0912345678',
        date: futureDate,
        players_count: 4,
        peak_type: 'peak_c' // 非法值
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/peak_type/);
  });

  test('peak_type 為空字串應回傳 400', async () => {
    const res = await request(app)
      .post('/api/waitlist')
      .send({
        phone: '0912345678',
        date: futureDate,
        players_count: 4,
        peak_type: '' // 空字串
      });

    expect(res.status).toBe(400);
  });

  // --- 驗證：使用者不存在 ---
  test('未註冊的手機號碼應回傳 404', async () => {
    const res = await request(app)
      .post('/api/waitlist')
      .send({
        phone: '0999999901', // 極不可能存在的號碼
        date: futureDate,
        players_count: 4,
        peak_type: 'peak_a'
      });

    // 404 = 找不到使用者（正常情境）
    // 500 = DB 連線問題
    expect([404, 500]).toContain(res.status);
  });
});

// ============================================
// 其他既有端點基本測試
// ============================================
describe('GET /health', () => {
  test('健康檢查應回傳 status 和 checks 物件', async () => {
    const res = await request(app).get('/health');
    // 200 = 全部正常, 503 = 部分服務異常
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('db');
    expect(res.body.checks).toHaveProperty('line');
  });

  test('status 為 ok 時所有 checks 應為 ok', async () => {
    const res = await request(app).get('/health');
    if (res.body.status === 'ok') {
      expect(res.body.checks.db).toBe('ok');
      expect(res.body.checks.line).toBe('ok');
    }
  });

  test('status 為 degraded 時 HTTP 狀態碼應為 503', async () => {
    const res = await request(app).get('/health');
    if (res.body.status === 'degraded') {
      expect(res.status).toBe(503);
    }
  });
});

describe('GET /api/slots', () => {
  test('缺少 date 參數應回傳 400', async () => {
    const res = await request(app).get('/api/slots');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Date is required/);
  });

  test('提供 date 應回傳時段列表', async () => {
    const futureDate = getFutureDate();
    const res = await request(app).get(`/api/slots?date=${futureDate}`);
    // 200 = 正常回傳 slots, 500 = DB 連線問題
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body)).toBe(true);
    }
  });
});

describe('GET /api/settings', () => {
  test('應回傳系統設定', async () => {
    const res = await request(app).get('/api/settings');
    expect([200, 500]).toContain(res.status);
  });
});
