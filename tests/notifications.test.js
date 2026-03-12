'use strict';

/**
 * 通知功能測試
 * - HOP 候補通知 (BookingLogic.processWaitlist)
 * - 休場通知 (OperationalCalendar.sendClosureNotifications)
 *
 * 使用 jest.mock 模擬 Supabase 和 LINE API，避免依賴外部服務。
 */

// ============================================
// Mock 設定
// ============================================

// 模擬 LINE 推播結果
const mockSendPushMessage = jest.fn().mockResolvedValue({ success: true });
jest.mock('../services/LineNotification', () => ({
  sendPushMessage: (...args) => mockSendPushMessage(...args),
  buildChargeCardMessage: jest.fn()
}));

// Supabase mock 工廠
function createSupabaseMock(queryResults = {}) {
  const chainMethods = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    single: jest.fn(),
  };

  // 預設 single() 回傳
  chainMethods.single.mockImplementation(() => {
    // 依表名 + 查詢條件返回不同結果
    return Promise.resolve(queryResults._lastSingle || { data: null, error: null });
  });

  const fromMock = jest.fn((table) => {
    // 紀錄目前的表名
    queryResults._currentTable = table;

    // 覆寫 single 讓它根據表名回傳
    chainMethods.single.mockImplementation(() => {
      const result = queryResults[table] || { data: null, error: null };
      return Promise.resolve(result);
    });

    // eq 也要能設定回傳
    chainMethods.eq.mockImplementation((field, value) => {
      const key = `${table}.${field}.${value}`;
      if (queryResults[key]) {
        chainMethods.single.mockImplementation(() => Promise.resolve(queryResults[key]));
      }
      return chainMethods;
    });

    return chainMethods;
  });

  return { from: fromMock, _chain: chainMethods };
}

// 模擬 supabase-js
const mockSupabase = createSupabaseMock();
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

// 模擬 SystemSettings
jest.mock('../services/SystemSettings', () => ({
  getSettings: jest.fn().mockResolvedValue({
    interval: '10',
    peak_a: { start: '05:30', end: '07:30', max_groups: 10, reserved: 2 },
    peak_b: { start: '11:00', end: '15:30', max_groups: 10, reserved: 2 }
  })
}));

// 模擬 dotenv
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// ============================================
// 測試
// ============================================

