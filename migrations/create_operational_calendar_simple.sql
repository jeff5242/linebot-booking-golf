-- ============================================
-- 營運日曆模組 - 資料庫 Schema（簡化版）
-- ============================================

-- 1. 營運日曆覆蓋設定表
CREATE TABLE IF NOT EXISTS operational_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,

    -- 營運狀態
    status VARCHAR(20) NOT NULL DEFAULT 'normal',
    -- 'normal' = 正常營業
    -- 'closed' = 休場（計劃性）
    -- 'emergency_closed' = 臨時關閉（緊急）

    -- 時間覆蓋設定
    custom_start_time TIME,              -- 自定義開始時間（覆蓋全域設定）
    custom_end_time TIME,                -- 自定義結束時間（可選）
    custom_interval INTEGER,             -- 自定義發球間隔（可選，單位：分鐘）

    -- Peak 時段覆蓋（可選，若不設定則沿用全域）
    custom_peak_periods JSONB,
    -- 結構範例:
    -- [
    --   {"start": "05:30", "end": "07:30", "max_groups": 20, "reserved": 5},
    --   {"start": "11:30", "end": "12:30", "max_groups": 15, "reserved": 2}
    -- ]

    -- 容量限制覆蓋
    custom_max_bookings INTEGER,         -- 該日最大預約數（可選）

    -- 備註與原因
    notes TEXT,                          -- 管理員備註
    closure_reason VARCHAR(100),         -- 關閉原因（休場時使用）
    -- 預設選項: '球場維護', '比賽包場', '天氣因素', '設施檢修', '其他'

    -- 通知設定
    notify_existing_bookings BOOLEAN DEFAULT false,  -- 是否已通知受影響預約
    notification_sent_at TIMESTAMP,                  -- 通知發送時間
    affected_booking_count INTEGER DEFAULT 0,        -- 受影響預約數量

    -- 審計欄位
    created_by UUID,                     -- 建立者
    created_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID,                     -- 最後修改者
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 批次操作記錄表
CREATE TABLE IF NOT EXISTS calendar_batch_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type VARCHAR(20) NOT NULL,
    -- 'apply_template' = 套用全域範本
    -- 'bulk_close' = 批次休場
    -- 'bulk_override' = 批次覆蓋設定

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    settings JSONB,                      -- 套用的設定內容
    affected_dates_count INTEGER,        -- 受影響日期數量

    performed_by UUID,
    performed_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 索引優化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_operational_calendar_date ON operational_calendar(date);
CREATE INDEX IF NOT EXISTS idx_operational_calendar_status ON operational_calendar(status);
CREATE INDEX IF NOT EXISTS idx_operational_calendar_date_range ON operational_calendar(date, status);
CREATE INDEX IF NOT EXISTS idx_calendar_batch_ops_date ON calendar_batch_operations(performed_at DESC);

-- ============================================
-- RLS 政策（簡化版 - 開放讀寫）
-- ============================================
ALTER TABLE operational_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_batch_operations ENABLE ROW LEVEL SECURITY;

-- 允許所有已認證用戶讀取營運日曆
DROP POLICY IF EXISTS "Allow authenticated read calendar" ON operational_calendar;
CREATE POLICY "Allow authenticated read calendar"
ON operational_calendar FOR SELECT
TO authenticated
USING (true);

-- 允許所有已認證用戶寫入營運日曆（暫時性，後續可調整）
DROP POLICY IF EXISTS "Allow authenticated write calendar" ON operational_calendar;
CREATE POLICY "Allow authenticated write calendar"
ON operational_calendar FOR ALL
TO authenticated
USING (true);

-- 允許所有已認證用戶讀取批次操作記錄
DROP POLICY IF EXISTS "Allow authenticated read batch ops" ON calendar_batch_operations;
CREATE POLICY "Allow authenticated read batch ops"
ON calendar_batch_operations FOR SELECT
TO authenticated
USING (true);

-- 允許所有已認證用戶寫入批次操作記錄
DROP POLICY IF EXISTS "Allow authenticated write batch ops" ON calendar_batch_operations;
CREATE POLICY "Allow authenticated write batch ops"
ON calendar_batch_operations FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- 初始測試資料（可選）
-- ============================================

-- 範例：設定未來某日為休場
INSERT INTO operational_calendar (date, status, closure_reason, notes)
VALUES ('2026-03-15', 'closed', '球場維護', '9號洞草皮更新作業')
ON CONFLICT (date) DO NOTHING;

-- 範例：設定假日自定義開始時間
INSERT INTO operational_calendar (date, status, custom_start_time, notes)
VALUES ('2026-04-05', 'normal', '05:00:00', '清明連假提早營業')
ON CONFLICT (date) DO NOTHING;

-- 範例：設定臨時關閉
INSERT INTO operational_calendar (date, status, closure_reason, notes)
VALUES ('2026-03-20', 'emergency_closed', '天氣因素', '颱風警報，臨時關閉')
ON CONFLICT (date) DO NOTHING;

-- ✅ Migration 完成
-- 營運日曆表已建立，可以開始開發前後端功能
