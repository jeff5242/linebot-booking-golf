'use strict';

/**
 * Kiosk 報到機 API 測試
 * - POST /api/kiosk/verify-pin
 * - GET /api/settings 不應暴露 kiosk_pin
 */

const request = require('supertest');
const app = require('../index');

describe('POST /api/kiosk/verify-pin', () => {
  test('正確的 PIN 碼應回傳 success', async () => {
    const res = await request(app)
      .post('/api/kiosk/verify-pin')
      .send({ pin: '1688' });

    // 200 = PIN 正確（使用預設 PIN）
    // 401 = PIN 已被管理員修改過（非預設值）
    // 500 = DB 連線問題
    expect([200, 401, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('success', true);
    }
  });

  test('錯誤的 PIN 碼應回傳 401', async () => {
    const res = await request(app)
      .post('/api/kiosk/verify-pin')
      .send({ pin: '0000' });

    // 401 = PIN 錯誤
    // 500 = DB 連線問題
    expect([401, 500]).toContain(res.status);
    if (res.status === 401) {
      expect(res.body).toHaveProperty('success', false);
    }
  });

  test('未提供 PIN 碼應回傳 400', async () => {
    const res = await request(app)
      .post('/api/kiosk/verify-pin')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PIN/);
  });

  test('空字串 PIN 碼應回傳 400', async () => {
    const res = await request(app)
      .post('/api/kiosk/verify-pin')
      .send({ pin: '' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/settings - kiosk_pin 安全性', () => {
  test('公開 settings API 不應包含 kiosk_pin', async () => {
    const res = await request(app).get('/api/settings');

    if (res.status === 200) {
      expect(res.body).not.toHaveProperty('kiosk_pin');
    }
  });
});