describe('HOP 候補通知 (BookingLogic.processWaitlist)', () => {
  let processWaitlist;

  beforeEach(() => {
    jest.clearAllMocks();

    // 清除模組快取，讓每個測試重新載入
    jest.resetModules();

    // 重新設定 mock
    mockSendPushMessage.mockResolvedValue({ success: true });
  });

  test('取消預約後應發送 LINE 通知給候補者', async () => {
    // 設定 Supabase 回傳：被取消的預約
    const cancelledBooking = {
      id: 'booking-001',
      date: '2026-03-01',
      time: '06:30:00',
      user_id: 'user-A',
      players_count: 4
    };

    // 候補者
    const candidate = {
      id: 'waitlist-001',
      user_id: 'user-B',
      date: '2026-03-01',
      desired_time_start: '05:30',
      desired_time_end: '07:30',
      status: 'queued'
    };

    // 候補者的使用者資料
    const candidateUser = {
      line_user_id: 'U_candidate_line_id',
      display_name: '王小明'
    };

    // 配置 mock chain
    const chain = mockSupabase._chain;

    // 追蹤 from() 呼叫
    let callCount = 0;
    mockSupabase.from.mockImplementation((table) => {
      callCount++;

      // single() 依序回傳不同結果
      chain.single.mockImplementation(() => {
        if (table === 'bookings') {
          return Promise.resolve({ data: cancelledBooking, error: null });
        }
        if (table === 'users') {
          return Promise.resolve({ data: candidateUser, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // select 模擬 waitlist 候補者列表
      chain.limit.mockImplementation(() => {
        if (table === 'waitlist') {
          return Promise.resolve({ data: [candidate], error: null });
        }
        return chain;
      });

      // update 模擬
      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);

      return chain;
    });

    // 重新載入模組（使用新的 mock）
    const { processWaitlist: pw } = require('../services/BookingLogic');
    await pw('booking-001');

    // 驗證：應呼叫 sendPushMessage
    expect(mockSendPushMessage).toHaveBeenCalledTimes(1);
    expect(mockSendPushMessage).toHaveBeenCalledWith(
      'U_candidate_line_id',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('候補名額釋出通知')
        })
      ])
    );
  });

  test('無候補者時不應發送通知', async () => {
    const cancelledBooking = {
      id: 'booking-002',
      date: '2026-03-02',
      time: '06:30:00',
      user_id: 'user-A'
    };

    const chain = mockSupabase._chain;
    mockSupabase.from.mockImplementation((table) => {
      chain.single.mockImplementation(() => {
        if (table === 'bookings') {
          return Promise.resolve({ data: cancelledBooking, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // 空候補列表
      chain.limit.mockImplementation(() => {
        if (table === 'waitlist') {
          return Promise.resolve({ data: [], error: null });
        }
        return chain;
      });

      return chain;
    });

    jest.resetModules();
    const { processWaitlist: pw } = require('../services/BookingLogic');
    await pw('booking-002');

    // 驗證：不應呼叫 sendPushMessage
    expect(mockSendPushMessage).not.toHaveBeenCalled();
  });

  test('候補者無 LINE ID 時不應發送通知（但不出錯）', async () => {
    const cancelledBooking = {
      id: 'booking-003',
      date: '2026-03-03',
      time: '07:00:00',
      user_id: 'user-A'
    };

    const candidate = {
      id: 'waitlist-003',
      user_id: 'user-C',
      date: '2026-03-03',
      status: 'queued'
    };

    // 使用者沒有 LINE ID
    const candidateUser = {
      line_user_id: null,
      display_name: '李小華'
    };

    const chain = mockSupabase._chain;
    mockSupabase.from.mockImplementation((table) => {
      chain.single.mockImplementation(() => {
        if (table === 'bookings') return Promise.resolve({ data: cancelledBooking, error: null });
        if (table === 'users') return Promise.resolve({ data: candidateUser, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      chain.limit.mockImplementation(() => {
        if (table === 'waitlist') return Promise.resolve({ data: [candidate], error: null });
        return chain;
      });

      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);

      return chain;
    });

    jest.resetModules();
    const { processWaitlist: pw } = require('../services/BookingLogic');

    // 不應拋出錯誤
    await expect(pw('booking-003')).resolves.not.toThrow();

    // 不應呼叫 sendPushMessage（因為沒有 LINE ID）
    expect(mockSendPushMessage).not.toHaveBeenCalled();
  });

  test('通知訊息應包含日期與時段資訊', async () => {
    const cancelledBooking = {
      id: 'booking-004',
      date: '2026-04-15',
      time: '11:30:00',
      user_id: 'user-A'
    };

    const candidate = {
      id: 'waitlist-004',
      user_id: 'user-D',
      date: '2026-04-15',
      status: 'queued'
    };

    const candidateUser = {
      line_user_id: 'U_user_D',
      display_name: '張大偉'
    };

    const chain = mockSupabase._chain;
    mockSupabase.from.mockImplementation((table) => {
      chain.single.mockImplementation(() => {
        if (table === 'bookings') return Promise.resolve({ data: cancelledBooking, error: null });
        if (table === 'users') return Promise.resolve({ data: candidateUser, error: null });
        return Promise.resolve({ data: null, error: null });
      });

      chain.limit.mockImplementation(() => {
        if (table === 'waitlist') return Promise.resolve({ data: [candidate], error: null });
        return chain;
      });

      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);

      return chain;
    });

    jest.resetModules();
    const { processWaitlist: pw } = require('../services/BookingLogic');
    await pw('booking-004');

    // 驗證訊息內容
    const callArgs = mockSendPushMessage.mock.calls[0];
    const messageText = callArgs[1][0].text;
    expect(messageText).toContain('2026-04-15'); // 日期
    expect(messageText).toContain('11:30');       // 時段
    expect(messageText).toContain('張大偉');      // 姓名
    expect(messageText).toContain('2 小時');       // 保留時限
  });
});

// ============================================
// 休場通知測試
// ============================================

describe('休場通知 (OperationalCalendar.sendClosureNotifications)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendPushMessage.mockResolvedValue({ success: true });
  });

  test('應對所有受影響預約者發送 LINE 通知', async () => {
    const affectedBookings = [
      { user_id: 'user-1', date: '2026-05-01', time: '06:30:00', players_count: 4 },
      { user_id: 'user-2', date: '2026-05-01', time: '07:00:00', players_count: 2 },
    ];

    const chain = mockSupabase._chain;

    // 依序回傳不同使用者
    let userCallIndex = 0;
    const users = [
      { line_user_id: 'U_user1', display_name: '使用者一' },
      { line_user_id: 'U_user2', display_name: '使用者二' },
    ];

    mockSupabase.from.mockImplementation((table) => {
      chain.single.mockImplementation(() => {
        if (table === 'users') {
          const user = users[userCallIndex++];
          return Promise.resolve({ data: user, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);

      return chain;
    });

    jest.resetModules();
    const OperationalCalendar = require('../services/OperationalCalendar');
    const result = await OperationalCalendar.sendClosureNotifications(
      '2026-05-01',
      affectedBookings,
      '颱風來襲'
    );

    // 驗證：應發送 2 次推播
    expect(mockSendPushMessage).toHaveBeenCalledTimes(2);
    expect(result.notified).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.total).toBe(2);
  });

  test('通知訊息應包含休場原因和預約資訊', async () => {
    const affectedBookings = [
      { user_id: 'user-1', date: '2026-05-10', time: '08:00:00', players_count: 3 },
    ];

    const chain = mockSupabase._chain;
    mockSupabase.from.mockImplementation((table) => {
      chain.single.mockImplementation(() => {
        if (table === 'users') {
          return Promise.resolve({
            data: { line_user_id: 'U_test', display_name: '陳小明' },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);

      return chain;
    });

    jest.resetModules();
    const OperationalCalendar = require('../services/OperationalCalendar');
    await OperationalCalendar.sendClosureNotifications(
      '2026-05-10',
      affectedBookings,
      '場地維護施工'
    );

    const callArgs = mockSendPushMessage.mock.calls[0];
    const messageText = callArgs[1][0].text;
    expect(messageText).toContain('休場通知');
    expect(messageText).toContain('場地維護施工');  // 休場原因
    expect(messageText).toContain('2026-05-10');    // 日期
    expect(messageText).toContain('08:00');          // 時段
    expect(messageText).toContain('3 人');           // 人數
    expect(messageText).toContain('陳小明');         // 姓名
  });

  test('使用者無 LINE ID 時應計入失敗數', async () => {
    const affectedBookings = [
      { user_id: 'user-no-line', date: '2026-06-01', time: '06:00:00', players_count: 1 },
    ];

    const chain = mockSupabase._chain;
    mockSupabase.from.mockImplementation((table) => {
      chain.single.mockImplementation(() => {
        if (table === 'users') {
          return Promise.resolve({
            data: { line_user_id: null, display_name: '無LINE的人' },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);

      return chain;
    });

    jest.resetModules();
    const OperationalCalendar = require('../services/OperationalCalendar');
    const result = await OperationalCalendar.sendClosureNotifications(
      '2026-06-01',
      affectedBookings,
      '豪雨'
    );

    expect(mockSendPushMessage).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
    expect(result.failed).toBe(1);
  });

  test('LINE 推播失敗時應計入失敗數但不中斷流程', async () => {
    mockSendPushMessage.mockResolvedValue({ success: false, reason: 'invalid user' });

    const affectedBookings = [
      { user_id: 'user-fail', date: '2026-06-15', time: '07:00:00', players_count: 2 },
    ];

    const chain = mockSupabase._chain;
    mockSupabase.from.mockImplementation((table) => {
      chain.single.mockImplementation(() => {
        if (table === 'users') {
          return Promise.resolve({
            data: { line_user_id: 'U_fail_user', display_name: '推播失敗者' },
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);

      return chain;
    });

    jest.resetModules();
    const OperationalCalendar = require('../services/OperationalCalendar');
    const result = await OperationalCalendar.sendClosureNotifications(
      '2026-06-15',
      affectedBookings,
      '設備故障'
    );

    expect(mockSendPushMessage).toHaveBeenCalledTimes(1);
    expect(result.notified).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.success).toBe(true); // 整體流程仍算成功
  });

  test('無受影響預約時應回傳 0 通知', async () => {
    const chain = mockSupabase._chain;
    mockSupabase.from.mockImplementation(() => {
      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      return chain;
    });

    jest.resetModules();
    const OperationalCalendar = require('../services/OperationalCalendar');
    const result = await OperationalCalendar.sendClosureNotifications(
      '2026-07-01',
      [],
      '例行維護'
    );

    expect(mockSendPushMessage).not.toHaveBeenCalled();
    expect(result.notified).toBe(0);
    expect(result.total).toBe(0);
  });
});
