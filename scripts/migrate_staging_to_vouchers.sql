-- ============================================================
-- 步驟 1：先檢查暫存資料（驗證用，不會修改任何東西）
-- ============================================================

-- 查看各分頁統計
SELECT sheet_name, COUNT(*) as total,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN status = 'imported' THEN 1 ELSE 0 END) as imported
FROM vouchers_staging
GROUP BY sheet_name
ORDER BY sheet_name;

-- 查看手機號碼格式異常的資料（非 09 開頭或非 10 碼）
SELECT id, phone, customer_name, sheet_name
FROM vouchers_staging
WHERE status = 'pending'
  AND (phone !~ '^09\d{8}$')
ORDER BY sheet_name, id;

-- 查看有沒有重複資料（同分頁+同單據編號）
SELECT doc_number, COUNT(*) as cnt
FROM vouchers_staging
WHERE status = 'pending'
GROUP BY doc_number
HAVING COUNT(*) > 1;


-- ============================================================
-- 步驟 2：確認無誤後，執行以下 SQL 搬到正式表
--         （請逐段執行，不要一次全跑）
-- ============================================================

-- 2a. 先為不存在的客戶建立 users 記錄
INSERT INTO users (phone, display_name)
SELECT DISTINCT vs.phone, vs.customer_name
FROM vouchers_staging vs
WHERE vs.status = 'pending'
  AND vs.phone ~ '^09\d{8}$'
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.phone = vs.phone
  )
ON CONFLICT (phone) DO NOTHING;

-- 2b. 將暫存資料寫入 vouchers 正式表
INSERT INTO vouchers (
  code, product_id, product_name, user_id, status, source_type,
  original_paper_code, valid_from, valid_until,
  purchase_date, price, created_at
)
SELECT
  'EV-' || LPAD(FLOOR(RANDOM() * 999999)::text, 6, '0') || '-' || LPAD(FLOOR(RANDOM() * 9999)::text, 4, '0'),
  0,  -- product_id NOT NULL，紙券轉入無對應商品，補 0（與 UI 匯入路徑一致）
  vs.product_name,
  u.id,
  'active',
  'paper_converted',
  vs.invoice_number,
  vs.purchase_date,
  vs.purchase_date + INTERVAL '365 days',
  vs.purchase_date,
  vs.product_amount,
  now()
FROM vouchers_staging vs
JOIN users u ON u.phone = vs.phone
WHERE vs.status = 'pending'
  AND vs.phone ~ '^09\d{8}$';

-- 2c. 標記暫存表已匯入
UPDATE vouchers_staging
SET status = 'imported'
WHERE status = 'pending'
  AND phone ~ '^09\d{8}$';

-- 2d. 標記手機格式異常的為 skipped
UPDATE vouchers_staging
SET status = 'skipped', review_note = '手機號碼格式異常'
WHERE status = 'pending'
  AND phone !~ '^09\d{8}$';


-- ============================================================
-- 步驟 3：驗證匯入結果
-- ============================================================

-- 確認正式表新增數量
SELECT source_type, status, COUNT(*)
FROM vouchers
WHERE source_type = 'paper_converted'
GROUP BY source_type, status;

-- 確認暫存表狀態
SELECT status, COUNT(*) FROM vouchers_staging GROUP BY status;
