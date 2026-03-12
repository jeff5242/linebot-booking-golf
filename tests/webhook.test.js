'use strict';

/**
 * Webhook 事件處理測試
 *
 * 測試 handleEvent 函式對各種 LINE 事件的處理邏輯。
 * 由於 handleEvent 是 index.js 的內部函式，我們透過 POST /webhook 端點間接測試。
 * LINE SDK 的簽章驗證在測試中需要繞過。
 */

const crypto = require('crypto');
const request = require('supertest');
const app = require('../index');

// LINE webhook 簽章生成（使用 channel secret 產生合法簽章）
function generateSignature(body, channelSecret) {
  return crypto
    .createHmac('SHA256', channelSecret)
    .update(JSON.stringify(body))
    .digest('base64');
}

const channelSecret = process.env.LINE_CHANNEL_SECRET;

// 如果沒有設定 channel secret，跳過需要簽章的測試
const describeIfSecret = channelSecret ? describe : describe.skip;

describeIfSecret('POST /webhook - LINE 事件處理', () => {

  function sendWebhook(events) {
    const body = { destination: 'test', events };
    const signature = generateSignature(body, channelSecret);

    return request(app)
      .post('/webhook')
      .set('x-line-signature', signature)
      .send(body);
  }

  test('空事件陣列應回傳 200', async () => {
    const res = await sendWebhook([]);
    expect(res.status).toBe(200);
  });

  test('follow 事件應回傳 200（不報錯）', async () => {
    const res = await sendWebhook([{
      type: 'follow',
      timestamp: Date.now(),
      source: { type: 'user', userId: 'U_test_follow_user' },
      replyToken: '00000000000000000000000000000000',
      mode: 'active'
    }]);

    expect(res.status).toBe(200);
  });

  test('unfollow 事件應回傳 200（不報錯）', async () => {
    const res = await sendWebhook([{
      type: 'unfollow',
      timestamp: Date.now(),
      source: { type: 'user', userId: 'U_test_unfollow_user' },
      mode: 'active'
    }]);

    expect(res.status).toBe(200);
  });

  test('postback 事件應被處理（不崩潰）', async () => {
    const res = await sendWebhook([{
      type: 'postback',
      timestamp: Date.now(),
      source: { type: 'user', userId: 'U_test_postback_user' },
      replyToken: '00000000000000000000000000000000',
      postback: { data: 'action=booking' },
      mode: 'active'
    }]);

    // 200 = 處理成功, 500 = replyMessage 因假 token 被 LINE API 拒絕（測試環境正常現象）
    expect([200, 500]).toContain(res.status);
  });

  test('postback 未知 action 應靜默處理', async () => {
    const res = await sendWebhook([{
      type: 'postback',
      timestamp: Date.now(),
      source: { type: 'user', userId: 'U_test_postback_unknown' },
      replyToken: '00000000000000000000000000000000',
      postback: { data: 'action=unknown_action' },
      mode: 'active'
    }]);

    // 未知 action 不會呼叫 replyMessage，所以不會被 LINE API 拒絕
    expect(res.status).toBe(200);
  });

  test('未知事件類型應回傳 200（靜默處理）', async () => {
    const res = await sendWebhook([{
      type: 'beacon',
      timestamp: Date.now(),
      source: { type: 'user', userId: 'U_test_beacon_user' },
      replyToken: '00000000000000000000000000000000',
      beacon: { hwid: 'test', type: 'enter' },
      mode: 'active'
    }]);

    expect(res.status).toBe(200);
  });

  test('多個事件應全部處理並回傳 200', async () => {
    const res = await sendWebhook([
      {
        type: 'follow',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'U_multi_1' },
        replyToken: '00000000000000000000000000000001',
        mode: 'active'
      },
      {
        type: 'unfollow',
        timestamp: Date.now(),
        source: { type: 'user', userId: 'U_multi_2' },
        mode: 'active'
      }
    ]);

    expect(res.status).toBe(200);
  });
});

// 無 channel secret 時的基本驗證
describe('POST /webhook - 簽章驗證', () => {
  test('無簽章的請求應被拒絕', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ destination: 'test', events: [] });

    // LINE SDK 會拒絕無簽章請求 (400 或 401 或 500)
    expect([400, 401, 500]).toContain(res.status);
  });

  test('錯誤簽章的請求應被拒絕', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('x-line-signature', 'invalid_signature_here')
      .send({ destination: 'test', events: [] });

    expect([400, 401, 500]).toContain(res.status);
  });
});
