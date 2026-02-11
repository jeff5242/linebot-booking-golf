-- 為 waitlist 表格新增 peak_type 欄位
-- 用於記錄候補的尖峰時段類型

ALTER TABLE waitlist
ADD COLUMN IF NOT EXISTS peak_type text
CHECK (peak_type IN ('peak_a', 'peak_b', NULL));

-- 為 peak_type 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_waitlist_peak_type ON waitlist(peak_type);

-- 建立複合索引：日期 + 尖峰類型 + 狀態
CREATE INDEX IF NOT EXISTS idx_waitlist_date_peak_status
ON waitlist(date, peak_type, status);

-- 註解說明
COMMENT ON COLUMN waitlist.peak_type IS '候補的尖峰時段類型：peak_a (早場) 或 peak_b (午場)';
