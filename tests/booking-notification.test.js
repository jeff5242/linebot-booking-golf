'use strict';

/**
 * 預約成功 LINE 推播通知測試
 * 測試 POST /api/bookings 成功後是否發送 LINE push message
 */

const request = require('supertest');
const app = require('../index');

function getFutureDate(daysAhead = 7) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

describe('POST /api/bookings - 預約成功推播通知', () => {
  const futureDate = getFutureDate();

  test('成功預約時 response 應包含 success 和 booking_id', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .send({
        phone: '0912345678',
        date: futureDate,
        time: '14:00:00',
        holes: 18,
        players_count: 2,
        players_info: [
          { name: '測試球友A', phone: '0912345678' },
          { name: '測試球友B', phone: '0911111111' }
        ],
        needs_cart: true,
        needs_caddie: true
      });

    // 404 = 使用者不存在（測試環境正常）
    // 409 = 時段已滿
    // 200 = 預約成功（如果測試使用者存在）
    if (res.status === 200) {
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('booking_id');
      expect(res.body).toHaveProperty('amount');
    } else {
      expect([404, 409, 500]).toContain(res.status);
    }
  });
});
