-- 建立果嶺券匯入暫存表
CREATE TABLE IF NOT EXISTS vouchers_staging (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sheet_name text,              -- 來源分頁名稱
  purchase_date date,           -- 購買日期（已轉西元）
  doc_number text,              -- 單據編號
  phone text,                   -- 客戶編號（手機）
  customer_name text,           -- 客戶全稱
  sales_person text,            -- 業務人員
  invoice_number text,          -- 發票號碼
  product_amount numeric,       -- 產品金額
  tax_amount numeric,           -- 含稅金額
  memo text,                    -- 分錄備註（張數/票號等）
  net_amount numeric,           -- 本幣金額
  product_name text,            -- 解析出的產品名稱
  unit_price numeric,           -- 解析出的單價
  quantity integer,             -- 解析出的張數
  ticket_range text,            -- 解析出的票號範圍
  status text DEFAULT 'pending', -- pending / reviewed / imported / skipped
  review_note text,             -- 檢查備註
  created_at timestamptz DEFAULT now()
);

-- 開放 service_role 存取
ALTER TABLE vouchers_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON vouchers_staging FOR ALL USING (true) WITH CHECK (true);
