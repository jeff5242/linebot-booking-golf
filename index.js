'use strict';

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

const axios = require('axios');
const uuid = require('uuid');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Supabase 設定
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// LINE Pay 設定
const linePayConfig = {
  channelId: process.env.LINE_PAY_CHANNEL_ID,
  channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
  apiUrl: process.env.LINE_PAY_API_URL || 'https://sandbox-api-pay.line.me',
};

const app = express();

// LINE Webhook 端點 - 必須放在 express.json() 之前，因為它需要原始 Request Body 進行簽章驗證
app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('Error handling events:', err);
      res.status(500).end();
    });
});

app.use(express.json()); // For handling payment API bodies and other JSON requests

// 健康檢查端點
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.send('LINE Bot Booking Service is running!');
});

// Helper: LINE Pay Signature
function generateLinePayHeaders(uri, body) {
  const nonce = uuid.v4();
  const stringToSign = linePayConfig.channelSecret + uri + JSON.stringify(body) + nonce;
  const signature = crypto
    .createHmac('sha256', linePayConfig.channelSecret)
    .update(stringToSign)
    .digest('base64');

  return {
    'Content-Type': 'application/json',
    'X-LINE-ChannelId': linePayConfig.channelId,
    'X-LINE-Authorization-Nonce': nonce,
    'X-LINE-Authorization': signature,
  };
}

// 建立 LINE Pay 交易
app.post('/api/payment/request', async (req, res) => {
  try {
    const { amount, bookingId, productName } = req.body;
    const uri = '/v3/payments/request';
    const body = {
      amount: parseInt(amount),
      currency: 'TWD',
      orderId: `order_${bookingId}_${Date.now()}`,
      packages: [
        {
          id: `pkg_${bookingId}`,
          amount: parseInt(amount),
          name: productName || 'Golf Booking',
          products: [
            {
              name: productName || 'Golf Booking',
              quantity: 1,
              price: parseInt(amount),
            },
          ],
        },
      ],
      redirectUrls: {
        confirmUrl: `${process.env.BASE_URL}/api/payment/confirm`,
        cancelUrl: `${process.env.BASE_URL}/payment/failure`,
      },
    };

    const headers = generateLinePayHeaders(uri, body);
    const response = await axios.post(`${linePayConfig.apiUrl}${uri}`, body, { headers });

    if (response.data.returnCode === '0000') {
      res.json(response.data.info.paymentUrl.web);
    } else {
      res.status(400).json(response.data);
    }
  } catch (error) {
    console.error('LINE Pay Request Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment request failed' });
  }
});

// 確認 LINE Pay 交易
app.get('/api/payment/confirm', async (req, res) => {
  const { transactionId, orderId } = req.query;

  try {
    // Extract bookingId from orderId (Format: order_uuid_timestamp)
    const bookingId = orderId.split('_')[1];

    if (!bookingId) {
      return res.redirect(`${process.env.BASE_URL}/payment/failure?error=invalid_order`);
    }

    // 1. Fetch booking details to get the amount
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('amount')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      console.error('Error fetching booking:', fetchError);
      return res.redirect(`${process.env.BASE_URL}/payment/failure?error=booking_not_found`);
    }

    // 2. Confirm LINE Pay Transaction
    const uri = `/v3/payments/${transactionId}/confirm`;
    const body = {
      amount: parseInt(booking.amount),
      currency: 'TWD',
    };

    const headers = generateLinePayHeaders(uri, body);
    const response = await axios.post(`${linePayConfig.apiUrl}${uri}`, body, { headers });

    if (response.data.returnCode === '0000') {
      // 3. Update booking status in Supabase
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          payment_status: 'paid',
          line_pay_transaction_id: transactionId,
          status: 'confirmed'
        })
        .eq('id', bookingId);

      if (updateError) {
        console.error('Error updating booking status:', updateError);
        // Still redirect to success since payment was taken, but log the error
      }

      res.redirect(`${process.env.BASE_URL}/payment/success?transactionId=${transactionId}`);
    } else {
      res.redirect(`${process.env.BASE_URL}/payment/failure?code=${response.data.returnCode}`);
    }
  } catch (error) {
    console.error('LINE Pay Confirm Error:', error.response?.data || error.message);
    res.redirect(`${process.env.BASE_URL}/payment/failure?error=confirm_failed`);
  }
});

// Import sync script
const { syncUsers } = require('./scripts/syncUsers');

// Sync Users Endpoint
app.post('/api/users/sync', async (req, res) => {
  try {
    const result = await syncUsers();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Sync Endpoint Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Users Endpoint with Filtering and Pagination
app.get('/api/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    // Build query with filters
    let query = supabase.from('users').select('*', { count: 'exact' });

    // Apply filters
    if (req.query.member_no) {
      query = query.ilike('member_no', `%${req.query.member_no}%`);
    }
    if (req.query.display_name) {
      query = query.ilike('display_name', `%${req.query.display_name}%`);
    }
    if (req.query.phone) {
      query = query.ilike('phone', `%${req.query.phone}%`);
    }
    if (req.query.golfer_type) {
      query = query.ilike('golfer_type', `%${req.query.golfer_type}%`);
    }
    if (req.query.line_bound === 'true') {
      query = query.not('line_user_id', 'is', null);
    } else if (req.query.line_bound === 'false') {
      query = query.is('line_user_id', null);
    }

    // Apply pagination and ordering
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    res.json({
      users: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Users Endpoint with Filtering and Pagination

// 處理 LINE 事件
async function handleEvent(event) {
  // 只處理訊息事件
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userMessage = event.message.text;

  // Echo 回覆使用者訊息
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [
      {
        type: 'text',
        text: `你說了: ${userMessage}`,
      },
    ],
  });
}

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE Bot 伺服器正在運行於 port ${PORT}`);
});
