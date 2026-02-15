'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
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
const { getSettings, updateSettings } = require('./services/SystemSettings');
const { generateTimeSlots, processWaitlist } = require('./services/BookingLogic');
const OperationalCalendar = require('./services/OperationalCalendar');
const CaddyManagement = require('./services/CaddyManagement');
const ChargeCard = require('./services/ChargeCard');
const { login: adminLogin, loginByOtp: adminLoginByOtp } = require('./services/AuthService');
const { requireAuth, optionalAuth } = require('./middleware/auth');
const RoleMgmt = require('./services/RoleManagement');
const bcrypt = require('bcryptjs');
const OtpService = require('./services/OtpService');
const RichMenuService = require('./services/RichMenuService');

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

// 設定 CORS - 必須放在所有路由之前，包括 Webhook
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://linebot-booking-golf-q3wo.vercel.app',
  'http://localhost:5173', // 本地開發
  'http://localhost:5174', // 本地開發（備用埠號）
];

app.use(cors({
  origin: function (origin, callback) {
    // 允許無 origin 的請求（例如：postman, curl, 或同源請求）
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 除錯用的 Middleware，記錄收到的請求來源
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - Origin: ${req.get('origin')}`);
  next();
});

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

// ============================================
// 管理員認證 API (Admin Auth)
// ============================================

// 管理員登入
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '帳號和密碼為必填' });
    }
    const result = await adminLogin(username, password);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// OTP 驗證後登入（跳過密碼驗證）
app.post('/api/admin/login-otp', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: '帳號為必填' });
    }
    const result = await adminLoginByOtp(username);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// 取得當前管理員資訊
app.get('/api/admin/me', requireAuth(), async (req, res) => {
  res.json(req.admin);
});

// 管理員列表
app.get('/api/admin/list', requireAuth('admins'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, username, name, role, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 新增管理員
app.post('/api/admin/create', requireAuth('admins'), async (req, res) => {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: '名稱、帳號和密碼為必填' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('admins')
      .insert([{ name, username, password: '***', password_hash, role: role || 'starter' }])
      .select('id, username, name, role, created_at')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 更新管理員
app.put('/api/admin/:id', requireAuth('admins'), async (req, res) => {
  try {
    const { role, name } = req.body;
    const updateData = {};
    if (role) updateData.role = role;
    if (name) updateData.name = name;
    const { data, error } = await supabase
      .from('admins')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, username, name, role, created_at')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 刪除管理員
app.delete('/api/admin/:id', requireAuth('admins'), async (req, res) => {
  try {
    if (req.params.id === req.admin.adminId) {
      return res.status(400).json({ error: '無法刪除自己的帳號' });
    }
    const { error } = await supabase.from('admins').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// 角色管理 API (Role Management)
// ============================================

app.get('/api/roles', requireAuth('admins'), async (req, res) => {
  try {
    const roles = await RoleMgmt.getAllRoles();
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/roles', requireAuth('admins'), async (req, res) => {
  try {
    const role = await RoleMgmt.createRole(req.body);
    res.json(role);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/roles/:id', requireAuth('admins'), async (req, res) => {
  try {
    const role = await RoleMgmt.updateRole(req.params.id, req.body);
    res.json(role);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/roles/:id', requireAuth('admins'), async (req, res) => {
  try {
    const result = await RoleMgmt.deleteRole(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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

    // Development Mode: Skip LINE Pay API if credentials are 'development'
    if (linePayConfig.channelId === 'development') {
      console.log('🔧 Development Mode: Bypassing LINE Pay API');
      console.log(`Mock Payment for Booking ${bookingId}: $${amount}`);

      // Return a mock confirmation URL that will directly confirm the booking
      const mockConfirmUrl = `${process.env.BASE_URL}/api/payment/confirm?transactionId=dev_${Date.now()}&orderId=order_${bookingId}_${Date.now()}`;
      return res.json(mockConfirmUrl);
    }

    // Production Mode: Use real LINE Pay API
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
        cancelUrl: `${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/failure`,
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
      return res.redirect(`${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/failure?error=invalid_order`);
    }

    // Development Mode: Auto-confirm if transaction ID starts with 'dev_'
    if (transactionId.startsWith('dev_')) {
      console.log('🔧 Development Mode: Auto-confirming payment');

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
        return res.redirect(`${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/failure?error=db_update_failed`);
      }

      return res.redirect(`${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/success?transactionId=${transactionId}`);
    }

    // Production Mode: Confirm with LINE Pay API
    // 1. Fetch booking details to get the amount
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('amount')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) {
      console.error('Error fetching booking:', fetchError);
      return res.redirect(`${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/failure?error=booking_not_found`);
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

      res.redirect(`${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/success?transactionId=${transactionId}`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/failure?code=${response.data.returnCode}`);
    }
  } catch (error) {
    console.error('LINE Pay Confirm Error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL || process.env.BASE_URL}/payment/failure?error=confirm_failed`);
  }
});

// Import sync script
const { syncUsers } = require('./scripts/syncUsers');

// Sync Users Endpoint
app.post('/api/users/sync', requireAuth('users'), async (req, res) => {
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
app.get('/api/users', requireAuth('users'), async (req, res) => {
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
// ... (previous code)

// --- Advanced Booking API ---

// 1. Get System Settings (公開 + 後台皆可存取)
app.get('/api/settings', optionalAuth, async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Update System Settings
app.post('/api/settings', requireAuth('settings'), async (req, res) => {
  try {
    const updated = await updateSettings(req.body);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Get Available Time Slots (公開 + 後台皆可存取)
app.get('/api/slots', optionalAuth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    const slots = await generateTimeSlots(date);
    res.json(slots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Cancel Booking (Trigger HOP)
app.post('/api/bookings/:id/cancel', requireAuth('starter'), async (req, res) => {
  try {
    const { id } = req.params;

    // Update DB
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) throw error;

    // Trigger Waitlist Logic
    await processWaitlist(id);

    res.json({ success: true, message: 'Booking cancelled and waitlist processed' });
  } catch (error) {
    console.error('Cancel Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 手動更新用戶 Rich Menu API
app.post('/api/user/richmenu', async (req, res) => {
  try {
    const { lineUserId } = req.body;
    if (!lineUserId) {
      return res.status(400).json({ error: 'Missing lineUserId' });
    }

    // Check availability
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    if (user) {
      await RichMenuService.switchToMemberMenu(lineUserId);
      return res.json({ success: true, mode: 'member' });
    } else {
      // Intentionally do not switch back to default here automatically to avoid overwriting if there's a specific reason, 
      // but for "refresh" logic, we might want to ensure consistency. 
      // For now, only upgrade to member menu if user exists.
      return res.json({ success: false, message: 'User not found' });
    }
  } catch (error) {
    console.error('Rich Menu Update Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 處理 LINE 事件
async function handleEvent(event) {
  // 處理加入好友事件 → 判斷是否已註冊，分配對應 Rich Menu
  if (event.type === 'follow') {
    const lineUserId = event.source.userId;
    try {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('line_user_id', lineUserId)
        .maybeSingle();

      if (user) {
        await RichMenuService.switchToMemberMenu(lineUserId);
      }
      // 未註冊的用戶會使用預設 Rich Menu（登入前版）
    } catch (err) {
      console.error('[Follow] Rich Menu 設定失敗:', err.message);
    }
    return Promise.resolve(null);
  }

  // 只處理文字訊息事件
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

// ============================================
// 營運日曆 API
// ============================================

// 取得單日覆蓋設定
app.get('/api/calendar/override/:date', requireAuth('operational_calendar'), async (req, res) => {
  try {
    const data = await OperationalCalendar.getDateOverride(req.params.date);
    res.json(data || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取得日期區間的覆蓋設定
app.get('/api/calendar/overrides', requireAuth('operational_calendar'), async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: '需要提供 start 和 end 參數' });
    }
    const data = await OperationalCalendar.getDateRangeOverrides(start, end);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 建立或更新單日覆蓋設定
app.post('/api/calendar/override', requireAuth('operational_calendar'), async (req, res) => {
  try {
    const userId = req.user?.id || null; // 未登入時使用 null（資料庫會接受 NULL 值）
    const result = await OperationalCalendar.upsertDateOverride(req.body, userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 刪除覆蓋設定（恢復全域範本）
app.delete('/api/calendar/override/:date', requireAuth('operational_calendar'), async (req, res) => {
  try {
    const result = await OperationalCalendar.deleteDateOverride(req.params.date);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 批次設定
app.post('/api/calendar/batch', requireAuth('operational_calendar'), async (req, res) => {
  try {
    const userId = req.user?.id || null; // 未登入時使用 null
    const result = await OperationalCalendar.applyBatchSettings(req.body, userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 檢查預約衝突
app.get('/api/calendar/conflicts/:date', requireAuth('operational_calendar'), async (req, res) => {
  try {
    const status = req.query.status || 'closed';
    const conflicts = await OperationalCalendar.checkBookingConflicts(
      req.params.date,
      status
    );
    res.json(conflicts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取得日期營運狀態（含全域設定合併）
app.get('/api/calendar/status/:date', requireAuth(), async (req, res) => {
  try {
    const globalSettings = await getSettings();
    const status = await OperationalCalendar.getDateOperationalStatus(
      req.params.date,
      globalSettings
    );
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LINE Bot 伺服器正在運行於 port ${PORT}`);
});

// ============================================
// 費率管理 API (Rate Management)
// ============================================
const RateManagement = require('./services/RateManagement');

// 取得當前生效的費率配置 (公開 + 後台皆可存取)
app.get('/api/rates/active', optionalAuth, async (req, res) => {
  try {
    const rateConfig = await RateManagement.getActiveRateConfig();
    res.json(rateConfig);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 取得所有費率配置（含歷史）
app.get('/api/rates', requireAuth('rate_management'), async (req, res) => {
  try {
    const configs = await RateManagement.getAllRateConfigs(req.query);
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 創建新費率配置
app.post('/api/rates', requireAuth('rate_management'), async (req, res) => {
  try {
    const config = await RateManagement.createRateConfig(req.body, req.user?.id);
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 更新費率配置
app.put('/api/rates/:id', requireAuth('rate_management'), async (req, res) => {
  try {
    const config = await RateManagement.updateRateConfig(req.params.id, req.body, req.user?.id);
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 提交審核
app.post('/api/rates/:id/submit', requireAuth('rate_management'), async (req, res) => {
  try {
    const config = await RateManagement.submitForApproval(req.params.id, req.user?.id, req.body.changesSummary);
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 批准費率
app.post('/api/rates/:id/approve', requireAuth('rate_management'), async (req, res) => {
  try {
    const config = await RateManagement.approveRateConfig(req.params.id, req.user?.id, req.body.effectiveDate);
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 拒絕費率
app.post('/api/rates/:id/reject', requireAuth('rate_management'), async (req, res) => {
  try {
    const config = await RateManagement.rejectRateConfig(req.params.id, req.user?.id, req.body.reason);
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 啟用費率
app.post('/api/rates/:id/activate', requireAuth('rate_management'), async (req, res) => {
  try {
    const config = await RateManagement.activateRateConfig(req.params.id, req.user?.id);
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 計算費用 (公開 + 後台皆可存取)
app.post('/api/rates/calculate', optionalAuth, async (req, res) => {
  try {
    const result = await RateManagement.calculateTotalFee(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// 桿弟管理 API (Caddy Management)
// ============================================

// 取得所有桿弟 (出發台產卡也需要讀取桿弟)
app.get('/api/caddies', requireAuth(), async (req, res) => {
  try {
    const caddies = await CaddyManagement.getAllCaddies();
    res.json(caddies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 新增桿弟
app.post('/api/caddies', requireAuth('caddy_management'), async (req, res) => {
  try {
    const caddy = await CaddyManagement.createCaddy(req.body);
    res.json(caddy);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 更新桿弟
app.put('/api/caddies/:id', requireAuth('caddy_management'), async (req, res) => {
  try {
    const caddy = await CaddyManagement.updateCaddy(req.params.id, req.body);
    res.json(caddy);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// 收費卡 API (Charge Cards)
// ============================================

// 產生收費卡
app.post('/api/charge-cards', requireAuth('starter'), async (req, res) => {
  try {
    const result = await ChargeCard.generateChargeCard(req.body.bookingId, {
      caddyId: req.body.caddyId,
      caddyRatio: req.body.caddyRatio,
      course: req.body.course,
      tierOverrides: req.body.tierOverrides,
      includeCart: req.body.includeCart !== false,
      includeCaddy: req.body.includeCaddy !== false
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 查詢預約的收費卡
app.get('/api/charge-cards/booking/:bookingId', requireAuth('starter'), async (req, res) => {
  try {
    const card = await ChargeCard.getChargeCardByBooking(req.params.bookingId);
    if (!card) {
      return res.status(404).json({ error: '尚未產生收費卡' });
    }
    res.json(card);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 發送 LINE 通知
app.post('/api/charge-cards/:id/notify', requireAuth('starter'), async (req, res) => {
  try {
    const result = await ChargeCard.sendChargeCardNotification(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// OTP 驗證碼 API
// ============================================

// 發送 OTP
app.post('/api/otp/send', async (req, res) => {
  try {
    const { phone, purpose } = req.body;
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: '請提供正確的手機號碼' });
    }
    const result = await OtpService.sendOtp(phone, purpose || 'registration');
    if (!result.success) {
      // 根據錯誤代碼回傳適當的 HTTP Status
      if (result.code === 'COOLDOWN' || result.code === 'LIMIT_REACHED') {
        return res.status(429).json({ error: result.message, code: result.code });
      } else if (result.code === 'SMS_FAILED' || result.code === 'DB_ERROR') {
        return res.status(500).json({ error: result.message, code: result.code });
      }
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (error) {
    console.error('OTP Send Error:', error);
    res.status(500).json({ error: '發送驗證碼失敗' });
  }
});

// 驗證 OTP（僅驗證，不綁定）
app.post('/api/otp/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: '請提供手機號碼和驗證碼' });
    }
    const result = await OtpService.verifyOtp(phone, code);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (error) {
    console.error('OTP Verify Error:', error);
    res.status(500).json({ error: '驗證失敗' });
  }
});

// ============================================
// 會員 API (Member)
// ============================================

// 會員註冊 / 綁定 LINE（含 OTP 驗證）
app.post('/api/member/register', async (req, res) => {
  try {
    const { phone, code, name, lineUserId } = req.body;
    if (!phone || !code || !lineUserId) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    // 1. 驗證 OTP
    const otpResult = await OtpService.verifyOtp(phone, code);
    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.message });
    }

    // 2. 查詢 by phone
    const { data: userByPhone } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    // 3. 查詢 by lineUserId
    const { data: userByLine } = await supabase
      .from('users')
      .select('*')
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    let user;

    if (userByPhone) {
      // Phone 已存在 → 綁定 LINE ID
      const { data, error } = await supabase
        .from('users')
        .update({
          line_user_id: lineUserId,
          display_name: name || userByPhone.display_name,
        })
        .eq('id', userByPhone.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      user = data;
    } else if (userByLine) {
      // LINE ID 已存在 → 更新 phone
      const { data, error } = await supabase
        .from('users')
        .update({
          phone,
          display_name: name || userByLine.display_name,
        })
        .eq('id', userByLine.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      user = data;
    } else {
      // 新用戶
      const { data, error } = await supabase
        .from('users')
        .insert({
          line_user_id: lineUserId,
          phone,
          display_name: name || '',
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      user = data;
    }

    // 註冊成功 → 切換 Rich Menu 為會員版
    RichMenuService.switchToMemberMenu(lineUserId).catch(() => { });

    res.json({
      success: true,
      user: {
        id: user.id,
        display_name: user.display_name,
        phone: user.phone,
        golfer_type: user.golfer_type || '來賓',
        member_no: user.member_no,
        member_valid_until: user.member_valid_until,
        gender: user.gender,
      },
    });
  } catch (error) {
    console.error('Member Register Error:', error);
    res.status(500).json({ error: error.message || '註冊失敗' });
  }
});

// 重新綁定手機
app.post('/api/member/rebind', async (req, res) => {
  try {
    const { phone, code, lineUserId } = req.body;
    if (!phone || !code || !lineUserId) {
      return res.status(400).json({ error: '缺少必要參數' });
    }

    // 1. 驗證 OTP
    const otpResult = await OtpService.verifyOtp(phone, code);
    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.message });
    }

    // 2. 檢查新手機是否已被其他人使用
    const { data: phoneOwner } = await supabase
      .from('users')
      .select('id, line_user_id')
      .eq('phone', phone)
      .maybeSingle();

    if (phoneOwner && phoneOwner.line_user_id && phoneOwner.line_user_id !== lineUserId) {
      return res.status(409).json({ error: '此手機號碼已被其他帳號綁定' });
    }

    // 3. 更新手機號碼
    if (phoneOwner && phoneOwner.line_user_id !== lineUserId) {
      // phone record 存在但沒有 LINE ID → 合併：更新 phone record 加上 LINE ID
      const { data, error } = await supabase
        .from('users')
        .update({ line_user_id: lineUserId })
        .eq('id', phoneOwner.id)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // 刪除舊的 LINE record（如果存在且不同）
      await supabase
        .from('users')
        .delete()
        .eq('line_user_id', lineUserId)
        .neq('id', phoneOwner.id);

      res.json({ success: true, user: data });
    } else {
      // 直接更新 LINE user 的 phone
      const { data, error } = await supabase
        .from('users')
        .update({ phone })
        .eq('line_user_id', lineUserId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      res.json({ success: true, user: data });
    }
  } catch (error) {
    console.error('Member Rebind Error:', error);
    res.status(500).json({ error: error.message || '重新綁定失敗' });
  }
});

// 會員個人資料
app.get('/api/member/profile', async (req, res) => {
  try {
    const { lineUserId } = req.query;
    if (!lineUserId) {
      return res.status(400).json({ error: '缺少 lineUserId' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ error: '找不到會員資料' });
    }

    // 統計
    const { count: totalBookings } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: upcomingBookings } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['confirmed'])
      .gte('date', new Date().toISOString().split('T')[0]);

    const { count: completedRounds } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'checked_in');

    res.json({
      user: {
        id: user.id,
        display_name: user.display_name,
        phone: user.phone,
        golfer_type: user.golfer_type || '來賓',
        member_no: user.member_no,
        member_valid_until: user.member_valid_until,
        gender: user.gender,
      },
      stats: {
        totalBookings: totalBookings || 0,
        upcomingBookings: upcomingBookings || 0,
        completedRounds: completedRounds || 0,
      },
    });
  } catch (error) {
    console.error('Member Profile Error:', error);
    res.status(500).json({ error: '讀取會員資料失敗' });
  }
});

// 會員預約紀錄
app.get('/api/member/bookings', async (req, res) => {
  try {
    const { lineUserId, page = 1, limit = 20 } = req.query;
    if (!lineUserId) {
      return res.status(400).json({ error: '缺少 lineUserId' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ error: '找不到會員' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data: bookings, count, error } = await supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .order('time', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw new Error(error.message);

    res.json({ bookings: bookings || [], total: count || 0 });
  } catch (error) {
    console.error('Member Bookings Error:', error);
    res.status(500).json({ error: '讀取預約紀錄失敗' });
  }
});

// 會員收費卡紀錄
app.get('/api/member/charge-cards', async (req, res) => {
  try {
    const { lineUserId, page = 1, limit = 10 } = req.query;
    if (!lineUserId) {
      return res.status(400).json({ error: '缺少 lineUserId' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ error: '找不到會員' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // 先查詢用戶的 bookings IDs
    const { data: bookingIds } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', user.id);

    if (!bookingIds || bookingIds.length === 0) {
      return res.json({ chargeCards: [], total: 0 });
    }

    const ids = bookingIds.map(b => b.id);

    const { data: chargeCards, count, error } = await supabase
      .from('charge_cards')
      .select('*, caddies(name, caddy_number)', { count: 'exact' })
      .in('booking_id', ids)
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw new Error(error.message);

    res.json({ chargeCards: chargeCards || [], total: count || 0 });
  } catch (error) {
    console.error('Member Charge Cards Error:', error);
    res.status(500).json({ error: '讀取收費卡紀錄失敗' });
  }
});

// 會員優惠券
app.get('/api/member/vouchers', async (req, res) => {
  try {
    const { lineUserId } = req.query;
    if (!lineUserId) {
      return res.status(400).json({ error: '缺少 lineUserId' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();

    if (!user) {
      return res.status(404).json({ error: '找不到會員' });
    }

    const { data: vouchers, error } = await supabase
      .from('membership_benefits_issued')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      // 表可能不存在，回傳空
      return res.json({ vouchers: [] });
    }

    res.json({ vouchers: vouchers || [] });
  } catch (error) {
    console.error('Member Vouchers Error:', error);
    res.status(500).json({ error: '讀取優惠券失敗' });
  }
});

