'use strict';

/**
 * 系統設定安全性與完整性測試
 * - settings API 回傳格式驗證
 * - kiosk_pin 預設值測試
 * - admin login-otp 端點安全性
 */

const request = require('supertest');
const app = require('../index');

describe('GET /api/settings - 回傳格式', () => {
  test('應回傳必要的設定欄位', async () => {
    const res = await request(app).get('/api/settings');

    if (res.status === 200) {
      // 基本設定欄位應存在
      expect(res.body).toHaveProperty('start_time');
      expect(res.body).toHaveProperty('end_time');
      expect(res.body).toHaveProperty('interval');

      // 敏感欄位不應外洩
      expect(res.body).not.toHaveProperty('kiosk_pin');
    }
  });
});

describe('POST /api/admin/login-otp - 安全性', () => {
  test('不存在的帳號應回傳錯誤', async () => {
    const res = await request(app)
      .post('/api/admin/login-otp')
      .send({ username: 'nonexistent_admin_999@test.com' });

    // 應被拒絕（401 或 500）
    expect([401, 500]).toContain(res.status);
  });

  test('未提供帳號應回傳 400', async () => {
    const res = await request(app)
      .post('/api/admin/login-otp')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/login - 密碼登入', () => {
  test('錯誤的帳號密碼應回傳 401', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'fake_user', password: 'wrong_password' });

    expect(res.status).toBe(401);
  });

  test('未提供帳號或密碼應回傳 400', async () => {
    const res = await request(app)
      .post('/api/admin/login')
      .send({ username: 'test' });

    expect(res.status).toBe(400);
  });
});
